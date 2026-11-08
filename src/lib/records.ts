import type { Project } from "./types";
import { learningDay, shiftDay } from "./activity";

export function recordSummary(
  projects: Project[],
  period: "6" | "all",
  today = learningDay(),
) {
  const sunday = shiftDay(today, -new Date(today + "T00:00:00Z").getUTCDay());
  const start = shiftDay(sunday, -35);
  let completed = 0;
  let undated = 0;
  for (const project of projects)
    for (const study of Object.values(project.studies)) {
      if (study.phase !== "done") continue;
      const validDate =
        study.completedAt && !Number.isNaN(Date.parse(study.completedAt));
      if (!validDate) {
        undated++;
        if (period === "all") completed++;
        continue;
      }
      const day = learningDay(new Date(study.completedAt!));
      if (day <= today && (period === "all" || day >= start)) completed++;
    }
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const date = shiftDay(start, index * 7);
    const [, month, day] = date.split("-");
    return {
      date,
      label: index === 5 ? "이번 주" : `${Number(month)}.${Number(day)}`,
      current: index === 5,
    };
  });
  return { completed, undated, weeks };
}
