"use client";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isVisible: boolean;
  isDisabled: boolean;
  isNewPassword: boolean;
  placeholder: string;
  onToggleVisibility?: () => void;
};

// 입력창 모양은 globals.css의 .password-field에서 조정합니다.
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  isVisible,
  isDisabled,
  isNewPassword,
  placeholder,
  onToggleVisibility,
}: PasswordFieldProps) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          autoComplete={isNewPassword ? "new-password" : "current-password"}
          required
          minLength={isNewPassword ? 8 : 1}
          maxLength={128}
          disabled={isDisabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {onToggleVisibility && (
          <button
            type="button"
            aria-label={isVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            aria-pressed={isVisible}
            disabled={isDisabled}
            onClick={onToggleVisibility}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </>
  );
}
