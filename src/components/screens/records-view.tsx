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
  const { completed, undated, weeks } = recordSummary(
    projects,
    period,
    today || "1970-01-04",
  );
  const observation =
    period === "6" && undated > 0 && !completed
      ? "날짜가 없는 이전 기록은 전체 기간에서 확인해요. 과신 지수는 아직 미측정이에요."
      : completed
        ? `${completed}개의 카드를 끝까지 설명했어요. 점수 기록이 없어 과신은 아직 미측정이에요.`
        : "첫 설명을 남겨 보세요. 점수 기록이 쌓이면 과신 지수를 보여드릴게요.";
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
          <span>설명한 카드</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <span>메운 구멍</span>
          <strong aria-label="미측정">—</strong>
        </div>
        <div>
          <span>평균 과신</span>
          <strong aria-label="미측정">—</strong>
        </div>
      </section>
      <section
        className="records-calibration"
        aria-labelledby="calibration-title"
      >
        <div className="records-chart-heading">
          <h2 id="calibration-title">과신 지수</h2>
          <span>낮을수록 정확해요</span>
        </div>
        <p>내 예상 점수 − 실제 점수, 주별 평균</p>
        <div
          className="records-bars"
          role="img"
          aria-label="최근 6주 과신 지수 미측정. 예상 점수와 실제 점수가 아직 기록되지 않았어요."
        >
          {weeks.map((week) => (
            <div
              className={`records-bar-column ${week.current ? "current" : ""}`}
              key={week.date}
            >
              <span className="records-bar-value" aria-hidden="true">
                —
              </span>
              <div className="records-bar-placeholder" aria-hidden="true" />
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
        <h2 id="records-subjects-title">자료별 과신</h2>
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
                  aria-label="과신 지수 미측정"
                >
                  —
                </span>
                <span className="records-subject-status">미측정</span>
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
          메운 구멍과 과신 지수는 아직 측정하지 않아요. 임의의 점수로 표시하지
          않습니다.
        </p>
      </section>
    </div>
  );
}
