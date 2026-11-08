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
