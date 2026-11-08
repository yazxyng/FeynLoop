import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type Auth = SupabaseClient["auth"];
export type PasswordAuth = Pick<
  Auth,
  "signInWithPassword" | "signUp" | "resetPasswordForEmail" | "updateUser"
>;
function address(value: string) {
  const result = z.email().safeParse(value.trim());
  if (!result.success) throw new Error("이메일 주소를 확인해 주세요.");
  return result.data;
}
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8 || password.length > 72)
    throw new Error("비밀번호는 8~72자로 입력해 주세요.");
  if (password !== confirmation) throw new Error("비밀번호가 서로 다릅니다.");
}
function failure(error: { code?: string; status?: number } | null) {
  if (!error) return;
  if (error.status === 429)
    throw new Error("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
  if (error.code === "invalid_credentials")
    throw new Error(
      "이메일 또는 비밀번호를 확인해 주세요. 예전에 인증번호로 가입했다면 ‘비밀번호 재설정하기’를 이용해 주세요.",
    );
  if (error.code === "email_not_confirmed")
    throw new Error(
      "가입 확인 메일의 인증번호로 이메일 인증을 먼저 완료해 주세요.",
    );
  if (error.code === "weak_password")
    throw new Error(
      "더 안전한 비밀번호를 사용해 주세요. 서버의 비밀번호 정책을 확인해 주세요.",
    );
  if (error.code === "same_password")
    throw new Error("현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.");
  if (["signup_disabled", "email_provider_disabled"].includes(error.code || ""))
    throw new Error(
      "현재 이메일 가입·로그인을 사용할 수 없습니다. 인증 설정을 확인해 주세요.",
    );
  throw new Error(
    "인증 요청을 처리하지 못했습니다. 입력 내용과 연결 상태를 확인해 주세요.",
  );
}
async function request<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    throw new Error(
      "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
export async function loginWithPassword(
  auth: PasswordAuth,
  email: string,
  password: string,
) {
  const normalized = address(email);
  if (!password) throw new Error("비밀번호를 입력해 주세요.");
  const result = await request(() =>
    auth.signInWithPassword({ email: normalized, password }),
  );
  failure(result.error);
  if (!result.data.session)
    throw new Error("로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.");
}
export async function registerWithPassword(
  auth: PasswordAuth,
  email: string,
  password: string,
  confirmation: string,
) {
  const normalized = address(email);
  validateNewPassword(password, confirmation);
  const result = await request(() =>
    auth.signUp({ email: normalized, password }),
  );
  failure(result.error);
  return { email: normalized, confirmed: Boolean(result.data.session) };
}
export async function requestPasswordReset(
  auth: PasswordAuth,
  email: string,
  redirectTo: string,
) {
  const normalized = address(email);
  const result = await request(() =>
    auth.resetPasswordForEmail(normalized, { redirectTo }),
  );
  failure(result.error);
}
export async function saveNewPassword(
  auth: PasswordAuth,
  password: string,
  confirmation: string,
) {
  validateNewPassword(password, confirmation);
  const result = await request(() => auth.updateUser({ password }));
  failure(result.error);
  if (!result.data.user)
    throw new Error("비밀번호를 저장하지 못했습니다. 다시 시도해 주세요.");
}
