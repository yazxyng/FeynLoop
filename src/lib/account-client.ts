import { z } from "zod";
import { accountUserSchema, type AccountUser } from "./account-types";

export type AccountResult = { user: AccountUser | null; recoveryCode?: string };
export class AccountRequestError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

const responseSchema = z.object({
  user: accountUserSchema.nullable(),
  recoveryCode: z
    .string()
    .regex(/^FYN-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/)
    .optional(),
});

// 탭 간 상태 알림은 보조 기능입니다. 브라우저가 막더라도 이미 성공한 인증을 실패로 바꾸지 않습니다.
function notifyAccountChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("feynloop:account-changed"));
  } catch {}
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("feynloop-auth");
      channel.postMessage("changed");
    }
  } catch {
  } finally {
    try {
      channel?.close();
    } catch {}
  }
}
export async function accountRequest(
  action?: string,
  fields: Record<string, string> = {},
): Promise<AccountResult> {
  try {
    const response = await fetch("/api/auth/session", {
      method: action ? "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(30_000),
      ...(action
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...fields }),
          }
        : {}),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
      )
        throw error;
      throw new AccountRequestError(
        "로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "로그인 요청을 처리하지 못했습니다.";
      const retry = Number(response.headers.get("Retry-After"));
      throw new AccountRequestError(
        message,
        response.status === 429
          ? Number.isFinite(retry) && retry > 0
            ? Math.ceil(retry)
            : 60
          : 0,
      );
    }
    const parsed = responseSchema.safeParse(data);
    if (
      !parsed.success ||
      (action && action !== "logout" && !parsed.data.user) ||
      (action === "logout" && parsed.data.user !== null) ||
      (["signup", "recover"].includes(action || "") &&
        !parsed.data.recoveryCode)
    )
      throw new AccountRequestError(
        "로그인 응답을 확인하지 못했습니다. 입력 내용은 유지돼요.",
      );
    if (action) notifyAccountChanged();
    return parsed.data;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "응답이 늦어지고 있어요. 가입 요청이었다면 먼저 같은 아이디로 로그인을 확인해 주세요."
        : "로그인 서버에 연결하지 못했어요. 연결 상태를 확인해 주세요.",
    );
  }
}
