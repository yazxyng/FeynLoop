import { validRequestId } from "@/lib/request-error";
import { X } from "lucide-react";

type Props = {
  error?: string;
  requestId?: string;
  notice?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
};
// 작업한 영역 안에서만 안내합니다. 페이지 상단을 밀어내는 배너는 사용하지 않습니다.
export default function InlineFeedback({
  error,
  requestId,
  notice,
  onDismiss,
  onRetry,
}: Props) {
  const message = error || notice;
  if (!message) return null;
  return (
    <div
      className={`inline-feedback ${error ? "has-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="feedback-dismiss"
          aria-label="안내 닫기"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      )}
      {error && <ErrorReference requestId={requestId} />}
    </div>
  );
}

export function ErrorReference({ requestId }: { requestId?: string }) {
  if (!validRequestId(requestId)) return null;
  return (
    <details className="error-reference">
      <summary>오류 번호 보기</summary>
      <code>{requestId}</code>
    </details>
  );
}
