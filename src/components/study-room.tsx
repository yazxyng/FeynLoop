"use client";
import {
  BookOpen,
  MessageCircle,
  Lightbulb,
  ArrowRight,
  Loader2,
  LockKeyhole,
  FileSearch,
} from "lucide-react";
import { Button } from "./ui/button";
import type { Concept, Project, Study } from "@/lib/types";
type Props = {
  project: Project;
  concept: Concept;
  study: Study;
  busy: boolean;
  tab: string;
  setTab: (tab: string) => void;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => void;
  onSave: () => void;
};
export default function StudyRoom({
  project,
  concept,
  study,
  busy,
  tab,
  setTab,
  onDraft,
  onSubmit,
  onAction,
  onSave,
}: Props) {
  const review = study.phase === "review";
  const step =
    study.phase === "explain"
      ? 0
      : study.phase === "questions"
        ? 1
        : review
          ? 2
          : 3;
  return (
    <>
      <div className="steps">
        {["기억으로 설명", "질문·답변", "필요한 근거 확인", "다시 설명"].map(
          (label, i) => (
            <span className={step === i ? "current" : ""} key={label}>
              <b>{i + 1}</b>
              {label}
            </span>
          ),
        )}
      </div>
      <div className="info-box">
        <LockKeyhole size={18} />
        <p>
          {review
            ? "질문을 마쳤어요. 필요한 근거만 확인하거나, 바로 재설명을 시작해도 좋아요."
            : "원문을 보지 않고 기억나는 내용을 설명해 보세요. 설명·재설명 중에는 원문을 열 수 없습니다."}
          <br />
          <small>
            {project.mode === "demo"
              ? "데모 질문이며 실제 이해도를 판정하지 않습니다."
              : "AI는 서버의 문서 근거를 바탕으로 질문합니다."}
          </small>
        </p>
      </div>
      {review ? (
        <section className="review-panel">
          <FileSearch size={24} />
          <h2>어떤 부분을 다시 확인하고 싶나요?</h2>
          <p>
            관련 페이지에서 최대 650자의 근거만 제공합니다. 열람 여부는 결과에
            함께 기록됩니다.
          </p>
          <div className="review-actions">
            {concept.pages.slice(0, 3).map((page) => (
              <Button
                key={page}
                variant="outline"
                disabled={
                  busy || study.evidenceViews.some((v) => v.page === page)
                }
                onClick={() => onAction("evidence", { page })}
              >
                p.{page} 관련 근거 확인
              </Button>
            ))}
          </div>
          {study.evidence?.map((e) => (
            <blockquote className="evidence-excerpt" key={e.page}>
              <small>
                근거 p.{e.page} ·{" "}
                {new Date(e.viewedAt).toLocaleTimeString("ko-KR")}
              </small>
              <p>{e.text}</p>
            </blockquote>
          ))}
          <Button disabled={busy} onClick={() => onAction("rewrite")}>
            근거를 닫고 처음부터 재설명 <ArrowRight size={16} />
          </Button>
        </section>
      ) : (
        <>
          <div className="mobile-tabs">
            {[
              ["editor", "나의 설명"],
              ["chat", "AI 학생"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "selected" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="study-grid recall-grid">
            <section
              className={`study-panel editor-panel ${tab === "editor" ? "mobile-visible" : ""}`}
            >
              <div className="panel-heading">
                <BookOpen size={17} />
                <strong>
                  {study.phase === "rewrite"
                    ? "최종 재설명"
                    : study.phase === "questions"
                      ? "질문에 답하기"
                      : "나의 첫 설명"}
                </strong>
                <span>저장 버튼으로 임시 저장</span>
              </div>
              <div className="editor-intro">
                <span className="tag">{concept.title}</span>
                <h3>
                  {study.phase === "rewrite"
                    ? "근거를 덮고, 처음부터 다시."
                    : study.phase === "questions"
                      ? "생각을 한 단계 더 풀어볼까요?"
                      : "처음 배우는 친구에게 설명하듯."}
                </h3>
                <p>
                  {study.phase === "questions"
                    ? study.feedback?.question
                    : "기억나는 정의, 작동 원리, 자신만의 예시를 적어 보세요. 확신이 없는 부분도 편하게 표현해 주세요."}
                </p>
              </div>
              <textarea
                className="explanation"
                aria-label="설명 작성"
                disabled={busy}
                maxLength={15000}
                placeholder="제가 이해한 이 개념은…"
                value={study.draft}
                onChange={(e) => onDraft(e.target.value)}
              />
              <div className="editor-footer">
                <span>{study.draft.length.toLocaleString()} / 15,000자</span>
                <Button
                  disabled={busy || !study.draft.trim()}
                  onClick={onSubmit}
                >
                  {busy ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <ArrowRight size={15} />
                  )}{" "}
                  {study.phase === "rewrite"
                    ? "학습 결과 확인"
                    : study.phase === "questions"
                      ? "답변 보내기"
                      : "첫 설명 제출"}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onSave}
              >
                저장하고 잠시 쉬기
              </Button>
            </section>
            <section
              className={`study-panel chat-panel ${tab === "chat" ? "mobile-visible" : ""}`}
            >
              <div className="panel-heading">
                <MessageCircle size={17} />
                <strong>호기심 많은 AI 학생</strong>
                <span>{study.turns.length} / 3 질문</span>
              </div>
              <div className="chat-body">
                <div className="chat-message">
                  <strong>✳ 루프</strong>
                  <p>
                    {study.phase === "rewrite"
                      ? "세 번의 질문을 마쳤어요. 지금 떠오르는 내용으로 처음부터 설명해 주세요."
                      : "안녕하세요! 설명해 주시면 궁금한 점을 하나씩 물어볼게요. 정답을 바로 알려드리지는 않아요."}
                  </p>
                </div>
                {study.phase !== "rewrite" && (
                  <>
                    {study.first && (
                      <div className="chat-answer">
                        <small>나의 첫 설명</small>
                        <p>{study.first}</p>
                      </div>
                    )}
                    {study.turns.map((t, i) => (
                      <div key={i}>
                        <div className="chat-message">
                          <strong>질문 {i + 1}</strong>
                          <p>{t.question}</p>
                        </div>
                        <div className="chat-answer">
                          <p>{t.answer}</p>
                          {t.hints.length > 0 && (
                            <small>힌트 {t.hints.length}단계 사용</small>
                          )}
                        </div>
                      </div>
                    ))}
                    {study.phase === "questions" && (
                      <div className="chat-message">
                        <strong>✳ 질문 {study.turns.length + 1}</strong>
                        <p>{study.feedback?.question}</p>
                        {study.hints.map((hint, i) => (
                          <p className="hint" key={i}>
                            힌트 {i + 1}: {hint}
                          </p>
                        ))}
                        <button
                          className="hint-button"
                          disabled={busy || study.hints.length >= 2}
                          onClick={() => onAction("hint")}
                        >
                          <Lightbulb size={14} />
                          {study.hints.length >= 2
                            ? "힌트 2단계까지 확인했어요"
                            : `힌트 ${study.hints.length + 1}단계 요청`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <small className="chat-disclaimer">
                {study.phase === "rewrite"
                  ? "재설명 중에는 이전 대화와 근거를 숨깁니다."
                  : project.mode === "demo"
                    ? "데모 질문입니다. 실제 이해도를 평가하지 않습니다."
                    : "평가와 문서 근거는 학습 결과에서 확인할 수 있어요."}
              </small>
            </section>
          </div>
        </>
      )}
    </>
  );
}
