import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

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
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          // 저장소 응답을 무한정 기다리며 화면이 멈추지 않도록 제한합니다.
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
            : AbortSignal.timeout(20_000),
        }),
    },
  });
}
