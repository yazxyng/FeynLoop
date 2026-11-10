"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LockKeyhole, Loader2, KeyRound, X } from "lucide-react";
import { errorRequestId as diagnosticId } from "@/lib/request-error";
import { accountInputSchema } from "@/lib/account-types";
import InlineFeedback from "./inline-feedback";
import { accountRequest, AccountRequestError } from "@/lib/account-client";
import { Button } from "./ui/button";
import LoginFooter from "./auth/login-footer";
import PasswordField from "./auth/password-field";
import { LOGIN_COPY, USERNAME_HELP, type LoginStep } from "./auth/login-copy";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
  onStart?: () => void;
  presentation?: "dialog" | "page";
};
const COOLDOWN_KEY = "feynloop:account-retry-at";

export default function PasswordLogin({
  onClose,
  onSuccess,
  onStart,
  presentation = "dialog",
}: Props) {
  const [step, setStep] = useState<LoginStep>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState("");
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [errorMessage, setErrorText] = useState("");
  const [errorRequestId, setErrorRequestId] = useState<string>();
  function setErrorMessage(message: string) {
    setErrorText(message);
    setErrorRequestId(undefined);
  }
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const requestInProgress = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const copy = LOGIN_COPY[step];
  const isNewPassword = step !== "login";
  const remainingSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    setRetryAt(0);
    setNow(Date.now());
    try {
      const stored = Number(sessionStorage.getItem(`${COOLDOWN_KEY}:${step}`));
      if (Number.isFinite(stored)) setRetryAt(stored);
    } catch {}
    dialogRef.current
      ?.querySelector<HTMLInputElement>("input:not([disabled])")
      ?.focus();
  }, [step]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  function changeStep(next: LoginStep) {
    setStep(next);
    setPassword("");
    setConfirmation("");
    setRecoveryInput("");
    setErrorMessage("");
    setPasswordVisible(false);
  }
  async function handleSubmit() {
    if (requestInProgress.current || remainingSeconds > 0) return;
    if (isNewPassword && password !== confirmation) {
      setErrorMessage("비밀번호가 서로 다릅니다.");
      return;
    }
    const fields = {
      action: step,
      username,
      password,
      ...(step === "recover" ? { recoveryCode: recoveryInput } : {}),
    };
    const validated = accountInputSchema.safeParse(fields);
    if (!validated.success) {
      setErrorMessage(
        validated.error.issues[0]?.message || "입력 내용을 확인해 주세요.",
      );
      return;
    }
    onStart?.();
    requestInProgress.current = true;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await accountRequest(step, {
        username,
        password,
        ...(step === "recover" ? { recoveryCode: recoveryInput } : {}),
      });
      setPassword("");
      setConfirmation("");
      setRecoveryInput("");
      if (result.recoveryCode) setIssuedRecoveryCode(result.recoveryCode);
      else onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "로그인하지 못했습니다.",
      );
      setErrorRequestId(diagnosticId(error));
      if (error instanceof AccountRequestError && error.retryAfter > 0) {
        const until = Date.now() + error.retryAfter * 1000;
        setNow(Date.now());
        setRetryAt(until);
        try {
          sessionStorage.setItem(`${COOLDOWN_KEY}:${step}`, String(until));
        } catch {}
      }
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }
  // 키보드만으로도 창을 닫고, 창 안의 입력창과 버튼 사이를 이동할 수 있습니다.
  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !isBusy) {
      event.preventDefault();
      if (issuedRecoveryCode) onSuccess();
      else onClose();
    }
    if (presentation === "page" || event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input:not([disabled]),a[href]",
      ) || [],
    );
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <div
      className={
        presentation === "page" ? "login-page-content" : "modal-backdrop"
      }
    >
      <section
        className="modal password-login"
        ref={dialogRef}
        role={presentation === "dialog" ? "dialog" : undefined}
        aria-modal={presentation === "dialog" ? true : undefined}
        aria-labelledby="login-title"
        onKeyDown={handleDialogKeyDown}
      >
        {issuedRecoveryCode ? (
          <>
            <span className="login-symbol">
              <KeyRound size={24} />
            </span>
            <h2 id="login-title">복구코드를 보관해 주세요</h2>
            <p>
              비밀번호를 잊으면 이 코드로 다시 설정할 수 있어요. 지금 한 번만
              보여드리며, 코드를 잃어버리면 메일로 복구할 수 없어요. 새 코드가
              발급되면 이전 코드는 사용할 수 없어요.
            </p>
            <div className="recovery-code" aria-label="계정 복구코드">
              {issuedRecoveryCode}
            </div>
            <p>
              비밀번호 관리자나 본인만 볼 수 있는 안전한 곳에 복사해 보관해
              주세요.
            </p>
            <Button
              className="account-confirm-button"
              onClick={() => {
                setIssuedRecoveryCode("");
                onSuccess();
              }}
            >
              보관했어요 · 학습 시작
            </Button>
          </>
        ) : (
          <>
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
            <p>{copy.description}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <label htmlFor="account-username">아이디</label>
              <input
                id="account-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={4}
                maxLength={24}
                disabled={isBusy}
                placeholder="아이디를 입력해 주세요"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setErrorMessage("");
                }}
                aria-describedby="username-help"
              />
              <small id="username-help" className="account-input-help">
                {USERNAME_HELP}
              </small>
              {step === "recover" && (
                <>
                  <label htmlFor="account-recovery">복구코드</label>
                  <input
                    id="account-recovery"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    maxLength={100}
                    disabled={isBusy}
                    placeholder="FYN-으로 시작하는 가입 복구코드"
                    value={recoveryInput}
                    onChange={(event) => setRecoveryInput(event.target.value)}
                  />
                </>
              )}
              <PasswordField
                id="account-password"
                label={step === "recover" ? "새 비밀번호" : "비밀번호"}
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
              {isNewPassword && (
                <PasswordField
                  id="account-confirmation"
                  label="비밀번호 확인"
                  value={confirmation}
                  onChange={setConfirmation}
                  isVisible={isPasswordVisible}
                  isDisabled={isBusy}
                  isNewPassword
                  placeholder="한 번 더 입력해 주세요"
                />
              )}
              <Button disabled={isBusy || remainingSeconds > 0}>
                {isBusy ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    처리 중
                  </>
                ) : remainingSeconds > 0 ? (
                  `${remainingSeconds}초 후 다시 시도`
                ) : (
                  copy.submitLabel
                )}
              </Button>
              <InlineFeedback error={errorMessage} requestId={errorRequestId} />
            </form>
            <LoginFooter
              step={step}
              isBusy={isBusy}
              onChangeStep={changeStep}
              onClose={onClose}
              closeLabel={
                presentation === "page" ? "소개 화면으로 돌아가기" : undefined
              }
            />
          </>
        )}
      </section>
    </div>
  );
}
