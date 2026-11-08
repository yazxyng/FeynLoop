import type { AccountProfile } from "./profile-types";
import { AccountRequestError } from "./account-client";

export async function profileRequest(
  body?: Record<string, string>,
): Promise<{ profile?: AccountProfile; saved?: boolean }> {
  const response = await fetch("/api/account/profile", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new AccountRequestError(
      result.error || "계정 정보를 불러오지 못했습니다.",
      response.status === 429
        ? Number(response.headers.get("Retry-After")) || 60
        : 0,
    );
  return result;
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
