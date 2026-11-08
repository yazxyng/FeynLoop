import type { AccountUser } from "./account-types";

export type AccountResult = { user: AccountUser | null; recoveryCode?: string };
export class AccountRequestError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export async function accountRequest(
  action?: string,
  fields: Record<string, string> = {},
): Promise<AccountResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/session", {
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
  } catch (error) {
    throw new AccountRequestError(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "응답이 늦어지고 있어요. 가입 요청이었다면 먼저 같은 아이디로 로그인을 확인해 주세요."
        : "로그인 서버에 연결하지 못했어요. 연결 상태를 확인해 주세요.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new AccountRequestError(
      data?.error || "로그인 요청을 처리하지 못했습니다.",
      response.status === 429
        ? Number(response.headers.get("Retry-After")) || 60
        : 0,
    );
  if (!data || !("user" in data))
    throw new AccountRequestError("로그인 응답을 확인하지 못했습니다.");
  if (action && typeof window !== "undefined") {
    window.dispatchEvent(new Event("feynloop:account-changed"));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("feynloop-auth");
      channel.postMessage("changed");
      channel.close();
    }
  }
  return data;
}
