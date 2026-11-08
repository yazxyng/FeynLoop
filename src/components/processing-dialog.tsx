"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ProcessingDialog({ message }: { message: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      clearInterval(timer);
      element?.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="processing-dialog"
      aria-labelledby="processing-title"
      aria-describedby="processing-description"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="processing-icon">
        <Loader2 className="spin" size={30} />
      </div>
      <p className="processing-eyebrow">FEYNLOOP</p>
      <h2 id="processing-title">조금만 기다려 주세요</h2>
      <p role="status">{message}</p>
      <div className="processing-time" aria-hidden="true">
        {elapsed}초 경과
      </div>
      <p id="processing-description" className="processing-help">
        {elapsed >= 30
          ? "평소보다 응답이 늦어지고 있어요. 완료되면 결과를 보여드리고, 실패하면 이유를 알려드릴게요."
          : "요청을 처리하고 있어요. 완료되면 자동으로 결과 화면이 열려요."}
      </p>
      <small>
        창을 닫거나 같은 요청을 다시 보내지 말고 잠시 기다려 주세요.
      </small>
    </dialog>
  );
}
