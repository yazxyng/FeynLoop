"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import type { Concept, Project, Study } from "@/lib/types";
import {
  cardsOf,
  completedCards,
  documentTitle,
  studyLabel,
  studyProgress,
  type CardEntry,
} from "@/lib/presentation";

export function ArrowButton({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`arrow-button ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
      <span className="arrow-disc">
        <ArrowRight size={21} />
      </span>
    </button>
  );
}
export function StageMeter({ study }: { study?: Study }) {
  const progress = studyProgress(study);
  return (
    <span className="stage-meter" aria-label={studyLabel(study)}>
      <span className="meter-bars">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= progress ? "filled" : ""} />
        ))}
      </span>
      <span>{studyLabel(study)}</span>
    </span>
  );
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  onCreate,
}: {
  title: string;
  description: string;
  onCreate?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onCreate && (
        <Button onClick={onCreate}>
          <Plus size={16} />첫 카드 만들기
        </Button>
      )}
    </div>
  );
}

type HomeProps = {
  projects: Project[];
  ready: boolean;
  sampleMode: "demo" | "live";
  busy: boolean;
  onStart: (entry: CardEntry) => void;
  onLibrary: () => void;
  onCreate: () => void;
  onSample: () => void;
};
export function HomeView({
  projects,
  ready,
  busy,
  sampleMode,
  onStart,
  onLibrary,
  onCreate,
  onSample,
}: HomeProps) {
  const cards = cardsOf(projects),
    pending = cards.filter((c) => c.study?.phase !== "done");
  const next = pending.find((c) => c.study) || pending[0] || cards[0];
  const done = next ? completedCards(next.project) : 0;
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <>
      <div className="home-intro">
        <p>{today}</p>
        <h1>
          {ready
            ? cards.length
              ? `오늘 설명할 카드 ${pending.length}장`
              : "오늘, 첫 설명을 시작해요"
            : "학습 카드를 불러오고 있어요"}
        </h1>
      </div>
      <div className="home-layout">
        <section className="featured-card">
          <div className="featured-top">
            <span>
              {next
                ? documentTitle(next.project.name)
                : "나만의 언어로 시작하는 배움"}
            </span>
            <span className="round-mark">
              <BookOpen size={23} />
            </span>
          </div>
          <div className="featured-content">
            <h2>{next ? next.concept.title : "읽은 것을, 내 지식으로."}</h2>
            <p>
              {next?.study?.phase === "done"
                ? "나의 첫 설명과 마지막 설명을 돌아보세요."
                : "문서를 덮고, 이 개념 하나로 설명해 보세요."}
            </p>
          </div>
          <div className="featured-progress">
            <div className="deck-bars">
              {Array.from(
                { length: next?.project.concepts.length || 5 },
                (_, i) => (
                  <i
                    key={i}
                    className={
                      i < done
                        ? "complete"
                        : i === done && next
                          ? "current"
                          : ""
                    }
                  />
                ),
              )}
            </div>
            <strong>
              {next
                ? `${done} / ${next.project.concepts.length}`
                : "첫 번째 루프"}
            </strong>
          </div>
          <ArrowButton
            disabled={busy || !ready}
            onClick={() => (next ? onStart(next) : onCreate())}
          >
            {next
              ? next.study?.phase === "done"
                ? "내 설명 돌아보기"
                : next.study
                  ? "이어서 설명하기"
                  : "설명 시작"
              : "PDF로 카드 만들기"}
          </ArrowButton>
        </section>
        <section
          className={`home-queue ${projects.length === 1 ? "single-document" : ""}`}
        >
          <div className="section-title">
            <h2>
              이어서 설명할 카드 <span>{pending.length}</span>
            </h2>
            <button onClick={onLibrary}>전체 보기</button>
          </div>
          {cards.length ? (
            <div className="queue-list">
              {(pending.length ? pending : cards).slice(0, 3).map((entry) => (
                <button
                  disabled={busy}
                  key={entry.project.id + entry.concept.id}
                  onClick={() => onStart(entry)}
                >
                  <div>
                    <strong>{entry.concept.title}</strong>
                    <small>{documentTitle(entry.project.name)}</small>
                  </div>
                  <span
                    className={`status-pill ${entry.study?.phase === "done" ? "subtle" : ""}`}
                  >
                    {entry.study?.phase === "done"
                      ? "완료"
                      : entry.study
                        ? "이어서"
                        : "새 카드"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="first-loop">
              <span className="loop-symbol" />
              <h3>
                설명하는 순간,
                <br />
                배움이 선명해져요.
              </h3>
              <p>
                공부한 PDF를 넣으면
                <br />
                하나씩 설명할 카드를 만들어요.
              </p>
              <button disabled={busy || !ready} onClick={onSample}>
                {sampleMode === "live"
                  ? "Gemini로 예제 분석하기"
                  : "예제 문서로 먼저 둘러보기"}{" "}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

type LibraryProps = {
  projects: Project[];
  query: string;
  setQuery: (q: string) => void;
  busy: boolean;
  onSelect: (entry: CardEntry) => void;
  onCreate: () => void;
};
export function LibraryView({
  projects,
  query,
  setQuery,
  busy,
  onSelect,
  onCreate,
}: LibraryProps) {
  const [filter, setFilter] = useState("all"),
    [searchOpen, setSearchOpen] = useState(Boolean(query));
  const all = cardsOf(projects),
    done = all.filter((c) => c.study?.phase === "done").length,
    active = all.filter((c) => c.study && c.study.phase !== "done").length;
  const visible = all.filter(
    (entry) =>
      (filter === "all" ||
        (filter === "new" && !entry.study) ||
        (filter === "active" && entry.study && entry.study.phase !== "done") ||
        (filter === "done" && entry.study?.phase === "done")) &&
      `${entry.concept.title} ${entry.project.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title="카드함"
        description={`전체 ${all.length}장 · 설명 완료 ${done} · 학습 중 ${active} · 설명 전 ${all.length - done - active}`}
        action={
          <button
            className="icon-button bordered"
            aria-label={searchOpen ? "검색 닫기" : "카드 검색"}
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setQuery("");
            }}
          >
            {searchOpen ? <X size={20} /> : <Search size={22} />}
          </button>
        }
      />
      {searchOpen && (
        <label className="search-field">
          <Search size={17} />
          <input
            autoFocus
            aria-label="카드 검색어"
            placeholder="개념 또는 문서 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className="filter-chips" role="group" aria-label="학습 상태 필터">
        {[
          ["all", "전체"],
          ["new", "설명 전"],
          ["active", "학습 중"],
          ["done", "설명 완료"],
        ].map(([key, label]) => (
          <button
            aria-pressed={filter === key}
            className={filter === key ? "selected" : ""}
            onClick={() => setFilter(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      {!all.length ? (
        <EmptyState
          title="아직 꺼내 볼 카드가 없어요"
          description="PDF 하나로 나만의 카드함을 채워 보세요."
          onCreate={onCreate}
        />
      ) : !visible.length ? (
        <EmptyState
          title="조건에 맞는 카드가 없어요"
          description="검색어나 학습 상태를 바꿔 보세요."
        />
      ) : (
        projects.map((project) => {
          const entries = visible.filter((c) => c.project.id === project.id);
          return entries.length ? (
            <section className="library-group" key={project.id}>
              <div className="section-title">
                <h2>{documentTitle(project.name)}</h2>
                <span>{entries.length}장</span>
              </div>
              <div className="concept-grid">
                {entries.map((entry) => (
                  <button
                    disabled={busy}
                    className={`compact-card ${!entry.study ? "not-started" : ""}`}
                    key={entry.concept.id}
                    onClick={() => onSelect(entry)}
                  >
                    <h3>{entry.concept.title}</h3>
                    <StageMeter study={entry.study} />
                    <span className="card-mode">
                      {entry.project.mode === "demo" ? "데모" : "Gemini"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null;
        })
      )}
    </>
  );
}

export function CardDetailView({
  project,
  concept,
  study,
  busy,
  onBack,
  onStart,
  onResult,
}: {
  project: Project;
  concept: Concept;
  study: Study;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
  onResult: () => void;
}) {
  return (
    <>
      <div className="simple-toolbar">
        <button
          className="icon-button bordered"
          aria-label="카드함으로 돌아가기"
          onClick={onBack}
        >
          <ArrowLeft size={21} />
        </button>
        <span>카드 상세</span>
        <span className="status-pill subtle">
          {project.mode === "demo" ? "데모" : "Gemini"}
        </span>
      </div>
      <section className="detail-heading">
        <p>{documentTitle(project.name)}</p>
        <h1>{concept.title}</h1>
        <StageMeter study={project.studies[concept.id]} />
        <div className="detail-meta">
          <span>
            관련 페이지 {concept.pages.map((p) => `p.${p}`).join(", ")}
          </span>
          <span>{study.attempt}번째 학습</span>
        </div>
      </section>
      <div className="section-title">
        <h2>내 설명이 지난 기록</h2>
        <span>
          {study.phase === "done"
            ? "한 번 더 선명해졌어요"
            : "생각을 차근차근 남겨요"}
        </span>
      </div>
      {study.first ? (
        <div className="explanation-timeline">
          <article>
            <span className="timeline-dot" />
            <div className="timeline-caption">첫 설명</div>
            <p>{study.first}</p>
          </article>
          {study.turns.length > 0 && (
            <article>
              <span className="timeline-dot" />
              <div className="timeline-caption">
                AI와 나눈 {study.turns.length}개의 질문
              </div>
              <details>
                <summary>
                  질문과 답변 펼치기 <ChevronRight size={15} />
                </summary>
                {study.turns.map((turn, i) => (
                  <div className="saved-turn" key={i}>
                    <strong>
                      Q{i + 1}. {turn.question}
                    </strong>
                    <p>{turn.answer}</p>
                  </div>
                ))}
              </details>
            </article>
          )}
          {study.final && (
            <article className="latest">
              <span className="timeline-dot" />
              <div className="timeline-caption">
                마지막 재설명 <span>지금의 내 설명</span>
              </div>
              <p>{study.final}</p>
            </article>
          )}
          {study.draft && (
            <article>
              <span className="timeline-dot" />
              <div className="timeline-caption">저장한 초안</div>
              <p>{study.draft}</p>
            </article>
          )}
        </div>
      ) : (
        <EmptyState
          title="첫 설명을 기다리고 있어요"
          description="기억나는 만큼 설명해 보세요. 이곳에 나의 말이 차곡차곡 남아요."
        />
      )}
      <div className="page-bottom-action">
        <ArrowButton
          disabled={busy}
          onClick={study.phase === "done" ? onResult : onStart}
        >
          {study.phase === "done"
            ? "설명 결과 돌아보기"
            : project.studies[concept.id]
              ? "저장한 곳부터 설명하기"
              : "지금 설명하기"}
        </ArrowButton>
      </div>
    </>
  );
}

export function RecordsView({
  projects,
  busy,
  onSelect,
  onCreate,
}: {
  projects: Project[];
  busy: boolean;
  onSelect: (entry: CardEntry) => void;
  onCreate: () => void;
}) {
  const entries = cardsOf(projects),
    done = entries.filter((c) => c.study?.phase === "done"),
    active = entries.filter((c) => c.study && c.study.phase !== "done"),
    answers = entries.reduce((n, c) => n + (c.study?.turns.length || 0), 0);
  const chart = projects.slice(0, 6),
    max = Math.max(1, ...chart.map(completedCards));
  return (
    <>
      <PageTitle
        title="기록"
        description="내 말로 설명하며 지나온 자리"
        action={<span className="status-pill white">현재 학습 기록</span>}
      />
      <div className="record-stats">
        {[
          ["설명한 카드", done.length],
          ["학습 중", active.length],
          ["답한 질문", answers],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {entries.length ? (
        <>
          <section className="record-chart">
            <div className="section-title">
              <h2>문서별 설명 기록</h2>
              <span>완료한 카드 수</span>
            </div>
            <p>마지막 재설명까지 마친 카드를 모았어요.</p>
            <div className="bar-chart">
              {chart.map((p, i) => (
                <div className="bar-column" key={p.id}>
                  <strong className={i === 0 ? "accent-badge" : ""}>
                    {completedCards(p)}
                  </strong>
                  <div
                    className={`chart-bar ${i === 0 ? "recent" : ""}`}
                    style={{
                      height: `${Math.max(5, (completedCards(p) / max) * 140)}px`,
                    }}
                  />
                  <span title={p.name}>{documentTitle(p.name)}</span>
                </div>
              ))}
            </div>
          </section>
          <aside className="insight-card">
            <div>
              <span className="loop-symbol" />
              배움의 관찰
            </div>
            <p>
              {done.length
                ? `${done.length}개의 개념을 처음부터 다시 설명했어요. 내 설명이 어떻게 달라졌는지 돌아볼까요?`
                : "아직 완성하지 못한 설명도 괜찮아요. 한 번의 질문이 다음 설명을 더 단단하게 만들어요."}
            </p>
          </aside>
          <section className="record-projects">
            <div className="section-title">
              <h2>학습 프로젝트</h2>
              <span>{projects.length}개</span>
            </div>
            <div className="queue-list">
              {projects.map((p) => (
                <button
                  disabled={busy}
                  key={p.id}
                  onClick={() => {
                    const entry =
                      cardsOf([p]).find((c) => c.study?.phase === "done") ||
                      cardsOf([p])[0];
                    if (entry) onSelect(entry);
                  }}
                >
                  <div>
                    <strong>{documentTitle(p.name)}</strong>
                    <small>
                      {p.pageCount}페이지 · {p.concepts.length}개 카드
                    </small>
                  </div>
                  <span
                    className={`status-pill ${completedCards(p) ? "" : "subtle"}`}
                  >
                    {completedCards(p)} / {p.concepts.length}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title="설명할수록 기록이 쌓여요"
          description="첫 PDF를 등록하고 한 개념을 나만의 말로 설명해 보세요."
          onCreate={onCreate}
        />
      )}
    </>
  );
}
