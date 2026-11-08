import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackDialogue,
  learningContext,
  needsSmallerStep,
  sameQuestion,
  scaffoldHints,
} from "../src/lib/server/learning-dialogue";
import { newStudy } from "../src/lib/types";
import { demoFeedback, sample } from "../src/lib/server/demo";
import { groundAssessment } from "../src/lib/server/learning-ai";
import {
  assessmentResponseSchema,
  normalizeAssessmentResponse,
} from "../src/lib/server/assessment-response";

test("모른다는 도움 요청과 개념 설명 속 '모르는 부분'을 구분한다", () => {
  for (const answer of [
    "잘 모르겠어",
    "몰라",
    "무슨 뜻이야?",
    "힌트 주세요",
    "이해가 안 돼",
  ])
    assert.ok(needsSmallerStep(answer), answer);
  for (const answer of [
    "모르는 부분을 확인하는 학습 방법이야",
    "어려운 개념을 떠올리는 연습이야",
    "책 없이 설명해서 이해를 확인했어",
  ])
    assert.ok(!needsSmallerStep(answer), answer);
});

test("문장부호만 바꾼 질문은 반복으로 판정하되 다른 확인 질문은 유지한다", () => {
  assert.ok(sameQuestion("왜 그렇게 생각해?", "왜  그렇게 생각해！"));
  assert.ok(
    !sameQuestion("어떤 조건이 필요해?", "그 조건이 없다면 어떻게 돼?"),
  );
  assert.ok(!sameQuestion("x+y>0이면?", "x-y<0이면?"));
});

test("다음 질문에 첫 평가·최근의 확인된 이해·남은 목표를 함께 전달한다", () => {
  const feedback = {
    ...demoFeedback("인출 연습", "설명"),
    understood: ["기억에서 꺼내는 과정"],
    missing: ["다시 읽기와의 차이"],
  };
  const context = learningContext(
    sample.concepts[0],
    {
      ...newStudy(sample.concepts[0].id),
      firstAssessment: feedback,
      assessment: feedback,
    },
    "내 말로 설명했어",
  );
  assert.deepEqual(
    context.previousAssessment?.confirmedUnderstanding,
    feedback.understood,
  );
  assert.deepEqual(
    context.previousAssessment?.notYetExplained,
    feedback.missing,
  );
  assert.deepEqual(context.firstAssessment, feedback);
  assert.deepEqual(context.focusPages, sample.concepts[0].pages);
});

test("질문에 막히면 새 적용 문제 대신 직전 질문의 의미를 작은 단계로 확인한다", () => {
  const study = {
    ...newStudy("test"),
    turns: [
      {
        question: "간격을 두면 무엇이 달라질까?",
        answer: "잘 모르겠어",
        hints: [],
      },
    ],
  };
  const result = fallbackDialogue(sample.concepts[0], study, "잘 모르겠어");
  assert.match(result.question, /방금 질문/);
  assert.ok(!result.question.includes("쓰일 법한 상황"));
  const next = fallbackDialogue(
    sample.concepts[0],
    {
      ...study,
      turns: [
        ...study.turns,
        { question: result.question, answer: "모르겠어", hints: [] },
      ],
    },
    "모르겠어",
  );
  assert.notEqual(next.question, result.question);
});

test("이유를 묻는 질문의 누락 힌트를 조건 변경 힌트로 채우지 않는다", () => {
  const parsed = assessmentResponseSchema.parse(
    normalizeAssessmentResponse({
      question: "왜 기억에서 꺼내야 할까?",
      hints: null,
    }),
  );
  assert.equal(parsed.hints.length, 2);
  assert.match(parsed.hints[0], /결과/);
  assert.ok(!parsed.hints.join().includes("바뀌는 조건"));
  assert.match(scaffoldHints("조건이 바뀌면 어떻게 될까?")[0], /조건/);
});

test("근거 일부가 없어도 검증된 오류와 누락에 대한 보완 행동은 남긴다", () => {
  const result = groundAssessment(
    {
      ...demoFeedback("개념", "설명"),
      understood: ["근거 없는 칭찬"],
      errors: ["조건을 반대로 연결한 설명"],
      missing: ["아직 설명하지 않은 이유"],
      improve: ["더 공부하세요"],
      evidence: [
        {
          kind: "errors",
          claim: "조건을 반대로 연결한 설명",
          page: 1,
          quote: "원문 근거",
        },
        {
          kind: "missing",
          claim: "아직 설명하지 않은 이유",
          page: 1,
          quote: "원문 근거",
        },
      ],
    },
    [{ number: 1, text: "원문 근거" }],
  );
  assert.deepEqual(result.feedback.understood, []);
  assert.equal(result.feedback.improve.length, 2);
  assert.ok(
    result.feedback.improve.some((value) => value.includes("조건을 반대로")),
  );
  assert.ok(!result.feedback.improve.includes("더 공부하세요"));
  assert.ok(result.feedback.unverified.join().includes("미확인"));
});
