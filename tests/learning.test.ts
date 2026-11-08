import { test } from "node:test";
import assert from "node:assert/strict";
import {
  present,
  applyCommand,
  type Command,
} from "../src/lib/server/learning";
import {
  validateGrounding,
  groundAssessment,
} from "../src/lib/server/learning-ai";
import { newStudy, type Feedback } from "../src/lib/types";
import { sample, demoFeedback } from "../src/lib/server/demo";
import type { StoredProject } from "../src/lib/server/models";
function record(): StoredProject {
  return {
    owner: "demo:test",
    pages: sample.pages,
    project: {
      id: crypto.randomUUID(),
      name: "test",
      createdAt: new Date().toISOString(),
      pageCount: 3,
      concepts: sample.concepts,
      studies: {},
      version: 0,
      mode: "demo",
      receipts: [],
    },
  };
}
test("응답 필드 제한: 학습 중 비공개 평가·힌트 계획·인용문 차단", () => {
  const r = record(),
    id = r.project.concepts[0].id;
  const f = {
    ...demoFeedback("개념", "설명"),
    hint: "SECRET_HINT",
    evidence: [
      {
        kind: "understood" as const,
        claim: "확인",
        page: 1,
        quote: "SECRET_SOURCE",
      },
    ],
  };
  r.project.studies[id] = {
    ...newStudy(id),
    phase: "rewrite",
    assessment: f,
    firstAssessment: f,
    hintPlan: ["SECRET_HINT"],
    evidenceViews: [{ page: 1, viewedAt: "now" }],
  };
  const safe = JSON.stringify(present(r.project, r.pages));
  assert.ok(!safe.includes("SECRET"));
  assert.ok(!safe.includes("assessment"));
  assert.ok(!safe.includes("receipts"));
  assert.ok(!safe.includes("quote"));
});
test("AI 평가: 원문에 없는 인용과 근거 없는 판단 차단", () => {
  const f: Feedback = {
    ...demoFeedback("개념", "설명"),
    understood: ["주장"],
    evidence: [],
  };
  assert.throws(() => validateGrounding(f, sample.pages), /근거/);
  f.evidence = [
    { kind: "understood", claim: "주장", page: 1, quote: "존재하지 않는 인용" },
  ];
  assert.throws(() => validateGrounding(f, sample.pages), /근거/);
  f.evidence[0].quote = "문서에 없는 문구";
  assert.throws(() => validateGrounding(f, sample.pages));
  f.evidence[0].quote = "없는 단어";
  assert.throws(() => validateGrounding(f, sample.pages));
  f.evidence[0].quote = sample.pages[0].text.slice(0, 15);
  assert.doesNotThrow(() => validateGrounding(f, sample.pages));
});
test("근거 비교는 공백·줄바꿈·한글 조합 차이를 허용하고 의미 변경은 차단한다", () => {
  const pages = [
    { number: 1, text: "가나다\n  학습\t원리. x = 2".normalize("NFD") },
  ];
  const feedback: Feedback = {
    ...demoFeedback("개념", "설명"),
    understood: ["학습 원리"],
    evidence: [
      {
        kind: "understood",
        claim: "학습\n원리",
        page: 1,
        quote: "가나다 학습 원리.",
      },
    ],
  };
  assert.doesNotThrow(() => validateGrounding(feedback, pages));
  for (const quote of ["x = 3", "학습의 원리", "가나다 ... 원리.", "   "]) {
    feedback.evidence[0].quote = quote;
    assert.throws(() => validateGrounding(feedback, pages));
  }
});

test("일부 근거가 틀려도 검증된 평가만 유지하고 나머지는 미확인 처리한다", () => {
  const feedback: Feedback = {
    ...demoFeedback("개념", "설명"),
    understood: ["유효한 판단"],
    errors: ["근거 없는 오답 판정"],
    missing: ["근거 없는 누락 판정"],
    improve: ["미검증 조언"],
    change: "전부 이해했다는 미검증 결론",
    evidence: [
      {
        kind: "understood",
        claim: "유효한 판단",
        page: 1,
        quote: sample.pages[0].text.slice(0, 20),
      },
      {
        kind: "errors",
        claim: "근거 없는 오답 판정",
        page: 999,
        quote: sample.pages[0].text.slice(0, 20),
      },
    ],
  };
  const before = structuredClone(feedback);
  const result = groundAssessment(feedback, sample.pages);
  assert.deepEqual(result.feedback.understood, ["유효한 판단"]);
  assert.deepEqual(result.feedback.errors, []);
  assert.deepEqual(result.feedback.missing, []);
  assert.deepEqual(result.feedback.improve, []);
  assert.equal(result.feedback.evidence.length, 1);
  assert.ok(
    result.feedback.unverified.some((item) => item.includes("평가 2개")),
  );
  assert.ok(result.feedback.change.includes("보류"));
  assert.deepEqual(feedback, before);
  assert.doesNotThrow(() => validateGrounding(result.feedback, sample.pages));
});

test("제출 실패 시 입력과 학습 단계 유지", async () => {
  const r = record(),
    id = r.project.concepts[0].id;
  r.project.studies[id] = { ...newStudy(id), draft: "입력 유지" };
  const command: Command = {
    action: "submit",
    conceptId: id,
    version: 0,
    requestId: crypto.randomUUID(),
    text: " ",
  };
  await assert.rejects(applyCommand(r, command));
  assert.equal(r.project.studies[id].draft, "입력 유지");
  assert.equal(r.project.studies[id].phase, "explain");
});

test("프록시 내부 주소와 달라도 실제 요청 호스트가 같으면 허용한다", async () => {
  const { guardOrigin } = await import("../src/lib/server/http");
  assert.doesNotThrow(() =>
    guardOrigin(
      new Request("http://localhost:3011/api/projects", {
        headers: {
          host: "127.0.0.1:3011",
          origin: "http://127.0.0.1:3011",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  );
  assert.throws(() =>
    guardOrigin(
      new Request("http://localhost:3011/api/projects", {
        headers: {
          host: "127.0.0.1:3011",
          origin: "http://other.test",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  );
});
