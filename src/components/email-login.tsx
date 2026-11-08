"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, Loader2, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EMAIL_CODE_RESEND_SECONDS,
  EmailCodeError,
  sendEmailCode,
  verifyEmailCode,
  validEmailCode,
} from "@/lib/email-otp";
import { Button } from "./ui/button";

export default function EmailLogin({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(""),
    [sentEmail, setSentEmail] = useState(""),
    [token, setToken] = useState(""),
    [stage, setStage] = useState<"email" | "code">("email"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [seconds, setSeconds] = useState(0);
  const lock = useRef(false),
    dialogRef = useRef<HTMLElement>(null),
    emailRef = useRef<HTMLInputElement>(null),
    tokenRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    (stage === "email" ? emailRef : tokenRef).current?.focus();
  }, [stage]);
  useEffect(() => {
    if (!resendAt) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  function cooldown() {
    setSeconds(EMAIL_CODE_RESEND_SECONDS);
    setResendAt(Date.now() + EMAIL_CODE_RESEND_SECONDS * 1000);
  }
  async function requestCode(resend = false) {
    if (!supabase || lock.current || seconds > 0) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const address = await sendEmailCode(
        supabase.auth,
        resend ? sentEmail : email,
      );
      setSentEmail(address);
      setToken("");
      setStage("code");
      cooldown();
      setNotice(
        resend
          ? "인증번호를 다시 요청했습니다. 가장 최근에 받은 번호를 입력해 주세요."
          : "인증번호 발송을 요청했습니다. 메일함과 스팸함을 확인해 주세요.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "인증번호를 보내지 못했습니다.",
      );
      if (e instanceof EmailCodeError && e.rateLimited) cooldown();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!supabase || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await verifyEmailCode(supabase.auth, sentEmail, token);
      onSuccess();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "인증번호를 확인하지 못했습니다.",
      );
      if (e instanceof EmailCodeError && e.rateLimited) cooldown();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal email-login"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-login-title"
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
          {stage === "email" ? <Mail size={24} /> : <ShieldCheck size={24} />}
        </span>
        <h2 id="email-login-title">
          {stage === "email"
            ? "이메일로 간편하게 로그인"
            : "인증번호를 입력해 주세요"}
        </h2>
        <p>
          {supabase
            ? stage === "email"
              ? "이메일로 받은 인증번호를 입력하면 로그인할 수 있어요. 처음이라면 계정도 함께 만들어집니다."
              : `${sentEmail} 메일에 적힌 인증번호를 입력해 주세요. 링크를 누르지 않고 이 화면에서 로그인합니다.`
            : "지금은 계정 로그인을 사용할 수 없습니다. 데모로 학습하거나 로그인 설정을 확인해 주세요."}
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
        {supabase &&
          (stage === "email" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void requestCode();
              }}
            >
              <label htmlFor="login-email">이메일 주소</label>
              <input
                ref={emailRef}
                id="login-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={busy}
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button disabled={busy || seconds > 0}>
                {busy ? (
                  <>
                    <Loader2 className="spin" size={15} />
                    요청 중
                  </>
                ) : seconds > 0 ? (
                  `${seconds}초 후 다시 요청`
                ) : (
                  "인증번호 받기"
                )}
              </Button>
            </form>
          ) : (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void verify();
                }}
              >
                <label htmlFor="login-code">이메일 인증번호</label>
                <input
                  ref={tokenRef}
                  id="login-code"
                  className="code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  required
                  minLength={6}
                  maxLength={10}
                  pattern="[0-9]{6,10}"
                  disabled={busy}
                  placeholder="메일에 적힌 숫자"
                  value={token}
                  onChange={(event) =>
                    setToken(event.target.value.replace(/\s/g, ""))
                  }
                />
                <Button disabled={busy || !validEmailCode(token)}>
                  {busy ? (
                    <>
                      <Loader2 className="spin" size={15} />
                      확인 중
                    </>
                  ) : (
                    "확인하고 로그인"
                  )}
                </Button>
              </form>
              <div className="login-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || seconds > 0}
                  onClick={() => void requestCode(true)}
                >
                  {seconds > 0
                    ? `${seconds}초 후 재전송`
                    : "인증번호 다시 받기"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setStage("email");
                    setToken("");
                    setError("");
                    setNotice("");
                  }}
                >
                  <ArrowLeft size={13} />
                  이메일 수정
                </Button>
              </div>
              <small className="login-help">
                가장 최근에 받은 번호를 입력해 주세요. 메일에 링크만 보인다면
                이메일 템플릿 설정을 확인해 주세요.
              </small>
            </>
          ))}
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          학습 공간으로 돌아가기
        </Button>
      </section>
    </div>
  );
}
