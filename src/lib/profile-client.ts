import type { AccountProfile } from "./profile-types";
import { AccountRequestError } from "./account-client";

export async function profileRequest(
  body?: Record<string, string>,
): Promise<{ profile?: AccountProfile; saved?: boolean }> {
  try {
    const response = await fetch("/api/account/profile", {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(30_000),
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const result = await response.json().catch(() => {
      throw new AccountRequestError(
        "계정 서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    });
    if (!response.ok)
      throw new AccountRequestError(
        typeof result?.error === "string"
          ? result.error
          : "계정 정보를 불러오지 못했습니다.",
        response.status === 429
          ? Number(response.headers.get("Retry-After")) || 60
          : 0,
      );
    if (
      !result ||
      typeof result !== "object" ||
      (!result.profile && result.saved !== true)
    )
      throw new AccountRequestError("계정 정보를 확인하지 못했어요.");
    return result;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "계정 요청 응답이 늦어지고 있어요. 저장 상태를 확인한 뒤 다시 시도해 주세요."
        : "계정 서버에 연결하지 못했어요. 연결 상태를 확인해 주세요.",
    );
  }
}

export async function importLegacyRecords() {
  const { supabase } = await import("./supabase");
  if (!supabase) throw new Error("이전 계정 확인 설정이 필요합니다.");
  const { data } = await supabase.auth.getSession();
  if (!data.session)
    throw new Error(
      "이 브라우저에 이전 로그인 상태가 남아 있지 않아 소유자를 확인할 수 없어요. 이전 기록은 그대로 보존됩니다.",
    );
  const response = await fetch("/api/auth/import-legacy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: data.session.access_token }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "이전 기록을 가져오지 못했습니다.");
  return result.imported as number;
}
