export type AuthLimitScope = "email" | "request";

// 앱의 재시도 간격입니다. Supabase의 실제 제한이 풀리는 시간은 더 길 수 있습니다.
export const AUTH_RETRY_COOLDOWN_SECONDS = 60;

export class AuthRateLimitError extends Error {
  constructor(public scope: AuthLimitScope) {
    super(
      scope === "email"
        ? "인증 메일 발송 한도에 도달했어요. 기본 메일 서비스는 프로젝트 전체에서 시간당 2통으로 제한됩니다. 기존 메일을 확인하거나 한도가 풀린 뒤 다시 요청해 주세요. 비밀번호를 이미 설정했다면 로그인 화면을 이용해 주세요."
        : "로그인·인증 요청이 잠시 제한됐어요. 연속으로 누르지 말고 잠시 후 다시 시도해 주세요. 앱의 대기 시간이 끝나도 서버 제한은 더 오래 유지될 수 있어요.",
    );
    this.name = "AuthRateLimitError";
  }
}

export function authRateLimit(error: { code?: string; status?: number }) {
  if (error.code === "over_email_send_rate_limit") {
    return new AuthRateLimitError("email");
  }
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return new AuthRateLimitError("request");
  }
  return null;
}
