import { z } from "zod";

export const EMAIL_CODE_RESEND_SECONDS = 60;
export type EmailAuthIssue = {
  code?: string;
  status?: number;
  message?: string;
};
export type EmailOtpClient = {
  signInWithOtp: (input: {
    email: string;
    options: { shouldCreateUser: boolean };
  }) => Promise<{ error: EmailAuthIssue | null }>;
  verifyOtp: (input: {
    email: string;
    token: string;
    type: "email";
  }) => Promise<{
    data: { session: { access_token: string } | null };
    error: EmailAuthIssue | null;
  }>;
};
export class EmailCodeError extends Error {
  constructor(
    message: string,
    public rateLimited = false,
  ) {
    super(message);
    this.name = "EmailCodeError";
  }
}
function normalizedEmail(value: string) {
  const parsed = z.email().safeParse(value.trim());
  if (!parsed.success) throw new EmailCodeError("이메일 주소를 확인해 주세요.");
  return parsed.data;
}
function authFailure(error: EmailAuthIssue, verification = false): never {
  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code || "",
    )
  )
    throw new EmailCodeError(
      "요청이 너무 많습니다. 잠시 기다린 후 다시 시도해 주세요.",
      true,
    );
  if (
    verification &&
    ["otp_expired", "otp_invalid", "validation_failed"].includes(
      error.code || "",
    )
  )
    throw new EmailCodeError(
      "인증번호가 올바르지 않거나 만료됐습니다. 가장 최근에 받은 번호를 확인하거나 다시 요청해 주세요.",
    );
  if (
    [
      "signup_disabled",
      "email_provider_disabled",
      "email_address_not_authorized",
    ].includes(error.code || "")
  )
    throw new EmailCodeError(
      "이 이메일로 인증번호를 보내지 못했습니다. 이메일 로그인·가입 허용 및 메일 발송 설정을 확인해 주세요.",
    );
  throw new EmailCodeError(
    verification
      ? "인증번호를 확인하지 못했습니다. 번호와 네트워크 연결을 확인하고 다시 시도해 주세요."
      : "인증번호를 보내지 못했습니다. 이메일 주소와 네트워크 연결을 확인하고 다시 시도해 주세요.",
  );
}
export async function sendEmailCode(
  client: EmailOtpClient,
  email: string,
): Promise<string> {
  const address = normalizedEmail(email);
  let result;
  try {
    result = await client.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
  } catch {
    throw new EmailCodeError(
      "인증번호를 보내지 못했습니다. 네트워크 연결을 확인해 주세요.",
    );
  }
  if (result.error) authFailure(result.error);
  return address;
}
export function validEmailCode(token: string) {
  return /^\d{6,10}$/.test(token.replace(/\s/g, ""));
}
export async function verifyEmailCode(
  client: EmailOtpClient,
  email: string,
  token: string,
): Promise<void> {
  const address = normalizedEmail(email),
    code = token.replace(/\s/g, "");
  if (!validEmailCode(code))
    throw new EmailCodeError("메일에 적힌 숫자 인증번호를 입력해 주세요.");
  let result;
  try {
    result = await client.verifyOtp({
      email: address,
      token: code,
      type: "email",
    });
  } catch {
    throw new EmailCodeError(
      "인증번호를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.",
    );
  }
  if (result.error) authFailure(result.error, true);
  if (!result.data.session?.access_token)
    throw new EmailCodeError(
      "로그인 세션을 만들지 못했습니다. 인증번호를 다시 요청해 주세요.",
    );
}
