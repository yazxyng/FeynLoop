import type { Identity } from "./http";
import { database } from "./database";
import { secretHash } from "./auth/crypto";
import { ApiError } from "./errors";

type Operation = "import" | "feedback";
const limits = {
  import: { count: 10, seconds: 900 },
  feedback: { count: 40, seconds: 900 },
};
const local = new Map<string, { attempts: number; expires: number }>();
class UsageLimit extends ApiError {
  constructor(public retryAfter: number) {
    super(
      429,
      "학습 요청이 잠시 많아졌어요. 잠시 후 다시 시도해 주세요. 작성한 내용은 유지돼요.",
    );
  }
}

/** 로그인 사용자는 DB에서 공유하며, 로컬 데모만 프로세스 내부 제한을 사용합니다. */
export async function limitUsage(id: Identity, operation: Operation) {
  const rule = limits[operation];
  const key = secretHash(`usage:${operation}:${id.owner}`);
  if (id.userId) {
    const { data, error } = await database().rpc("feynloop_auth_attempt", {
      p_key: key,
      p_limit: rule.count,
      p_window_seconds: rule.seconds,
    });
    if (error || !Number.isInteger(data) || data < 0)
      throw new ApiError(
        503,
        "학습 요청 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    if (data > 0) throw new UsageLimit(data);
    return;
  }
  const now = Date.now();
  for (const [entryKey, value] of local)
    if (value.expires <= now) local.delete(entryKey);
  if (!local.has(key) && local.size >= 2000) throw new UsageLimit(rule.seconds);
  const entry = local.get(key) || {
    attempts: 0,
    expires: now + rule.seconds * 1000,
  };
  entry.attempts++;
  local.set(key, entry);
  if (entry.attempts > rule.count)
    throw new UsageLimit(Math.max(1, Math.ceil((entry.expires - now) / 1000)));
}
