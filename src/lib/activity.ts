import type { LearningDays } from "./profile-types";

const DAY_MS = 86400000;
export function validLearningDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day + "T00:00:00Z")) &&
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day
  );
}
export function learningDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(day + "T00:00:00Z") + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
export function activitySummary(days: LearningDays, today = learningDay()) {
  const dates = Object.keys(days)
    .filter(
      (day) =>
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        day <= today &&
        Number.isFinite(days[day]) &&
        days[day] > 0,
    )
    .sort();
  let longestStreak = 0,
    streak = 0,
    previous = "";
  for (const day of dates) {
    streak = previous && shiftDay(previous, 1) === day ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = day;
  }
  let currentStreak = 0;
  let cursor = days[today] > 0 ? today : shiftDay(today, -1);
  while (days[cursor] > 0) {
    currentStreak++;
    cursor = shiftDay(cursor, -1);
  }
  return {
    today,
    currentStreak,
    longestStreak,
    totalDays: dates.length,
    totalMessages: dates.reduce((sum, day) => sum + days[day], 0),
  };
}
export function calendarDays(today: string) {
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const start = shiftDay(today, -364 - weekday);
  return Array.from({ length: 371 }, (_, index) => {
    const day = shiftDay(start, index);
    return { day, future: day > today };
  });
}
