"use client";
import { Sparkles, FlaskConical, CheckCircle2, LogIn } from "lucide-react";
import type { AppConfiguration, LearningMode } from "@/lib/types";
import { Button } from "./ui/button";
type Props = {
  configuration: AppConfiguration | null;
  mode: LearningMode;
  signedIn: boolean;
  busy: boolean;
  onSelect: (mode: LearningMode) => void;
  onLogin: () => void;
};
export default function LearningModeChoice({
  configuration,
  mode,
  signedIn,
  busy,
  onSelect,
  onLogin,
}: Props) {
  const configured = Boolean(
    configuration && Object.values(configuration.readiness).every(Boolean),
  );
  const needsLogin = mode === "live" && !signedIn;
  return (
    <section className="learning-mode-choice" aria-label="학습 방식 선택">
      <div className="mode-heading">
        <div>
          <h2>어떤 방식으로 시작할까요?</h2>
          <p>실제 Gemini 학습과 데모 체험을 선택할 수 있어요.</p>
        </div>
        <span className="setup-status">
          {configuration
            ? configured
              ? "Gemini·계정 저장 설정됨"
              : "설정 확인 필요"
            : "설정 상태 확인 중"}
        </span>
      </div>
      <div className="mode-options" role="group" aria-label="학습 방식">
        <button
          aria-pressed={mode === "demo"}
          disabled={
            busy ||
            Boolean(configuration && !configuration.demoAllowed && !signedIn)
          }
          className={`mode-option ${mode === "demo" ? "chosen" : ""}`}
          onClick={() => onSelect("demo")}
        >
          <FlaskConical size={21} />
          <div>
            <strong>데모 체험</strong>
            <span>실제 AI 호출 없이 학습 과정을 연습해요.</span>
          </div>
          {mode === "demo" && <CheckCircle2 size={18} />}
        </button>
        <button
          aria-pressed={mode === "live"}
          disabled={busy || !configured}
          className={`mode-option ${mode === "live" ? "chosen" : ""}`}
          onClick={() => onSelect("live")}
        >
          <Sparkles size={21} />
          <div>
            <strong>실제 Gemini 학습</strong>
            <span>문서에서 개념을 분석하고 맞춤 질문을 받아요.</span>
          </div>
          {mode === "live" && <CheckCircle2 size={18} />}
        </button>
      </div>
      {mode === "live" ? (
        <div className="mode-explanation">
          <p>
            PDF 업로드·예제 분석 또는 학습 설명·답변 제출 시 실제 Gemini 요청이
            발생합니다. 문서와 설명은 Google로 전송되며 계정의 사용 한도가
            적용됩니다.
          </p>
          {needsLogin && (
            <Button variant="outline" disabled={busy} onClick={onLogin}>
              <LogIn size={15} />
              로그인하고 Gemini 학습 준비
            </Button>
          )}
        </div>
      ) : (
        <p className="mode-explanation">
          데모에서는 실제 이해도를 평가하지 않습니다. Gemini 키가 있어도 데모를
          선택하면 AI 요청을 보내지 않아요.
        </p>
      )}
      {configuration && !configured && (
        <p className="mode-setup-note">
          {!configuration.readiness.gemini
            ? "Gemini 키 설정을 확인해 주세요. "
            : ""}
          {!configuration.readiness.authentication ||
          !configuration.readiness.storage
            ? "계정 로그인·저장 설정을 확인해 주세요. "
            : ""}
          설정을 변경했다면 서버를 재시작해 주세요.
        </p>
      )}
    </section>
  );
}
