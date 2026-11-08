"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  LockKeyhole,
  Plus,
  Upload,
  X,
} from "lucide-react";
import type {
  AppConfiguration,
  Concept,
  Feedback,
  LearningMode,
  Project,
  Study,
} from "@/lib/types";
import {
  completedCards,
  documentTitle,
  studyLabel,
  sourceReference,
} from "@/lib/presentation";
import LearningModeChoice from "../learning-mode";
import { MAX_SOURCE_TEXT_LENGTH } from "@/lib/source-input";
import { Button } from "../ui/button";
import { ArrowButton, PageTitle } from "./collection-views";

export function ImportView({
  configuration,
  mode,
  signedIn,
  busy,
  canStart,
  onMode,
  onLogin,
  onChooseFile,
  onFile,
  onText,
  onSample,
  onBack,
}: {
  configuration: AppConfiguration | null;
  mode: LearningMode;
  signedIn: boolean;
  busy: boolean;
  canStart: boolean;
  onMode: (mode: LearningMode) => void;
  onLogin: () => void;
  onChooseFile: () => void;
  onFile: (file: File) => void;
  onText: (title: string, text: string) => void;
  onSample: () => void;
  onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<"pdf" | "text">("pdf");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <>
      <div className="simple-toolbar">
        <button
          className="icon-button bordered"
          aria-label="홈으로 돌아가기"
          disabled={busy}
          onClick={onBack}
        >
          <X size={21} />
        </button>
        <strong>개념 등록</strong>
        <span className="status-pill white">
          {source === "pdf" ? "PDF" : "텍스트"}
        </span>
      </div>
      <PageTitle
        title="공부한 내용을 넣어 주세요"
        description="PDF나 텍스트 원문에서 하나씩 설명할 핵심 카드를 만들어요."
      />
      <div className="source-switch" role="group" aria-label="자료 입력 방식">
        <button
          aria-pressed={source === "pdf"}
          disabled={busy}
          onClick={() => setSource("pdf")}
        >
          PDF 업로드
        </button>
        <button
          aria-pressed={source === "text"}
          disabled={busy}
          onClick={() => setSource("text")}
        >
          텍스트 붙여넣기
        </button>
      </div>
      <div className="import-layout">
        {source === "text" ? (
          <form
            className="text-source-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                canStart &&
                text.trim() &&
                text.length <= MAX_SOURCE_TEXT_LENGTH
              )
                onText(title, text);
            }}
          >
            <label htmlFor="source-title">
              자료 제목 <span>선택</span>
            </label>
            <input
              id="source-title"
              value={title}
              maxLength={80}
              disabled={busy}
              placeholder="예: 운영체제 수업 정리"
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="source-text">텍스트 원문</label>
            <textarea
              id="source-text"
              value={text}
              maxLength={MAX_SOURCE_TEXT_LENGTH}
              disabled={busy}
              placeholder="학습할 내용을 붙여넣어 주세요."
              onChange={(event) => setText(event.target.value)}
              aria-describedby="source-text-help source-text-count"
            />
            <div className="text-source-help">
              <small id="source-text-help">
                공백 포함 최대 3,000자 · 학습 중에는 원문을 숨겨요.
              </small>
              <span id="source-text-count">
                {text.length.toLocaleString()} / 3,000
              </span>
            </div>
            <Button
              type="submit"
              disabled={
                !canStart ||
                !text.trim() ||
                text.length > MAX_SOURCE_TEXT_LENGTH
              }
            >
              텍스트로 카드 만들기 <ArrowRight size={17} />
            </Button>
          </form>
        ) : (
          <section
            className={`pdf-dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (canStart) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (canStart && event.dataTransfer.files[0])
                onFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="upload-symbol">
              <Upload size={30} />
            </span>
            <h2>여기에 PDF를 놓아 주세요</h2>
            <p>
              교재, 강의 자료, 공부한 문서까지.
              <br />
              설명하고 싶은 내용이 담긴 PDF를 선택하세요.
            </p>
            <Button
              variant="outline"
              disabled={!canStart}
              onClick={onChooseFile}
            >
              <Plus size={16} />
              PDF 파일 선택
            </Button>
            <small>최대 20MB · 150페이지 · 텍스트가 있는 PDF</small>
          </section>
        )}
        <div className="import-settings">
          <LearningModeChoice
            configuration={configuration}
            mode={mode}
            signedIn={signedIn}
            busy={busy}
            onSelect={onMode}
            onLogin={onLogin}
          />
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p>
              문서는 서버에 보관하고,
              <br />
              설명하는 동안에는 본문을 보여주지 않아요.
            </p>
          </div>
        </div>
      </div>
      <div className="sample-strip">
        <div>
          <strong>아직 문서가 없나요?</strong>
          <span>
            {mode === "demo"
              ? "실제 AI 호출 없는 예제로 먼저 경험해 보세요."
              : "Gemini로 준비된 예제 문서를 분석할 수 있어요."}
          </span>
        </div>
        <button disabled={!canStart} onClick={onSample}>
          {mode === "demo" ? "예제로 시작" : "Gemini로 예제 분석"}
          <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}

type Draft = { title: string; description: string };
export function ConceptsView({
  project,
  drafts,
  busy,
  onChange,
  onSave,
  onStart,
  onBack,
}: {
  project: Project;
  drafts: Record<string, Draft>;
  busy: boolean;
  onChange: (id: string, draft: Draft) => void;
  onSave: (concept: Concept) => void;
  onStart: (concept: Concept) => void;
  onBack: () => void;
}) {
  const first =
    project.concepts.find((c) => project.studies[c.id]?.phase !== "done") ||
    project.concepts[0];
  const editing = (c: Concept) => ({
    ...c,
    ...drafts[`${project.id}:${c.id}`],
  });
  return (
    <>
      <div className="simple-toolbar">
        <button
          className="icon-button bordered"
          aria-label="카드함으로 돌아가기"
          disabled={busy}
          onClick={onBack}
        >
          <ArrowLeft size={21} />
        </button>
        <strong>카드 확인</strong>
        <span className="status-pill white">
          {project.mode === "demo" ? "데모" : "Gemini"}
        </span>
      </div>
      <PageTitle
        title={`핵심 카드 ${project.concepts.length}장을 찾았어요`}
        description={documentTitle(project.name)}
      />
      <p className="intro-copy">
        이름과 학습 목표를 살펴보고, 첫 카드부터 내 말로 설명해 보세요.
      </p>
      <div className="section-title">
        <h2>
          핵심 카드 <span>{project.concepts.length}</span>
        </h2>
        <span>추천 학습 순서</span>
      </div>
      <div className="concept-editor-grid">
        {project.concepts.map((original, i) => {
          const concept = editing(original),
            started = Boolean(project.studies[concept.id]);
          return (
            <article className="editable-concept" key={concept.id}>
              <div className="editable-top">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  {started
                    ? studyLabel(project.studies[concept.id])
                    : `중요도 ${concept.importance}`}
                </span>
              </div>
              <input
                aria-label={`개념 ${i + 1} 이름`}
                maxLength={150}
                disabled={busy || started}
                value={concept.title}
                onChange={(event) =>
                  onChange(concept.id, {
                    title: event.target.value,
                    description: concept.description,
                  })
                }
              />
              <details>
                <summary>
                  학습 목표 <ChevronDown size={14} />
                </summary>
                <textarea
                  aria-label={`개념 ${i + 1} 설명`}
                  disabled={busy || started}
                  maxLength={600}
                  value={concept.description}
                  onChange={(event) =>
                    onChange(concept.id, {
                      title: concept.title,
                      description: event.target.value,
                    })
                  }
                />
              </details>
              <div className="editable-bottom">
                <span>
                  근거 ·{" "}
                  {concept.pages
                    .map((page) => sourceReference(project, page))
                    .join(", ")}
                </span>
                {drafts[`${project.id}:${concept.id}`] && !started ? (
                  <button
                    disabled={busy || !concept.title.trim()}
                    onClick={() => onSave(concept)}
                  >
                    변경 저장 <Check size={13} />
                  </button>
                ) : (
                  <button
                    disabled={busy || !concept.title.trim()}
                    onClick={() => onStart(concept)}
                  >
                    {started ? "이어 보기" : "설명하기"}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="source-notice">
        <LockKeyhole size={17} />
        <div>
          <strong>원문은 덮고, 기억으로 설명해요.</strong>
          <p>질문을 모두 마친 뒤 필요한 근거만 확인할 수 있어요.</p>
        </div>
      </div>
      {project.mode === "demo" && (
        <p className="quiet-note">
          데모 카드입니다. 실제 의미 기반 분석·평가는 Gemini 모드에서 새로
          시작해 주세요.
        </p>
      )}
      <div className="page-bottom-action">
        <ArrowButton
          disabled={
            busy ||
            !first ||
            project.concepts.some((c) => !editing(c).title.trim())
          }
          onClick={() => {
            if (first) onStart(editing(first));
          }}
        >
          {completedCards(project) === project.concepts.length
            ? "카드 결과 돌아보기"
            : "첫 카드부터 설명하기"}
        </ArrowButton>
      </div>
    </>
  );
}

export function FeedbackPanel({
  feedback,
  label,
  project,
}: {
  feedback: Feedback;
  label: string;
  project: Project;
}) {
  const groups: [string, string[], string][] = [
    ["확인된 이해", feedback.understood, "positive"],
    ["개념 오류", feedback.errors, "attention"],
    ["빠진 설명 · 이해 여부 미확인", feedback.missing, "neutral"],
    ["보완할 요소", feedback.improve, "neutral"],
    ["아직 미확인", feedback.unverified, "neutral"],
  ];
  return (
    <section className="feedback-panel">
      <h3>{label}</h3>
      {groups.map(([title, items, tone]) => (
        <div className={`feedback-group ${tone}`} key={title}>
          <h4>
            <i />
            {title}
          </h4>
          {items.length ? (
            <ul>
              {items.map((item, i) => (
                <li key={i}>
                  {item}
                  {feedback.evidence
                    .filter((e) => e.claim === item)
                    .map((e, j) => (
                      <details className="evidence-reference" key={j}>
                        <summary>
                          문서 근거 · {sourceReference(project, e.page)}
                          <ChevronDown size={13} />
                        </summary>
                        <blockquote>{e.quote}</blockquote>
                      </details>
                    ))}
                </li>
              ))}
            </ul>
          ) : (
            <p>확인된 항목이 없습니다.</p>
          )}
        </div>
      ))}
    </section>
  );
}

export function ResultView({
  project,
  concept,
  study,
  busy,
  onClose,
  onNext,
  onRestart,
}: {
  project: Project;
  concept: Concept;
  study: Study;
  busy: boolean;
  onClose: () => void;
  onNext: () => void;
  onRestart: () => void;
}) {
  const hints = study.turns.reduce((n, t) => n + t.hints.length, 0);
  return (
    <>
      <div className="result-top">
        <div>
          <h1>설명 끝</h1>
          <p>
            {documentTitle(project.name)} · {concept.title}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="학습 결과 닫기"
          disabled={busy}
          onClick={onClose}
        >
          <X size={23} />
        </button>
      </div>
      <div className="record-stats dark-stats">
        {[
          ["답한 질문", study.turns.length],
          ["사용한 힌트", hints],
          ["확인한 근거", study.evidenceViews.length],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="deck-result">
        <div className="section-title">
          <h2>이번 문서</h2>
          <span>
            {completedCards(project)} / {project.concepts.length} 설명 완료
          </span>
        </div>
        <div className="result-deck-grid">
          {project.concepts.map((c) => (
            <div
              className={c.id === concept.id ? "current-card" : ""}
              key={c.id}
            >
              <span>{c.title}</span>
              {project.studies[c.id]?.phase === "done" ? (
                <Check size={16} />
              ) : (
                <small>{studyLabel(project.studies[c.id])}</small>
              )}
            </div>
          ))}
        </div>
      </section>
      {study.result?.change && (
        <section className="change-report">
          <div className="section-title">
            <h2>내 설명이 달라진 점</h2>
            <span>{study.attempt}번째 루프</span>
          </div>
          <p>{study.result.change}</p>
        </section>
      )}
      <section className="explanation-comparison">
        <div className="section-title">
          <h2>내 말로 남긴 설명</h2>
          <span>처음과 마지막</span>
        </div>
        <div className="comparison-grid">
          <article>
            <span>첫 설명</span>
            <p>{study.first}</p>
          </article>
          <article className="final-explanation">
            <span>마지막 재설명</span>
            <p>{study.final}</p>
          </article>
        </div>
      </section>
      <details className="assessment-details" open>
        <summary>
          마지막 설명의 피드백
          <ChevronDown size={18} />
        </summary>
        {study.result && (
          <FeedbackPanel
            project={project}
            feedback={study.result}
            label="지금의 이해 돌아보기"
          />
        )}
      </details>
      {study.initialFeedback && (
        <details className="assessment-details">
          <summary>
            첫 설명의 피드백
            <ChevronDown size={18} />
          </summary>
          <FeedbackPanel
            project={project}
            feedback={study.initialFeedback}
            label="첫 설명에서 확인한 내용"
          />
        </details>
      )}
      <p className="session-footnote">
        {project.mode === "demo"
          ? "데모에서는 이해도를 평가하지 않습니다. 설명 기록과 질문 흐름을 돌아보는 결과예요."
          : "미확인은 이해하지 못했다는 뜻이 아닙니다. 아직 설명에서 확인하지 못한 내용이에요."}
      </p>
      <button
        className="text-button repeat-button"
        disabled={busy}
        onClick={onRestart}
      >
        이 카드, 다시 설명해 볼래요 <ArrowRight size={15} />
      </button>
      <div className="result-actions">
        <Button variant="outline" disabled={busy} onClick={onNext}>
          다음 카드 보기
        </Button>
        <Button disabled={busy} onClick={onClose}>
          오늘은 여기까지
        </Button>
      </div>
    </>
  );
}
