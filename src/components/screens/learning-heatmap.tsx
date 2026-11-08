"use client";
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent,
} from "react";
import { calendarDays } from "@/lib/activity";
import type { AccountProfile } from "@/lib/profile-types";

export default function LearningHeatmap({
  learning,
}: {
  learning: AccountProfile["learning"];
}) {
  const days = useMemo(() => calendarDays(learning.today), [learning.today]);
  const [selected, setSelected] = useState(learning.today);
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const showLatest = () => {
      element.scrollLeft = element.scrollWidth;
    };
    showLatest();
    const observer = new ResizeObserver(showLatest);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const messages = days.reduce(
    (sum, { day, future }) => sum + (future ? 0 : learning.days[day] || 0),
    0,
  );
  const months = days
    .filter((_, index) => index % 7 === 0)
    .map(({ day }, week) => ({ week, month: Number(day.slice(5, 7)) }))
    .filter(
      (month, index, list) =>
        index === 0 || month.month !== list[index - 1].month,
    );
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offsets: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const next = index + offsets[event.key];
    if (next >= 0 && next < days.length && !days[next].future) {
      setSelected(days[next].day);
      cells.current[next]?.focus();
    }
  }
  return (
    <section
      className="profile-card heatmap-card"
      aria-labelledby="heatmap-title"
    >
      <div className="profile-section-title">
        <div>
          <h2 id="heatmap-title">나의 학습 잔디</h2>
          <p>
            최근 1년 동안 <strong>{messages.toLocaleString()}번</strong>의
            생각을 꺼냈어요.
          </p>
        </div>
        <span className="profile-period">최근 1년</span>
      </div>
      <div className="heatmap-layout">
        <div className="heatmap-weekdays" aria-hidden="true">
          <span>월</span>
          <span>수</span>
          <span>금</span>
        </div>
        <div className="heatmap-scroll" ref={scroller}>
          <div className="heatmap-months" aria-hidden="true">
            {months.map(({ month, week }) => (
              <span style={{ left: week * 16 }} key={week}>
                {month}월
              </span>
            ))}
          </div>
          <div
            className="learning-heatmap"
            aria-label="일별 학습 메시지 수. 방향키로 날짜를 이동할 수 있어요."
          >
            {days.map(({ day, future }, index) => {
              const count = learning.days[day] || 0;
              const level =
                count === 0
                  ? 0
                  : count < 3
                    ? 1
                    : count < 6
                      ? 2
                      : count < 10
                        ? 3
                        : 4;
              return (
                <button
                  type="button"
                  key={day}
                  ref={(node) => {
                    cells.current[index] = node;
                  }}
                  className={`heatmap-day level-${level}${future ? " future" : ""}`}
                  disabled={future}
                  title={`${day} · ${count}회 학습`}
                  aria-label={`${day}, ${count}회 학습`}
                  aria-pressed={selected === day}
                  tabIndex={selected === day ? 0 : -1}
                  onFocus={() => setSelected(day)}
                  onClick={() => setSelected(day)}
                  onKeyDown={(event) => moveFocus(event, index)}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="heatmap-footer">
        <span aria-live="polite">
          {selected.replaceAll("-", ".")} · {learning.days[selected] || 0}회
          학습
        </span>
        <div className="heatmap-legend" aria-label="색이 진할수록 많은 학습">
          <span>적음</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i className={`level-${level}`} key={level} />
          ))}
          <span>많음</span>
        </div>
      </div>
      <p className="heatmap-note">
        설명·답변을 전송한 날을 기록해요. 날짜가 없는 과거 기록은 포함하지
        않아요. · 한국 시간 기준
      </p>
    </section>
  );
}
