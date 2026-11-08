"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { verifyEmailCode, validEmailCode } from "@/lib/email-otp";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  saveNewPassword,
} from "@/lib/password-auth";
import { Button } from "./ui/button";
type Stage = "login" | "signup" | "confirm" | "reset" | "update";
export default function PasswordLogin({
  onClose,
  onSuccess,
  recovery = false,
}: {
  onClose: () => void;
  onSuccess: () => void;
  recovery?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(recovery ? "update" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const lock = useRef(false),
    dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    if (recovery) {
      setStage("update");
      setPassword("");
      setConfirmation("");
      setError("");
      setNotice("");
    }
  }, [recovery]);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [stage]);
  useEffect(() => {
    if (!resendAt) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  function change(next: Stage) {
    setStage(next);
    setPassword("");
    setConfirmation("");
    setToken("");
    setError("");
    setNotice("");
    setVisible(false);
  }
  async function submit() {
    if (!supabase || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (stage === "login") {
        await loginWithPassword(supabase.auth, email, password);
        setPassword("");
        onSuccess();
      } else if (stage === "signup") {
        const result = await registerWithPassword(
          supabase.auth,
          email,
          password,
          confirmation,
        );
        setEmail(result.email);
        setPassword("");
        setConfirmation("");
        if (result.confirmed) onSuccess();
        else {
          setStage("confirm");
          setNotice(
            "가입 확인 메일을 요청했어요. 메일에 적힌 인증번호를 입력해 주세요. 이메일 인증은 최초 가입 때만 필요해요.",
          );
        }
      } else if (stage === "confirm") {
        await verifyEmailCode(supabase.auth, email, token);
        setToken("");
        onSuccess();
      } else if (stage === "reset") {
        if (seconds > 0) return;
        await requestPasswordReset(
          supabase.auth,
          email,
          window.location.origin,
        );
        setResendAt(Date.now() + 60000);
        setNotice(
          "해당 이메일의 계정이 있다면 비밀번호 설정 메일이 도착해요. 메일의 링크를 열어 새 비밀번호를 설정해 주세요.",
        );
      } else {
        await saveNewPassword(supabase.auth, password, confirmation);
        setPassword("");
        setConfirmation("");
        onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증을 완료하지 못했습니다.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const newPassword = stage === "signup" || stage === "update";
  const title = {
    login: "다시 만나 반가워요",
    signup: "나만의 학습 공간 만들기",
    confirm: "이메일을 확인해 주세요",
    reset: "비밀번호 설정·찾기",
    update: "새 비밀번호를 정해 주세요",
  }[stage];
  return (
    <div className="modal-backdrop">
      <section
        className="modal email-login password-login"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), a[href]",
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
        }}
      >
        <button
          className="modal-close"
          aria-label="닫기"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="login-symbol">
          <LockKeyhole size={24} />
        </span>
        <h2 id="login-title">{title}</h2>
        <p>
          {!supabase
            ? "로그인 설정이 필요합니다. 지금은 데모로 학습할 수 있어요."
            : stage === "login"
              ? "이메일과 비밀번호로 바로 로그인하세요. 이 브라우저에서는 로그인 상태가 유지돼요."
              : stage === "signup"
                ? "처음 한 번 이메일을 확인하면, 다음부터는 비밀번호로 로그인해요."
                : stage === "reset"
                  ? "전에 인증번호로 가입했어도 같은 이메일로 비밀번호를 만들 수 있어요. 기존 학습 기록은 그대로 유지돼요."
                  : stage === "confirm"
                    ? `${email} 메일의 인증번호를 입력해 주세요.`
                    : "다음부터는 메일을 받지 않고 이 비밀번호로 로그인할 수 있어요."}
        </p>
        {error && (
          <div className="login-alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="login-alert" role="status">
            {notice}
          </div>
        )}
        {supabase && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {stage !== "update" && (
              <>
                <label htmlFor="login-email">이메일</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={busy || stage === "confirm"}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </>
            )}
            {(stage === "login" || newPassword) && (
              <>
                <label htmlFor="login-password">
                  {newPassword ? "새 비밀번호" : "비밀번호"}
                </label>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      newPassword ? "new-password" : "current-password"
                    }
                    required
                    minLength={newPassword ? 8 : 1}
                    maxLength={72}
                    disabled={busy}
                    placeholder={
                      newPassword
                        ? "8자 이상 입력해 주세요"
                        : "비밀번호를 입력해 주세요"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
                    aria-pressed={visible}
                    disabled={busy}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}
            {newPassword && (
              <>
                <label htmlFor="login-confirmation">비밀번호 확인</label>
                <input
                  id="login-confirmation"
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  disabled={busy}
                  placeholder="한 번 더 입력해 주세요"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </>
            )}
            {stage === "confirm" && (
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
                  disabled={busy}
                  value={token}
                  onChange={(event) =>
                    setToken(event.target.value.replace(/\s/g, ""))
                  }
                />
              </>
            )}
            <Button
              disabled={
                busy ||
                (stage === "confirm" && !validEmailCode(token)) ||
                (stage === "reset" && seconds > 0)
              }
            >
              {busy ? (
                <>
                  <Loader2 className="spin" size={15} />
                  처리 중
                </>
              ) : (
                {
                  login: "로그인",
                  signup: "회원가입",
                  confirm: "인증하고 시작하기",
                  reset:
                    seconds > 0
                      ? `${seconds}초 후 재전송`
                      : "비밀번호 설정 메일 받기",
                  update: "비밀번호 저장",
                }[stage]
              )}
            </Button>
          </form>
        )}
        <div className="login-actions">
          {stage === "login" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => change("reset")}
              >
                비밀번호 설정·찾기
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => change("signup")}
              >
                처음이에요 · 회원가입
              </Button>
            </>
          ) : (
            stage !== "update" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => change("login")}
              >
                로그인으로 돌아가기
              </Button>
            )
          )}
        </div>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          학습 공간으로 돌아가기
        </Button>
      </section>
    </div>
  );
}
