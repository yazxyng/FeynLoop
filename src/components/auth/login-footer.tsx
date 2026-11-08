"use client";
import { LOGIN_LINKS, type LoginStep } from "./login-copy";

type LoginFooterProps = {
  step: LoginStep;
  isBusy: boolean;
  onChangeStep: (step: LoginStep) => void;
  onClose: () => void;
};

// 같은 .login-link 스타일을 사용해 모든 링크의 왼쪽 여백을 맞춥니다.
export default function LoginFooter({
  step,
  isBusy,
  onChangeStep,
  onClose,
}: LoginFooterProps) {
  return (
    <nav className="login-footer" aria-label="로그인 도움 메뉴">
      {step === "login" && (
        <div className="login-footer-row">
          <button
            className="login-link"
            type="button"
            disabled={isBusy}
            onClick={() => onChangeStep("recover")}
          >
            {LOGIN_LINKS.reset}
          </button>
          <button
            className="login-link"
            type="button"
            disabled={isBusy}
            onClick={() => onChangeStep("signup")}
          >
            {LOGIN_LINKS.signup}
          </button>
        </div>
      )}
      {step !== "login" && (
        <button
          className="login-link"
          type="button"
          disabled={isBusy}
          onClick={() => onChangeStep("login")}
        >
          {LOGIN_LINKS.login}
        </button>
      )}
      <button
        className="login-link"
        type="button"
        disabled={isBusy}
        onClick={onClose}
      >
        {LOGIN_LINKS.close}
      </button>
    </nav>
  );
}
