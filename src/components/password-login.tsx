"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LockKeyhole, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EmailCodeError,
  verifyEmailCode,
  validEmailCode,
} from "@/lib/email-otp";
import { AuthRateLimitError } from "@/lib/auth-rate-limit";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  saveNewPassword,
} from "@/lib/password-auth";
import { Button } from "./ui/button";
import LoginFooter from "./auth/login-footer";
import PasswordField from "./auth/password-field";
import { LOGIN_COPY, type LoginStep } from "./auth/login-copy";
import { useAuthCooldown } from "./auth/use-auth-cooldown";

type PasswordLoginProps = {
  onClose: () => void;
  onSuccess: () => void;
  recovery?: boolean;
};

export default function PasswordLogin({
  onClose,
  onSuccess,
  recovery = false,
}: PasswordLoginProps) {
  // 1. 화면 상태와 입력값
  const [step, setStep] = useState<LoginStep>(recovery ? "update" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const { startCooldown, remainingSeconds } = useAuthCooldown();
  const requestInProgress = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);

  const copy = LOGIN_COPY[step];
  const isNewPassword = step === "signup" || step === "update";
  const showPassword = step === "login" || isNewPassword;
  const cooldownSeconds = remainingSeconds(
    step === "signup" || step === "reset",
  );
  const isCoolingDown = cooldownSeconds > 0;
  const isConfirmationIncomplete =
    step === "confirm" && !validEmailCode(verificationCode);
  const submitDisabled = isBusy || isCoolingDown || isConfirmationIncomplete;
  const description = supabase
    ? copy.description.replace("{email}", email)
    : "로그인 설정이 필요합니다. 지금은 데모로 학습할 수 있어요.";
  const submitLabel = isCoolingDown
    ? `${cooldownSeconds}초 후 다시 시도`
    : copy.submitLabel;

  // 2. 포커스 이동과 메일 재전송 대기 시간
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    if (!recovery) return;
    setStep("update");
    setPassword("");
    setConfirmation("");
    setErrorMessage("");
    setNoticeMessage("");
  }, [recovery]);

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLInputElement>("input:not([disabled])")
      ?.focus();
  }, [step]);

  function changeStep(nextStep: LoginStep) {
    setStep(nextStep);
    setPassword("");
    setConfirmation("");
    setVerificationCode("");
    setErrorMessage("");
    setNoticeMessage("");
    setPasswordVisible(false);
  }

  // 3. 화면별 처리. Supabase 요청과 오류 변환은 lib/password-auth.ts에 있습니다.
  async function handleLogin() {
    if (!supabase) return;
    await loginWithPassword(supabase.auth, email, password);
    setPassword("");
    onSuccess();
  }

  async function handleSignup() {
    if (!supabase) return;
    const result = await registerWithPassword(
      supabase.auth,
      email,
      password,
      confirmation,
    );
    setEmail(result.email);
    setPassword("");
    setConfirmation("");
    if (result.confirmed) {
      onSuccess();
      return;
    }
    setStep("confirm");
    setNoticeMessage(
      "가입 확인 메일을 요청했어요. 메일에 적힌 인증번호를 입력해 주세요. 이메일 인증은 최초 가입 때만 필요해요.",
    );
  }

  async function handleConfirmation() {
    if (!supabase) return;
    await verifyEmailCode(supabase.auth, email, verificationCode);
    setVerificationCode("");
    onSuccess();
  }

  async function handleResetRequest() {
    if (!supabase || cooldownSeconds > 0) return;
    await requestPasswordReset(supabase.auth, email, window.location.origin);
    startCooldown("email");
    setNoticeMessage(
      "해당 이메일의 계정이 있다면 비밀번호 설정 메일이 도착해요. 메일의 링크를 열어 새 비밀번호를 설정해 주세요.",
    );
  }

  async function handlePasswordUpdate() {
    if (!supabase) return;
    await saveNewPassword(supabase.auth, password, confirmation);
    setPassword("");
    setConfirmation("");
    onSuccess();
  }

  async function handleSubmit() {
    if (!supabase || requestInProgress.current || submitDisabled) return;
    requestInProgress.current = true;
    setBusy(true);
    setErrorMessage("");
    setNoticeMessage("");
    try {
      switch (step) {
        case "login":
          await handleLogin();
          break;
        case "signup":
          await handleSignup();
          break;
        case "confirm":
          await handleConfirmation();
          break;
        case "reset":
          await handleResetRequest();
          break;
        case "update":
          await handlePasswordUpdate();
          break;
      }
    } catch (error) {
      if (error instanceof AuthRateLimitError) {
        startCooldown(error.scope);
      } else if (error instanceof EmailCodeError && error.rateLimited) {
        startCooldown("request");
      }
      setErrorMessage(
        error instanceof Error ? error.message : "인증을 완료하지 못했습니다.",
      );
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !isBusy) {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      ) || [],
    );
    const firstControl = controls[0];
    const lastControl = controls.at(-1);
    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      lastControl?.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl?.focus();
    }
  }

  // 4. 화면 배치. 하단 링크 배치는 auth/login-footer.tsx에서 수정합니다.
  return (
    <div className="modal-backdrop">
      <section
        className="modal password-login"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onKeyDown={handleDialogKeyDown}
      >
        <button
          className="modal-close"
          aria-label="닫기"
          disabled={isBusy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="login-symbol">
          <LockKeyhole size={24} />
        </span>
        <h2 id="login-title">{copy.title}</h2>
        <p>{description}</p>
        {errorMessage && (
          <div className="login-alert error" role="alert">
            {errorMessage}
          </div>
        )}
        {noticeMessage && (
          <div className="login-alert" role="status">
            {noticeMessage}
          </div>
        )}

        {supabase && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            {step !== "update" && (
              <>
                <label htmlFor="login-email">이메일</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={isBusy || step === "confirm"}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </>
            )}
            {showPassword && (
              <PasswordField
                id="login-password"
                label={isNewPassword ? "새 비밀번호" : "비밀번호"}
                value={password}
                onChange={setPassword}
                isVisible={isPasswordVisible}
                isDisabled={isBusy}
                isNewPassword={isNewPassword}
                placeholder={
                  isNewPassword
                    ? "8자 이상 입력해 주세요"
                    : "비밀번호를 입력해 주세요"
                }
                onToggleVisibility={() =>
                  setPasswordVisible(!isPasswordVisible)
                }
              />
            )}
            {isNewPassword && (
              <PasswordField
                id="login-confirmation"
                label="비밀번호 확인"
                value={confirmation}
                onChange={setConfirmation}
                isVisible={isPasswordVisible}
                isDisabled={isBusy}
                isNewPassword
                placeholder="한 번 더 입력해 주세요"
              />
            )}
            {step === "confirm" && (
              <>
                <label htmlFor="login-code">가입 확인 인증번호</label>
                <input
                  id="login-code"
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6,10}"
                  maxLength={10}
                  disabled={isBusy}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\s/g, ""))
                  }
                />
              </>
            )}
            <Button disabled={submitDisabled}>
              {isBusy ? (
                <>
                  <Loader2 className="spin" size={15} />
                  처리 중
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </form>
        )}
        <LoginFooter
          step={step}
          isBusy={isBusy}
          onChangeStep={changeStep}
          onClose={onClose}
        />
      </section>
    </div>
  );
}
