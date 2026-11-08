import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activitySummary,
  learningDay,
  calendarDays,
  shiftDay,
} from "../src/lib/activity";

test("학습 날짜는 한국 시간의 자정 경계를 따른다", () => {
  assert.equal(learningDay(new Date("2026-11-07T14:59:59Z")), "2026-11-07");
  assert.equal(learningDay(new Date("2026-11-07T15:00:00Z")), "2026-11-08");
});
test("오늘 또는 어제까지 이어진 연속 학습과 최장 기록을 구분한다", () => {
  const days = {
    "2026-11-01": 2,
    "2026-11-02": 1,
    "2026-11-03": 1,
    "2026-11-07": 1,
    "2026-11-08": 4,
  };
  assert.deepEqual(activitySummary(days, "2026-11-08"), {
    today: "2026-11-08",
    currentStreak: 2,
    longestStreak: 3,
    totalDays: 5,
    totalMessages: 9,
  });
  assert.equal(activitySummary(days, "2026-11-09").currentStreak, 2);
  assert.equal(activitySummary(days, "2026-11-10").currentStreak, 0);
});
test("윤년·빈 기록·미래 날짜를 처리하고 잔디의 날짜를 중복하지 않는다", () => {
  assert.equal(shiftDay("2024-02-28", 1), "2024-02-29");
  assert.equal(activitySummary({}, "2026-11-08").currentStreak, 0);
  assert.equal(activitySummary({ "2026-11-09": 5 }, "2026-11-08").totalDays, 0);
  const cells = calendarDays("2026-11-08");
  assert.equal(new Set(cells.map((cell) => cell.day)).size, 371);
  assert.ok(cells.some((cell) => cell.day === "2026-11-08" && !cell.future));
  assert.ok(
    cells
      .filter((cell) => cell.future)
      .every((cell) => cell.day > "2026-11-08"),
  );
});
