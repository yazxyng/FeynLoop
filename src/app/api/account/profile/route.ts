import {
  profileInputSchema,
  type AccountProfile,
  type LearningDays,
} from "@/lib/profile-types";
import { activitySummary } from "@/lib/activity";
import {
  currentAccount,
  setAccountCookie,
  SESSION_SECONDS,
} from "@/lib/server/auth/session";
import {
  hashPassword,
  verifyPassword,
  makeSession,
} from "@/lib/server/auth/crypto";
import {
  AccountRateLimit,
  limitAuthAttempt,
} from "@/lib/server/auth/rate-limit";
import { database } from "@/lib/server/database";
import { guardOrigin, readJson, json, failure } from "@/lib/server/http";
import { listProjects } from "@/lib/server/store";
import { ApiError } from "@/lib/server/errors";

export const runtime = "nodejs";
function profileSetupError() {
  return new ApiError(
    503,
    "마이페이지 저장소 설정이 필요합니다. 20261108_profile.sql 실행 여부를 확인해 주세요.",
  );
}
export async function GET(req: Request) {
  try {
    const user = await currentAccount(req);
    if (!user) throw new ApiError(401, "로그인 후 내 정보를 확인할 수 있어요.");
    const result = await database()
      .from("feynloop_accounts")
      .select("nickname,created_at,plan_preference")
      .eq("id", user.id)
      .single();
    if (result.error) throw profileSetupError();
    const projects = await listProjects({
      owner: `account:${user.id}`,
      userId: user.id,
      account: true,
    });
    const days: LearningDays = {};
    let completedStudies = 0;
    for (const project of projects) {
      for (const [day, count] of Object.entries(project.activity || {})) {
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          Number.isSafeInteger(count) &&
          count > 0
        )
          days[day] = (days[day] || 0) + count;
      }
      for (const study of Object.values(project.studies))
        completedStudies +=
          (study.phase === "done" ? 1 : 0) +
          (study.archives || []).filter((entry) => entry.phase === "done")
            .length;
    }
    const summary = activitySummary(days);
    const profile: AccountProfile = {
      user: {
        ...user,
        nickname: result.data.nickname || user.username,
        createdAt: result.data.created_at,
      },
      plan: {
        current: "free",
        preference: result.data.plan_preference,
        billingAvailable: false,
      },
      learning: { days, ...summary, completedStudies },
    };
    return json({ profile });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const user = await currentAccount(req);
    if (!user)
      throw new ApiError(401, "로그인 후 계정 정보를 변경할 수 있어요.");
    const parsed = profileInputSchema.safeParse(await readJson(req, 2048));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || "입력 내용을 확인해 주세요.",
      );
    const input = parsed.data;
    await limitAuthAttempt(req, `profile_${input.action}`, user.username);
    const client = database();
    if (input.action === "password") {
      const stored = await client
        .from("feynloop_accounts")
        .select("password_hash")
        .eq("id", user.id)
        .single();
      if (stored.error) throw profileSetupError();
      if (
        !(await verifyPassword(
          input.currentPassword,
          stored.data.password_hash,
        ))
      )
        throw new ApiError(401, "현재 비밀번호를 확인해 주세요.");
      const session = makeSession();
      const changed = await client.rpc("feynloop_change_password", {
        p_id: user.id,
        p_expected_password_hash: stored.data.password_hash,
        p_password_hash: await hashPassword(input.password),
        p_token_hash: session.hash,
        p_expires_at: new Date(
          Date.now() + SESSION_SECONDS * 1000,
        ).toISOString(),
      });
      if (changed.error) throw profileSetupError();
      if (!changed.data)
        throw new ApiError(
          409,
          "비밀번호가 다른 곳에서 변경됐어요. 다시 로그인해 주세요.",
        );
      const response = json({ saved: true });
      setAccountCookie(response, req, session.token);
      return response;
    }
    const values =
      input.action === "nickname"
        ? { nickname: input.nickname }
        : { plan_preference: input.preference };
    const saved = await client
      .from("feynloop_accounts")
      .update(values)
      .eq("id", user.id)
      .select("id");
    if (saved.error || !saved.data?.length) throw profileSetupError();
    return json({ saved: true });
  } catch (error) {
    const response = failure(error);
    if (error instanceof AccountRateLimit)
      response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }
}
