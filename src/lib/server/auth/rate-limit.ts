import { database } from "../database";
import { ApiError } from "../errors";
import { secretHash } from "./crypto";
import { databaseFailure } from "./session";

export class AccountRateLimit extends ApiError {
  constructor(public retryAfter: number) {
    super(
      429,
      "로그인 요청이 잠시 제한됐어요. 표시된 대기 시간 후 다시 시도해 주세요.",
    );
  }
}
export async function limitAuthAttempt(
  req: Request,
  action: string,
  username: string,
) {
  // 임의의 X-Forwarded-For를 믿지 않습니다. 신뢰할 수 있는 프록시에서만 별도 활성화합니다.
  const ip =
    process.env.NETLIFY === "true"
      ? req.headers.get("x-nf-client-connection-ip")
      : process.env.FEYNLOOP_TRUST_PROXY === "true"
        ? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
        : null;
  const rules = [
    {
      key: `${action}:network:${ip || "shared"}`,
      limit: action === "signup" ? 20 : 100,
    },
    { key: `${action}:username:${username}`, limit: 8 },
  ];
  for (const rule of rules) {
    const { data, error } = await database().rpc("feynloop_auth_attempt", {
      p_key: secretHash(rule.key),
      p_limit: rule.limit,
      p_window_seconds: 900,
    });
    if (error || typeof data !== "number") throw databaseFailure();
    if (data > 0) throw new AccountRateLimit(data);
  }
}
