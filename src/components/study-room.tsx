"use client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  BookOpen,
  ChevronDown,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Save,
} from "lucide-react";
import { Button } from "./ui/button";
import type { Concept, Project, Study } from "@/lib/types";
type Props = {
  project: Project;
  concept: Concept;
  study: Study;
  busy: boolean;
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
  onDraft,
  onSubmit,
  onAction,
  onSave,
  onBack,
}: Props) {
  const asking = study.phase === "questions";
  const review = study.phase === "review",
    final = study.phase === "rewrite",
    step = study.phase === "explain" ? 1 : asking ? 2 : review ? 3 : 4;
  const question = final
    ? "질문에서 찾은 빈틈을 떠올리며, 처음부터 다시 설명해 줄래?"
    : asking
      ? study.feedback?.question
      : `${concept.title}? 처음 들어봐. 처음 배우는 친구한테 말하듯이 설명해 줄래?`;
  if (asking) {
    return (
      <section className="deep-dive" aria-label="더 파고들기">
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
            <h1>더 파고들기</h1>
            <p>질문 {study.turns.length + 1} / 3</p>
          </div>
          <button className="text-button" disabled={busy} onClick={onBack}>
            끝내기
          </button>
        </header>
        <div className="deep-topic">
          <span>
            주제 <strong>{concept.title}</strong>
          </span>
          <span className="deep-mode">
            <i />
            {project.mode === "demo" ? "데모 모드" : "Gemini 모드"}
          </span>
        </div>
        <div className="deep-conversation" aria-live="polite">
          {study.turns.map((turn, i) => (
            <article className="deep-turn" key={i}>
              <div className="deep-completed">
                <Check size={15} />
                <span>질문 {i + 1} · 답변 완료</span>
                <span>기록됨</span>
              </div>
              <h2>이전 질문</h2>
              <p className="deep-bubble ai-bubble">{turn.question}</p>
              <p className="deep-bubble user-bubble">{turn.answer}</p>
            </article>
          ))}
          <article className="deep-current">
            <h2>{study.turns.length ? "연결 질문" : "첫 번째 질문"}</h2>
            <p className="deep-bubble ai-bubble">{question}</p>
            {study.hints.map((hint, i) => (
              <div className="deep-hint" key={i}>
                <h2>힌트 {i + 1}</h2>
                <p className="deep-bubble ai-bubble">{hint}</p>
              </div>
            ))}
            <button
              className="hint-button"
              disabled={busy || study.hints.length >= 2}
              onClick={() => onAction("hint")}
            >
              <Lightbulb size={16} />
              {study.hints.length >= 2
                ? "두 단계 힌트를 확인했어요"
                : "힌트 질문 받기"}
            </button>
          </article>
        </div>
        <form
          className="deep-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && study.draft.trim()) onSubmit();
          }}
        >
          <textarea
            aria-label="설명 작성"
            placeholder="내 생각을 말해 봐..."
            value={study.draft}
            disabled={busy}
            maxLength={15000}
            rows={1}
            onChange={(event) => onDraft(event.target.value)}
          />
          <button
            aria-label="답변 보내기"
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
      </section>
    );
  }
  return (
    <>
      <div className="session-toolbar">
        <button
          className="icon-button"
          disabled={busy}
          onClick={onBack}
          aria-label="개념 목록으로 돌아가기"
        >
          <ArrowLeft size={22} />
        </button>
        <span>
          {step} / 4{" "}
          <small>
            {["첫 설명", "질문과 답변", "근거 확인", "최종 재설명"][step - 1]}
          </small>
        </span>
        {review ? (
          <span className="session-toolbar-note">질문 완료</span>
        ) : (
          <button className="text-button" disabled={busy} onClick={onSave}>
            <Save size={15} />
            저장
          </button>
        )}
      </div>
      <div className="session-layout">
        <div className="session-context">
          <section className="session-concept">
            <p>핵심 카드 · {project.name.replace(/\.pdf$/i, "")}</p>
            <h1>{concept.title}</h1>
            <span>
              {review
                ? "필요한 부분만 확인하고, 다시 덮어요."
                : "원문은 덮고, 내 말로 설명해 주세요."}
            </span>
          </section>
          <div className="session-step-track" aria-label={`학습 ${step}단계`}>
            {[1, 2, 3, 4].map((n) => (
              <i className={n <= step ? "filled" : ""} key={n} />
            ))}
          </div>
          {!review && (
            <section className="ai-question">
              <div className="ai-label">
                <span className="ai-avatar">
                  <span className="loop-symbol" />
                </span>
                <strong>짝꿍 AI</strong>
                <span>
                  {project.mode === "demo" ? "데모" : "Gemini"}
                  {asking ? ` · 질문 ${study.turns.length + 1} / 3` : ""}
                </span>
              </div>
              <p>{question}</p>
              {asking && (
                <>
                  <div className="hint-stack">
                    {study.hints.map((hint, i) => (
                      <div key={i}>
                        <small>힌트 {i + 1}</small>
                        <p>{hint}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    className="hint-button"
                    disabled={busy || study.hints.length >= 2}
                    onClick={() => onAction("hint")}
                  >
                    <Lightbulb size={15} />
                    {study.hints.length >= 2
                      ? "두 단계 힌트를 확인했어요"
                      : `힌트 ${study.hints.length + 1}단계 받기`}
                  </button>
                </>
              )}
            </section>
          )}
          {asking && study.turns.length > 0 && (
            <details className="conversation-history">
              <summary>
                지금까지 나눈 대화 <span>{study.turns.length}개</span>
                <ChevronDown size={15} />
              </summary>
              <div>
                {study.first && (
                  <article className="my-turn">
                    <small>나의 첫 설명</small>
                    <p>{study.first}</p>
                  </article>
                )}
                {study.turns.map((turn, i) => (
                  <article key={i}>
                    <small>질문 {i + 1}</small>
                    <p>{turn.question}</p>
                    <div className="my-turn">
                      <p>{turn.answer}</p>
                      {turn.hints.length > 0 && (
                        <small>힌트 {turn.hints.length}단계 사용</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
        {review ? (
          <section className="review-panel">
            <span className="review-icon">
              <BookOpen size={24} />
            </span>
            <h2>어떤 부분을 더 확인할까요?</h2>
            <p>
              관련 문단만 짧게 열어볼 수 있어요.
              <br />
              확인한 페이지는 학습 결과에 함께 남습니다.
            </p>
            <div className="review-actions">
              {concept.pages.slice(0, 3).map((page) => (
                <Button
                  variant="outline"
                  key={page}
                  disabled={
                    busy || study.evidenceViews.some((v) => v.page === page)
                  }
                  onClick={() => onAction("evidence", { page })}
                >
                  {study.evidenceViews.some((v) => v.page === page)
                    ? "확인한 근거"
                    : "관련 근거"}{" "}
                  p.{page}
                </Button>
              ))}
            </div>
            {study.evidence?.map((e) => (
              <blockquote className="evidence-excerpt" key={e.page}>
                <small>문서 근거 p.{e.page}</small>
                <p>{e.text}</p>
              </blockquote>
            ))}
            <div className="source-notice">
              <LockKeyhole size={16} />
              <p>
                최대 3페이지, 페이지별 650자까지 확인해요.
                <br />
                재설명을 시작하면 근거는 다시 숨겨집니다.
              </p>
            </div>
            <Button
              className="wide-action"
              disabled={busy}
              onClick={() => onAction("rewrite")}
            >
              근거를 닫고 재설명하기 <ArrowRight size={17} />
            </Button>
          </section>
        ) : (
          <section className="explanation-area">
            <div className="editor-card">
              <div className="editor-label">
                <label htmlFor="explanation-input">
                  {final
                    ? "처음부터 다시, 내 설명"
                    : asking
                      ? "나의 답변"
                      : "내 설명"}
                </label>
                <span className="input-medium">글로</span>
              </div>
              <textarea
                id="explanation-input"
                className="explanation"
                aria-label="설명 작성"
                disabled={busy}
                maxLength={15000}
                placeholder={
                  final
                    ? "이 개념을 처음 배우는 사람에게, 처음부터 다시 설명해 볼게요…"
                    : "제가 이해한 이 개념은…"
                }
                value={study.draft}
                onChange={(event) => onDraft(event.target.value)}
              />
              <div className="editor-count">
                <LockKeyhole size={12} />
                <span>원문 없이 기억으로</span>
                <span>{study.draft.length.toLocaleString()} / 15,000</span>
              </div>
            </div>
            <div className="session-submit">
              <Button
                className="wide-action"
                disabled={busy || !study.draft.trim()}
                onClick={onSubmit}
              >
                {busy ? (
                  <>
                    <Loader2 size={17} className="spin" />
                    생각을 읽고 있어요
                  </>
                ) : final ? (
                  "재설명 마치고 결과 보기"
                ) : asking ? (
                  "답변 보내기"
                ) : (
                  "설명 제출"
                )}
                {!busy && <ArrowRight size={18} />}
              </Button>
              <p className="session-footnote">
                {project.mode === "demo"
                  ? "데모 질문입니다. 실제 이해도를 평가하지 않아요."
                  : final
                    ? "이전 대화와 근거는 덮고, 나의 말로 다시 설명해요."
                    : "정답보다 중요한 건, 내 생각을 꺼내보는 거예요."}
              </p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
