import { withDiagnostics, setDiagnosticStage } from "@/lib/server/diagnostics";
import { randomUUID } from "node:crypto";
import { accountInputSchema } from "@/lib/account-types";
import { database } from "@/lib/server/database";
import { failure, guardOrigin, json, readJson } from "@/lib/server/http";
import { ApiError } from "@/lib/server/errors";
import {
  hashPassword,
  verifyPassword,
  makeSession,
  makeRecoveryCode,
  matchesRecovery,
  recoveryHash,
} from "@/lib/server/auth/crypto";
import {
  accountToken,
  currentAccount,
  databaseFailure,
  revokeSession,
  setAccountCookie,
  SESSION_SECONDS,
} from "@/lib/server/auth/session";
import {
  limitAuthAttempt,
  AccountRateLimit,
} from "@/lib/server/auth/rate-limit";

export const runtime = "nodejs";
export async function GET(req: Request) {
  return withDiagnostics("auth.session.get", async () => {
    try {
      setDiagnosticStage("authenticate");
      const user = await currentAccount(req);
      const response = json({ user });
      if (!user && accountToken(req)) setAccountCookie(response, req, "", 0);
      return response;
    } catch (error) {
      return failure(error);
    }
  });
}

export async function POST(req: Request) {
  return withDiagnostics("auth.session.post", async () => {
    try {
      setDiagnosticStage("origin");
      guardOrigin(req);
      const inputBody = await readJson(req, 2048);
      setDiagnosticStage("validate");
      const parsed = accountInputSchema.safeParse(inputBody);
      if (!parsed.success)
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message || "입력 내용을 확인해 주세요.",
        );
      const input = parsed.data;
      if (input.action === "logout") {
        await revokeSession(req);
        const response = json({ user: null });
        setAccountCookie(response, req, "", 0);
        return response;
      }
      await limitAuthAttempt(req, input.action, input.username);
      const client = database();
      const session = makeSession();
      const expiresAt = new Date(
        Date.now() + SESSION_SECONDS * 1000,
      ).toISOString();
      let user: { id: string; username: string };
      let recoveryCode: string | undefined;
      if (input.action === "signup") {
        user = { id: randomUUID(), username: input.username };
        recoveryCode = makeRecoveryCode();
        setDiagnosticStage("register");
        const { error } = await client.rpc("feynloop_register_account", {
          p_id: user.id,
          p_username: user.username,
          p_password_hash: await hashPassword(input.password),
          p_recovery_hash: recoveryHash(recoveryCode),
          p_token_hash: session.hash,
          p_expires_at: expiresAt,
        });
        if (error?.code === "23505")
          throw new ApiError(
            409,
            "이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.",
          );
        if (error) throw databaseFailure(error, "register");
      } else {
        setDiagnosticStage("find-account");
        const { data: account, error } = await client
          .from("feynloop_accounts")
          .select("id,username,password_hash,recovery_hash")
          .eq("username", input.username)
          .maybeSingle();
        if (error) throw databaseFailure(error, "find-account");
        if (input.action === "login") {
          setDiagnosticStage("authenticate");
          const valid = await verifyPassword(
            input.password,
            account?.password_hash,
          );
          if (!account || !valid)
            throw new ApiError(401, "아이디 또는 비밀번호를 확인해 주세요.");
          setDiagnosticStage("create-session");
          const saved = await client.from("feynloop_sessions").insert({
            token_hash: session.hash,
            account_id: account.id,
            expires_at: expiresAt,
          });
          if (saved.error) throw databaseFailure(saved.error, "create-session");
        } else {
          if (
            !account ||
            !matchesRecovery(input.recoveryCode, account.recovery_hash)
          )
            throw new ApiError(401, "아이디 또는 복구코드를 확인해 주세요.");
          recoveryCode = makeRecoveryCode();
          setDiagnosticStage("recover");
          const updated = await client.rpc("feynloop_recover_account", {
            p_id: account.id,
            p_expected_recovery_hash: account.recovery_hash,
            p_password_hash: await hashPassword(input.password),
            p_recovery_hash: recoveryHash(recoveryCode),
            p_token_hash: session.hash,
            p_expires_at: expiresAt,
          });
          if (updated.error) throw databaseFailure(updated.error, "recover");
          if (!updated.data)
            throw new ApiError(
              401,
              "이미 사용된 복구코드예요. 새 복구코드를 확인해 주세요.",
            );
        }
        user = { id: account.id, username: account.username };
      }
      // 로그인마다 새 세션을 발급하며 이전 브라우저 세션은 폐기합니다.
      await revokeSession(req);
      const response = json(
        { user, ...(recoveryCode ? { recoveryCode } : {}) },
        undefined,
        input.action === "signup" ? 201 : 200,
      );
      setAccountCookie(response, req, session.token);
      return response;
    } catch (error) {
      const response = failure(error);
      if (error instanceof AccountRateLimit)
        response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
  });
}
