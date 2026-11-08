import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { currentAccount, databaseFailure } from "@/lib/server/auth/session";
import { limitAuthAttempt } from "@/lib/server/auth/rate-limit";
import { database } from "@/lib/server/database";
import { guardOrigin, readJson, json, failure } from "@/lib/server/http";
import { ApiError } from "@/lib/server/errors";

export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const account = await currentAccount(req);
    if (!account) throw new ApiError(401, "새 아이디로 먼저 로그인해 주세요.");
    await limitAuthAttempt(req, "import", account.username);
    const { token } = z
      .object({ token: z.string().min(1).max(8192) })
      .strict()
      .parse(await readJson(req, 10000));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new ApiError(503, "이전 계정 확인 설정이 필요합니다.");
    const legacy = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await legacy.auth.getUser(token);
    if (error || !data.user)
      throw new ApiError(
        401,
        "이전 로그인 상태를 확인하지 못했어요. 이전 계정 인증 없이 기록을 가져올 수는 없습니다.",
      );
    const imported = await database().rpc("feynloop_import_legacy", {
      p_account_id: account.id,
      p_legacy_id: data.user.id,
    });
    if (imported.error?.code === "23505")
      throw new ApiError(409, "이미 다른 새 계정에 연결된 이전 기록입니다.");
    if (imported.error) throw databaseFailure();
    return json({ imported: imported.data });
  } catch (error) {
    return failure(error);
  }
}
