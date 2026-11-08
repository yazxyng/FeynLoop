"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";

type Props = {
  username: string;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onImported: () => void;
};
export default function AccountMenu({
  username,
  onClose,
  onLogout,
  onImported,
}: Props) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function importLegacy() {
    setBusy(true);
    setMessage("");
    try {
      // 이전 계정의 세션은 기록 이관 버튼을 누를 때만 확인합니다.
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) throw new Error("이전 계정 확인 설정이 필요합니다.");
      const { data } = await supabase.auth.getSession();
      if (!data.session)
        throw new Error(
          "이 브라우저에 이전 계정의 로그인 상태가 남아 있지 않아요. 소유자를 확인할 수 없어 기록을 자동 연결하지 않았습니다.",
        );
      const response = await fetch("/api/auth/import-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.session.access_token }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "이전 기록을 가져오지 못했습니다.");
      setMessage(
        `${result.imported}개의 학습 기록을 가져왔어요. 이전 기록은 보존됩니다.`,
      );
      onImported();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "기록을 가져오지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <button
          className="modal-close"
          aria-label="닫기"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h2 id="account-title">{username}님의 계정</h2>
        <p>
          아이디·비밀번호로 로그인 중이에요. 이전 이메일 계정의 로그인 상태가 이
          브라우저에 남아 있다면 학습 기록을 가져올 수 있어요.
        </p>
        {message && <p role="status">{message}</p>}
        <div className="account-menu-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void importLegacy()}
          >
            이전 학습 기록 가져오기
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onLogout();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "로그아웃하지 못했습니다.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            로그아웃
          </Button>
        </div>
      </section>
    </div>
  );
}
