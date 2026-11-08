"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Lightbulb,
  Loader2,
  Save,
} from "lucide-react";
import type { Concept, Project, Study } from "@/lib/types";
import { sourceReference } from "@/lib/presentation";
type Props = {
  project: Project;
  concept: Concept;
  study: Study;
  busy: boolean;
  typing: boolean;
  pendingMessage: string | null;
  statusMessage: string;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => void;
  onSave: () => void;
  onBack: () => void;
};
export default function StudyRoom({
  project,
  concept,
  study,
  busy,
  typing,
  pendingMessage,
  statusMessage,
  onDraft,
  onSubmit,
  onAction,
  onSave,
  onBack,
}: Props) {
  const latest = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const asking = study.phase === "questions";
  const reviewing = study.phase === "review";
  const rewriting = study.phase === "rewrite";
  const introduction = `${concept.title}에 대해 네가 이해한 대로 설명해 줄래? 처음 배우는 친구에게 말하듯이, 기억나는 만큼 편하게 말해 줘.`;
  useEffect(() => {
    latest.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [
    study.phase,
    study.turns.length,
    study.hints.length,
    study.evidence?.length,
    busy,
    pendingMessage,
  ]);
  useLayoutEffect(() => {
    if (composer.current) {
      composer.current.style.height = "auto";
      composer.current.style.height = `${Math.min(composer.current.scrollHeight, 160)}px`;
    }
  }, [study.draft, pendingMessage]);
  const phaseLabel = asking
    ? `질문 ${study.turns.length + 1} / 3`
    : reviewing
      ? "마지막 정리 준비"
      : rewriting
        ? "마지막 정리"
        : "대화 시작";
  return (
    <section className="deep-dive study-chat" aria-label="개념 학습 채팅">
      <header className="deep-toolbar">
        <button
          className="icon-button"
          disabled={busy}
          onClick={onBack}
          aria-label="개념 목록으로 돌아가기"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1>짝꿍 AI와 대화</h1>
          <p>{phaseLabel}</p>
        </div>
        <button className="text-button" disabled={busy} onClick={onBack}>
          나가기
        </button>
      </header>
      <div className="deep-topic">
        <span>
          주제 <strong>{concept.title}</strong>
        </span>
        <span className="deep-mode">
          <i />
          {project.mode === "demo" ? "데모" : "Gemini"}
        </span>
      </div>
      <div
        className="study-chat-log"
        role="log"
        aria-label="학습 대화"
        aria-live="polite"
      >
        <article className="deep-turn">
          <h2 className="chat-speaker">짝꿍 AI</h2>
          <p className="deep-bubble ai-bubble">{introduction}</p>
          {study.first && (
            <>
              <span className="sr-only">나의 첫 설명</span>
              <p className="deep-bubble user-bubble">{study.first}</p>
            </>
          )}
        </article>
        {study.turns.map((turn, i) => (
          <article className="deep-turn" key={i}>
            <h2 className="chat-speaker">짝꿍 AI · 질문 {i + 1}</h2>
            <p className="deep-bubble ai-bubble">{turn.question}</p>
            {turn.hints.map((hint, n) => (
              <p className="deep-bubble ai-bubble chat-hint" key={n}>
                힌트 {n + 1} · {hint}
              </p>
            ))}
            <span className="sr-only">나의 답변</span>
            <p className="deep-bubble user-bubble">{turn.answer}</p>
          </article>
        ))}
        <div className="deep-current">
          {asking && (
            <>
              <h2 className="chat-speaker">
                짝꿍 AI · 질문 {study.turns.length + 1}
              </h2>
              <p className="deep-bubble ai-bubble">
                {study.feedback?.question}
              </p>
              {study.hints.map((hint, n) => (
                <p className="deep-bubble ai-bubble chat-hint" key={n}>
                  힌트 {n + 1} · {hint}
                </p>
              ))}
              <button
                className="hint-button"
                disabled={busy || study.hints.length >= 2}
                onClick={() => onAction("hint")}
              >
                <Lightbulb size={16} />
                {study.hints.length >= 2
                  ? "힌트 두 개를 확인했어요"
                  : "힌트 질문 받기"}
              </button>
            </>
          )}
          {reviewing && (
            <>
              <h2 className="chat-speaker">짝꿍 AI</h2>
              <p className="deep-bubble ai-bubble">
                이제 이야기한 내용을 한 번 정리해 볼까? 필요하면 관련 근거를
                잠깐 확인해도 돼. 준비되면 아래 버튼을 눌러 줘.
              </p>
              <details className="chat-evidence">
                <summary>
                  <BookOpen size={15} />
                  필요할 때만 문서 근거 확인
                </summary>
                <div className="chat-evidence-actions">
                  {concept.pages.slice(0, 3).map((page) => (
                    <button
                      key={page}
                      disabled={
                        busy || study.evidenceViews.some((v) => v.page === page)
                      }
                      onClick={() => onAction("evidence", { page })}
                    >
                      관련 근거 · {sourceReference(project, page)}
                      {study.evidenceViews.some((v) => v.page === page)
                        ? " · 확인함"
                        : ""}
                    </button>
                  ))}
                </div>
                {study.evidence?.map((e) => (
                  <blockquote className="evidence-excerpt" key={e.page}>
                    <small>
                      문서 근거 · {sourceReference(project, e.page)}
                    </small>
                    <p>{e.text}</p>
                  </blockquote>
                ))}
                <p>
                  근거는 한 번에 최대 650자만 보여줘요. 마지막 정리를 시작하면
                  다시 숨겨져요.
                </p>
              </details>
              <button
                className="chat-continue"
                disabled={busy}
                onClick={() => onAction("rewrite")}
              >
                좋아, 내 말로 정리할게 <ArrowUp size={17} />
              </button>
            </>
          )}
          {rewriting && (
            <>
              <h2 className="chat-speaker">짝꿍 AI</h2>
              <p className="deep-bubble ai-bubble">
                좋아! {concept.title}에 대해 이제 어떻게 설명할 수 있을까?
                문서는 덮고 네 말로 처음부터 정리해 줘. 보내면 함께 학습 결과를
                돌아볼게.
              </p>
            </>
          )}
          {pendingMessage !== null && (
            <p className="deep-bubble user-bubble">{pendingMessage}</p>
          )}
          {typing && (
            <div
              className="chat-typing"
              role="status"
              aria-label="짝꿍 AI가 답변을 작성하고 있어요"
            >
              <span className="chat-speaker" aria-hidden="true">
                짝꿍 AI
              </span>
              <div
                className="deep-bubble ai-bubble typing-bubble"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </div>
              <span className="typing-caption" aria-hidden="true">
                답변 작성 중
              </span>
            </div>
          )}
          {busy && !typing && (
            <p className="chat-thinking" role="status">
              {statusMessage}
            </p>
          )}
        </div>
        <div ref={latest} aria-hidden="true" />
      </div>
      {!reviewing && (
        <form
          className="deep-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && study.draft.trim()) onSubmit();
          }}
        >
          <textarea
            ref={composer}
            aria-label="채팅 메시지"
            placeholder={
              rewriting ? "내 말로 정리해 볼게…" : "내 생각을 말해 봐…"
            }
            value={pendingMessage !== null ? "" : study.draft}
            disabled={busy}
            maxLength={15000}
            rows={1}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!busy && study.draft.trim()) onSubmit();
              }
            }}
          />
          <button
            aria-label={rewriting ? "마지막 정리 보내기" : "메시지 보내기"}
            disabled={busy || !study.draft.trim()}
            type="submit"
          >
            {busy ? (
              <Loader2 size={21} className="spin" />
            ) : (
              <ArrowUp size={24} />
            )}
          </button>
        </form>
      )}
      <footer className="chat-footer">
        <span>
          {project.mode === "demo"
            ? "데모 대화 · 실제 이해도 평가 없음"
            : "등록한 자료를 바탕으로 대화해요 · 원문은 숨겨져 있어요"}
        </span>
        {!reviewing && (
          <button disabled={busy} onClick={onSave}>
            <Save size={12} />
            대화 저장
          </button>
        )}
      </footer>
    </section>
  );
}
