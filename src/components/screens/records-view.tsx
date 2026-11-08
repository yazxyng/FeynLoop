"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "@/lib/types";
import { cardsOf, documentTitle, type CardEntry } from "@/lib/presentation";
import { recordSummary } from "@/lib/records";
import { learningDay } from "@/lib/activity";

export default function RecordsView({
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
  const [period, setPeriod] = useState<"6" | "all">("6");
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(learningDay());
  }, []);
  // 정적 HTML에 빌드 당시의 주차가 고정되지 않게 브라우저에서 날짜를 정합니다.
  const {
    submissions,
    learningDays,
    todaySubmissions,
    currentWeekSubmissions,
    undated,
    restoredCompletions,
    weeks,
    perProject,
  } = recordSummary(projects, period, today || "1970-01-04");
  const maxCount = Math.max(10, ...weeks.map((week) => week.count));
  const observation = todaySubmissions
    ? `오늘 설명·답변을 ${todaySubmissions}번 보냈어요. 이번 주에는 ${currentWeekSubmissions}번 학습했어요.`
    : currentWeekSubmissions
      ? `이번 주에 ${currentWeekSubmissions}번 학습했어요. 오늘도 한 개념을 내 말로 설명해 볼까요?`
      : undated
        ? "날짜가 없는 이전 설명은 주별 그래프에서 제외해요. 새로 보낸 설명부터 기록이 쌓여요."
        : "첫 설명을 남겨 보세요. 설명과 답변을 보낼 때마다 학습량이 쌓여요.";
  return (
    <div className="records-screen">
      <header className="records-header">
        <h1>기록</h1>
        <label className="records-period">
          <span className="sr-only">기록 기간</span>
          <select
            aria-label="기록 기간"
            value={period}
            onChange={(event) => setPeriod(event.target.value as "6" | "all")}
            disabled={busy}
          >
            <option value="6">최근 6주</option>
            <option value="all">전체 기간</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </header>
      <section className="records-summary" aria-label="학습 통계">
        <div>
          <span>학습 횟수</span>
          <strong>{today ? submissions : "—"}</strong>
        </div>
        <div>
          <span>학습한 날</span>
          <strong>{today ? learningDays : "—"}</strong>
        </div>
        <div>
          <span>오늘 학습</span>
          <strong>{today ? todaySubmissions : "—"}</strong>
        </div>
      </section>
      <section
        className="records-calibration"
        aria-labelledby="calibration-title"
      >
        <div className="records-chart-heading">
          <h2 id="calibration-title">주별 학습량</h2>
          <span>눈금 최대 {maxCount}회</span>
        </div>
        <p>최근 6주 · 설명·답변 제출 횟수</p>
        <div
          className="records-bars"
          role="img"
          aria-label={`최근 6주 학습량. ${weeks.map((week) => `${week.label} ${week.count}회`).join(", ")}`}
        >
          {weeks.map((week) => (
            <div
              className={`records-bar-column ${week.current ? "current" : ""}`}
              key={week.date}
            >
              <div className="records-bar-plot">
                <span className="records-bar-value" aria-hidden="true">
                  {today ? week.count : "—"}
                </span>
                <div
                  className="records-bar"
                  style={{ height: `${(week.count / maxCount) * 80}px` }}
                  aria-hidden="true"
                />
              </div>
              <span className="records-bar-date">
                {today ? week.label : week.current ? "이번 주" : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <aside className="records-observation">
        <div>
          <span className="loop-symbol" aria-hidden="true" />
          <span>짝꿍의 관찰</span>
        </div>
        <p>{observation}</p>
      </aside>
      <section
        className="records-subjects"
        aria-labelledby="records-subjects-title"
      >
        <h2 id="records-subjects-title">자료별 학습량</h2>
        <div className="records-subject-list">
          {projects.length ? (
            projects.map((project) => (
              <button
                key={project.id}
                disabled={busy}
                onClick={() => {
                  const entries = cardsOf([project]);
                  const entry =
                    entries.find((item) => item.study?.phase === "done") ||
                    entries[0];
                  if (entry) onSelect(entry);
                }}
              >
                <strong title={project.name}>
                  {documentTitle(project.name)}
                </strong>
                <span
                  className="records-subject-score"
                  aria-label={`${perProject[project.id]?.submissions || 0}회 학습`}
                >
                  {perProject[project.id]?.submissions || 0}회
                </span>
                <span className="records-subject-status">
                  학습 {perProject[project.id]?.days || 0}일
                </span>
              </button>
            ))
          ) : (
            <div className="records-empty">
              <p>아직 등록한 자료가 없어요.</p>
              <button disabled={busy} onClick={onCreate}>
                첫 자료 등록하기
              </button>
            </div>
          )}
        </div>
        <p className="records-measurement-note">
          설명·답변을 성공적으로 보낼 때마다 1회 집계해요. 초안 저장·힌트·실패한
          요청은 제외해요.
          {undated > 0 && " 날짜가 없는 이전 기록은 주별 집계에서 제외해요."}
          {restoredCompletions > 0 &&
            " 제출 내역이 없는 이전 완료 기록은 마지막 재설명 1회로 복원했어요."}
        </p>
      </section>
    </div>
  );
}
