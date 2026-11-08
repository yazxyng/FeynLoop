import type { Project } from "./types";
import { learningDay, shiftDay, validLearningDay } from "./activity";

// 성공한 설명·답변 제출을 하루 단위로 합칩니다. 초안·힌트·실패한 요청은 제외합니다.
export function recordSummary(
  projects: Project[],
  period: "6" | "all",
  today = learningDay(),
) {
  const sunday = shiftDay(today, -new Date(today + "T00:00:00Z").getUTCDay());
  const start = shiftDay(sunday, -35);
  const days: Record<string, number> = {};
  const perProject: Record<string, { submissions: number; days: number }> = {};
  let completed = 0;
  let undated = 0;
  let restoredCompletions = 0;
  for (const project of projects) {
    const projectDays: Record<string, number> = Object.fromEntries(
      Object.entries(project.activity || {}).filter(
        ([day, count]) =>
          validLearningDay(day) &&
          day <= today &&
          Number.isSafeInteger(count) &&
          count > 0,
      ),
    );
    const completionDays: Record<string, number> = {};
    for (const study of Object.values(project.studies)) {
      if (study.phase !== "done") continue;
      if (!study.completedAt || Number.isNaN(Date.parse(study.completedAt))) {
        undated++;
        if (period === "all") completed++;
        continue;
      }
      const day = learningDay(new Date(study.completedAt));
      if (day > today) continue;
      if (period === "all" || day >= start) completed++;
      completionDays[day] = (completionDays[day] || 0) + 1;
    }
    // 제출 집계가 없는 날짜라도 완료 시각이 남아 있으면 마지막 재설명 1회는 확인할 수 있습니다.
    // 이미 제출 집계가 있는 날짜에는 더하지 않아 중복 계산을 막습니다.
    for (const [day, count] of Object.entries(completionDays))
      if (!projectDays[day]) {
        projectDays[day] = count;
        if (period === "all" || day >= start) restoredCompletions += count;
      }
    const selectedDays = Object.entries(projectDays).filter(
      ([day]) => period === "all" || day >= start,
    );
    perProject[project.id] = {
      submissions: selectedDays.reduce((sum, [, count]) => sum + count, 0),
      days: selectedDays.length,
    };
    for (const [day, count] of Object.entries(projectDays))
      days[day] = (days[day] || 0) + count;
  }
  const selectedDays = Object.entries(days).filter(
    ([day]) => period === "all" || day >= start,
  );
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const date = shiftDay(start, index * 7);
    const end = shiftDay(date, 7);
    const [, month, day] = date.split("-");
    const count = Object.entries(days)
      .filter(([key]) => key >= date && key < end)
      .reduce((sum, [, value]) => sum + value, 0);
    return {
      date,
      label: index === 5 ? "이번 주" : `${Number(month)}.${Number(day)}`,
      current: index === 5,
      count,
    };
  });
  return {
    completed,
    undated,
    restoredCompletions,
    weeks,
    perProject,
    submissions: selectedDays.reduce((sum, [, count]) => sum + count, 0),
    learningDays: selectedDays.length,
    todaySubmissions: days[today] || 0,
    currentWeekSubmissions: weeks[5].count,
  };
}
