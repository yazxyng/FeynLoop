import { test } from "node:test";
import assert from "node:assert/strict";
import { recordSummary } from "../src/lib/records";
import { newStudy, type Project } from "../src/lib/types";

test("기간별 기록은 완료 날짜만 사용하고 날짜 없는 이전 기록을 만들어 채우지 않는다", () => {
  const dates = [
    "2026-10-03T15:00:00Z",
    "2026-10-03T14:59:59Z",
    undefined,
    "invalid",
    "2026-11-09T00:00:00Z",
  ];
  const project: Project = {
    id: "test",
    name: "자료",
    sourceType: "text",
    createdAt: "2026-11-08",
    pageCount: 1,
    concepts: [],
    version: 1,
    mode: "demo",
    studies: Object.fromEntries(
      dates.map((completedAt, index) => [
        String(index),
        { ...newStudy(String(index)), phase: "done", completedAt },
      ]),
    ),
  };
  const recent = recordSummary([project], "6", "2026-11-08");
  assert.equal(recent.completed, 1);
  assert.equal(recent.undated, 2);
  assert.equal(recent.weeks[0].label, "10.4");
  assert.equal(recent.weeks[5].label, "이번 주");
  assert.equal(recordSummary([project], "all", "2026-11-08").completed, 4);
  assert.equal(recordSummary([], "6", "2026-11-08").completed, 0);
});

test("오늘 제출하면 이번 주 학습량이 증가하고 날짜별·자료별 합계가 일치한다", () => {
  const base: Project = {
    id: "a",
    name: "자료",
    createdAt: "2026-11-08",
    pageCount: 1,
    concepts: [],
    studies: {},
    version: 1,
    mode: "demo",
    activity: {
      "2026-11-01": 2,
      "2026-11-07": 1,
      "2026-11-08": 3,
      "2026-09-01": 4,
      "2026-11-09": 999,
      "2026-02-30": 100,
      bad: 3,
      "2026-11-06": -5,
    },
  };
  const other = { ...base, id: "b", activity: { "2026-11-08": 2 } };
  const summary = recordSummary([base, other], "6", "2026-11-08");
  assert.equal(summary.submissions, 8);
  assert.equal(summary.todaySubmissions, 5);
  assert.equal(summary.learningDays, 3);
  assert.equal(summary.currentWeekSubmissions, 5);
  assert.equal(summary.weeks[4].count, 3);
  assert.equal(summary.weeks[5].count, 5);
  assert.deepEqual(summary.perProject.a, { submissions: 6, days: 3 });
  assert.equal(
    recordSummary([base, other], "all", "2026-11-08").submissions,
    12,
  );
  const updated = { ...base, activity: { ...base.activity, "2026-11-08": 4 } };
  assert.equal(
    recordSummary([updated, other], "6", "2026-11-08").weeks[5].count,
    6,
  );
});

test("완료 시각으로 복원한 마지막 설명은 기존 제출 집계와 중복 합산하지 않는다", () => {
  const project: Project = {
    id: "a",
    name: "자료",
    createdAt: "2026-11-08",
    pageCount: 1,
    concepts: [],
    version: 1,
    mode: "demo",
    studies: {
      a: {
        ...newStudy("a"),
        phase: "done",
        completedAt: "2026-11-08T01:00:00Z",
      },
    },
  };
  assert.equal(recordSummary([project], "6", "2026-11-08").todaySubmissions, 1);
  const tracked = { ...project, activity: { "2026-11-08": 5 } };
  assert.equal(recordSummary([tracked], "6", "2026-11-08").todaySubmissions, 5);
  assert.equal(
    recordSummary([tracked], "6", "2026-11-08").restoredCompletions,
    0,
  );
});
