import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

// 헤더뿐 아니라 응답 본문을 읽는 동안에도 저장소·인증 연결 시간을 제한합니다.
export const boundedServiceFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  });

// Supabase는 서버 전용 DB·파일 저장소로 사용합니다. 이 키는 브라우저에 보내지 않습니다.
export function database() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key)
    throw new ApiError(503, "서버 데이터베이스 설정이 필요합니다.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: boundedServiceFetch },
  });
}
