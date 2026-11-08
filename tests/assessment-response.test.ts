import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessmentResponseSchema,
  normalizeAssessmentResponse,
} from "../src/lib/server/assessment-response";
import { groundAssessment } from "../src/lib/server/learning-ai";

test("정상 질문을 보존하면서 null·누락된 평가 배열·힌트를 안전한 빈 값으로 정리한다", () => {
  const raw = {
    question: "그 조건이 달라지면 어떻게 될까?",
    understood: null,
    errors: null,
    improve: [],
    unverified: [],
    evidence: null,
    hints: ["조건 하나만 골라 봐."],
    questionGrounding: null,
  };
  const parsed = assessmentResponseSchema.parse(
    normalizeAssessmentResponse(raw),
  );
  assert.equal(parsed.question, raw.question);
  assert.deepEqual(parsed.understood, []);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.missing, []);
  assert.equal(parsed.hints.length, 2);
  assert.equal(parsed.hints[0], raw.hints[0]);
  assert.ok(parsed.unverified.some((item) => item.includes("미확인")));
});

test("길거나 잘못된 판단·인용은 자르거나 근거를 만들어 채우지 않고 미확인으로 처리한다", () => {
  const quote = "가".repeat(651);
  const raw = {
    understood: ["유효한 판단", "근거 없는 판단", "나".repeat(1001)],
    errors: [],
    missing: [],
    improve: [],
    unverified: [],
    question: "왜 그럴까?",
    hints: ["단서1", "단서2", "단서3"],
    evidence: [
      {
        kind: "understood",
        claim: "유효한 판단",
        page: 1,
        quote: "원문에 있는 근거",
      },
      { kind: "understood", claim: "근거 없는 판단", page: 1, quote },
      {
        kind: "errors",
        claim: "틀린 판정",
        page: "1",
        quote: "원문에 있는 근거",
      },
    ],
    questionGrounding: {
      answerQuote: "가".repeat(121),
      page: 1,
      quote: "원문에 있는 근거",
    },
  };
  const before = structuredClone(raw);
  const parsed = assessmentResponseSchema.parse(
    normalizeAssessmentResponse(raw),
  );
  assert.equal(parsed.evidence.length, 1);
  assert.equal(parsed.questionGrounding, null);
  assert.deepEqual(parsed.hints, ["단서1", "단서2"]);
  const { feedback } = groundAssessment(parsed, [
    { number: 1, text: "원문에 있는 근거" },
  ]);
  assert.deepEqual(feedback.understood, ["유효한 판단"]);
  assert.deepEqual(raw, before);
});

test("알 수 없는 형식의 응답을 빈 성공 평가로 위장하지 않는다", () => {
  for (const invalid of [null, [], "문자열", { unrelated: true }])
    assert.equal(
      assessmentResponseSchema.safeParse(normalizeAssessmentResponse(invalid))
        .success,
      false,
    );
});
