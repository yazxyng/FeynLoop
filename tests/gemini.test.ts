import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  generateGemini,
  geminiConfigured,
  DEFAULT_GEMINI_MODEL,
} from "../src/lib/server/gemini";
import { extractConcepts, evaluate } from "../src/lib/server/learning-ai";
import { applyCommand } from "../src/lib/server/learning";
import { newStudy } from "../src/lib/types";
import { sample, demoFeedback } from "../src/lib/server/demo";
import { GET as config } from "../src/app/api/config/route";
import type { StoredProject } from "../src/lib/server/models";

function environment(
  t: TestContext,
  values: Record<string, string | undefined> = {},
) {
  const replacement = {
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_MODEL: undefined,
    ...values,
  };
  const previous = new Map(
    Object.keys(replacement).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(replacement)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
function success(value: unknown) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            { thought: true, text: "private internal thought" },
            { text: JSON.stringify(value) },
          ],
        },
      },
    ],
  });
}
const resultSchema = z.object({
  answer: z.string(),
  count: z.number().int().default(1),
});

test("PDF용 중첩 스키마의 길이·정수·배열 제한은 전송에서 빼고 서버에서 검증한다", async (t) => {
  environment(t);
  const schema = z.object({
    concepts: z
      .array(
        z.object({
          title: z.string().min(1).max(150),
          pages: z.array(z.number().int().positive()).min(1).max(150),
        }),
      )
      .min(1)
      .max(10),
  });
  let responseValue: unknown = { concepts: [{ title: "개념", pages: [1] }] };
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const remote = body.generationConfig.responseJsonSchema;
      const serialized = JSON.stringify(remote);
      for (const key of [
        "minLength",
        "maxLength",
        "exclusiveMinimum",
        "maximum",
        "minItems",
        "maxItems",
      ])
        assert.ok(!serialized.includes(`"${key}"`), key);
      assert.equal(
        remote.properties.concepts.items.properties.pages.items.type,
        "integer",
      );
      assert.deepEqual(remote.properties.concepts.items.required, [
        "title",
        "pages",
      ]);
      return success(responseValue);
    },
  );
  assert.deepEqual(await generateGemini("지시", {}, schema), responseValue);
  for (const invalid of [
    { concepts: [] },
    { concepts: [{ title: "", pages: [1] }] },
    { concepts: [{ title: "개념", pages: [0] }] },
    { concepts: [{ title: "개념", pages: Array(151).fill(1) }] },
  ]) {
    responseValue = invalid;
    await assert.rejects(
      generateGemini("지시", {}, schema),
      (error) => (error as { status: number }).status === 502,
    );
  }
});

test("전체 JSON 코드블록 포장만 제거하고 안의 데이터는 그대로 검증한다", async (t) => {
  environment(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: '```json\n{"answer":"완료"}\n```' }] },
        },
      ],
    }),
  );
  assert.deepEqual(await generateGemini("지시", {}, resultSchema), {
    answer: "완료",
    count: 1,
  });
});

test("Gemini 헤더 수신 후 본문 읽기가 중단돼도 시간 초과로 안내한다", async (t) => {
  environment(t);
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new DOMException("private", "AbortError");
    },
  }));
  await assert.rejects(
    generateGemini("지시", {}, resultSchema),
    (error) => (error as { status: number }).status === 504,
  );
});

test("Gemini 요청: 공식 REST 주소·키 헤더·시스템 입력 분리·응답 스키마", async (t) => {
  environment(t);
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(
        String(url),
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
      );
      assert.ok(!String(url).includes("test-gemini-key"));
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-goog-api-key"), "test-gemini-key");
      assert.equal(headers.get("authorization"), null);
      const body = JSON.parse(String(init?.body));
      assert.ok(body.systemInstruction.parts[0].text.includes("학습 지시"));
      assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), {
        document: "비공개 문서",
      });
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.generationConfig.candidateCount, 1);
      const schema = body.generationConfig.responseJsonSchema;
      assert.equal(schema.properties.answer.type, "string");
      assert.ok(!JSON.stringify(schema).includes("$schema"));
      assert.ok(!JSON.stringify(schema).includes("default"));
      assert.ok(!("messages" in body));
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "숨겨야 하는 생각" },
                { text: '{"answer":' },
                { text: '"완료","count":2}' },
              ],
            },
          },
        ],
      });
    },
  );
  assert.deepEqual(
    await generateGemini(
      "학습 지시",
      { document: "비공개 문서" },
      resultSchema,
    ),
    { answer: "완료", count: 2 },
  );
  assert.equal(fetch.mock.callCount(), 1);
});
test("기존 OpenAI 키만 있으면 데모이며 Gemini 호출을 하지 않는다", async (t) => {
  environment(t, { GEMINI_API_KEY: undefined, LLM_API_KEY: "test-old-key" });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("호출하면 안 됨");
  });
  assert.equal(geminiConfigured(), false);
  assert.equal((await config().json()).ai, "demo");
  await assert.rejects(
    generateGemini("지시", {}, resultSchema),
    (e) => (e as { status: number }).status === 503,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
test("Gemini 오류: 한도·키 권한·모델·서버 오류를 안내하고 자동 재시도하지 않는다", async (t) => {
  environment(t);
  for (const [status, expected] of [
    [429, 429],
    [401, 503],
    [403, 503],
    [404, 503],
    [500, 502],
  ]) {
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        { error: { message: "PRIVATE_PROVIDER_DETAIL" } },
        { status },
      ),
    );
    await assert.rejects(generateGemini("지시", {}, resultSchema), (e) => {
      const error = e as Error & { status: number };
      assert.equal(error.status, expected);
      assert.ok(!error.message.includes("PRIVATE_PROVIDER_DETAIL"));
      assert.ok(!error.message.includes("test-gemini-key"));
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});
test("빈 응답·차단·잘린 JSON·형식 불일치를 성공으로 처리하지 않는다", async (t) => {
  environment(t);
  const cases: [unknown, number][] = [
    [{ promptFeedback: { blockReason: "SAFETY" } }, 422],
    [{ candidates: [{ finishReason: "SAFETY" }] }, 422],
    [
      {
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: '{"answer":"partial"}' }] },
          },
        ],
      },
      502,
    ],
    [{ candidates: [{ finishReason: "STOP", content: { parts: [] } }] }, 502],
    [
      {
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "only thought", thought: true }] },
          },
        ],
      },
      502,
    ],
    [
      {
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "invalid json" }] },
          },
        ],
      },
      502,
    ],
    [
      {
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"wrong":true}' }] },
          },
        ],
      },
      502,
    ],
  ];
  for (const [body, expected] of cases) {
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      Response.json(body),
    );
    await assert.rejects(
      generateGemini("지시", {}, resultSchema),
      (e) => (e as { status: number }).status === expected,
    );
    fetch.mock.restore();
  }
});
test("연결 시간 초과와 잘못된 모델 경로 처리", async (t) => {
  environment(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("not public", "TimeoutError");
  });
  await assert.rejects(
    generateGemini("지시", {}, resultSchema),
    (e) => (e as { status: number }).status === 504,
  );
  fetch.mock.restore();
  process.env.GEMINI_MODEL = "gemini-foo/../../other";
  const blocked = t.mock.method(globalThis, "fetch", async () =>
    success({ answer: "x" }),
  );
  await assert.rejects(
    generateGemini("지시", {}, resultSchema),
    (e) => (e as { status: number }).status === 503,
  );
  assert.equal(blocked.mock.callCount(), 0);
});
test("Gemini 개념 추출·평가: 기존 근거 검증과 첫 설명·직전 답변 전달 유지", async (t) => {
  environment(t, { GEMINI_MODEL: "gemini-3.1-flash-lite" });
  const concepts = sample.concepts.slice(0, 5);
  let payload: Record<string, unknown> = {};
  const first = t.mock.method(globalThis, "fetch", async () =>
    success({ concepts }),
  );
  const extracted = await extractConcepts(sample.pages, true);
  assert.equal(extracted.length, 5);
  assert.notEqual(extracted[0].id, concepts[0].id);
  first.mock.restore();
  const study = {
    ...newStudy(concepts[0].id),
    first: "첫 설명",
    turns: [{ question: "질문", answer: "직전 답변", hints: [] }],
    evidenceViews: [{ page: 1, viewedAt: "2026-11-07" }],
  };
  const feedback = {
    ...demoFeedback("인출 연습", "설명"),
    understood: ["문서에 근거한 판단"],
    evidence: [
      {
        kind: "understood",
        claim: "문서에 근거한 판단",
        page: 1,
        quote: sample.pages[0].text.slice(0, 20),
      },
    ],
    hints: ["첫 단서", "다음 단서"],
    questionGrounding: {
      answerQuote: "설명",
      page: 1,
      quote: sample.pages[0].text.slice(0, 20),
    },
  };
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      payload = JSON.parse(body.contents[0].parts[0].text);
      return success(feedback);
    },
  );
  const assessed = await evaluate(
    sample.pages,
    concepts[0],
    study,
    "최종 설명",
    true,
    true,
  );
  assert.equal(assessed.feedback.understood[0], "문서에 근거한 판단");
  assert.equal(assessed.hints.length, 2);
  assert.equal(payload.firstExplanation, "첫 설명");
  assert.equal(payload.explanation, "최종 설명");
  assert.equal(payload.latestAnswer, "최종 설명");
  assert.equal(payload.lastQuestion, "질문");
  assert.deepEqual(payload.previousQuestions, ["질문"]);
  assert.equal(payload.remainingQuestions, 2);
  assert.equal(payload.questionMode, "probe");
  assert.deepEqual(payload.turns, study.turns);
  assert.deepEqual(payload.evidenceViews, study.evidenceViews);
  fetch.mock.restore();
  t.mock.method(globalThis, "fetch", async () =>
    success({
      ...feedback,
      evidence: [{ ...feedback.evidence[0], quote: "문서에 전혀 없는 인용" }],
    }),
  );
  const uncertain = await evaluate(
    sample.pages,
    concepts[0],
    study,
    "설명",
    true,
    false,
  );
  assert.deepEqual(uncertain.feedback.understood, []);
  assert.deepEqual(uncertain.feedback.evidence, []);
  assert.ok(
    uncertain.feedback.unverified.some((item) => item.includes("미확인")),
  );
  assert.equal(uncertain.feedback.question, feedback.question);
  assert.deepEqual(uncertain.hints, feedback.hints);
  const finalUncertain = await evaluate(
    sample.pages,
    concepts[0],
    study,
    "재설명",
    true,
    true,
  );
  assert.equal(finalUncertain.feedback.question, "");
  assert.ok(finalUncertain.feedback.change.includes("보류"));
});

test("반복 질문·없는 문서 근거·답변에 없는 표현은 그대로 노출하지 않는다", async (t) => {
  environment(t);
  const concept = sample.concepts[0];
  const study = {
    ...newStudy(concept.id),
    turns: [
      {
        question: "왜 그렇게 생각해?",
        answer: "기억에서 꺼내야 해",
        hints: [],
      },
    ],
  };
  const answer = "책 없이 기억에서 꺼내야 해";
  const base = {
    ...demoFeedback(concept.title, answer),
    question: "책 없이 떠올리는 게 왜 필요할까?",
    hints: ["사용하면 안 될 힌트 1", "사용하면 안 될 힌트 2"],
    questionGrounding: {
      answerQuote: "기억에서 꺼내야 해",
      page: 1,
      quote: sample.pages[0].text.slice(0, 20),
    },
  };
  let output = base;
  const fetch = t.mock.method(globalThis, "fetch", async () => success(output));
  for (const variant of [
    { ...base, question: study.turns[0].question },
    { ...base, questionGrounding: { ...base.questionGrounding, page: 999 } },
    {
      ...base,
      questionGrounding: {
        ...base.questionGrounding,
        answerQuote: "답변에 없는 내용",
      },
    },
    { ...base, question: "왜 그럴까? 예는 뭘까?" },
    {
      ...base,
      question: "교재의 1쪽 내용을 보면 정답이 나와 있는데, 어떻게 생각해?",
    },
    {
      ...base,
      question: sample.pages[0].text.slice(0, 60) + " 어떻게 생각해?",
    },
  ]) {
    output = variant;
    const result = await evaluate(
      sample.pages,
      concept,
      study,
      answer,
      true,
      false,
    );
    assert.ok(result.feedback.question.includes(answer));
    assert.notEqual(result.feedback.question, variant.question);
    assert.ok(!result.hints.includes(base.hints[0]));
  }
  assert.equal(
    fetch.mock.callCount(),
    6,
    "질문 품질 오류에도 추가 AI 호출 없이 처리",
  );
  output = {
    ...base,
    hints: [
      sample.pages[0].text.slice(0, 60),
      "교재의 1쪽 내용을 보면 정답이 있어.",
    ],
  };
  const withSafeHints = await evaluate(
    sample.pages,
    concept,
    study,
    answer,
    true,
    false,
  );
  assert.equal(withSafeHints.feedback.question, base.question);
  assert.ok(!withSafeHints.hints.includes(output.hints[0]));
  const finished = await evaluate(
    sample.pages,
    concept,
    { ...study, turns: Array(3).fill(study.turns[0]) },
    answer,
    true,
    false,
  );
  assert.equal(finished.feedback.question, "");
});

test("채팅 평가의 보조 항목이 잘못돼도 근거 있는 맞춤 질문을 유지한다", async (t) => {
  environment(t);
  const answer = "책을 덮고 떠올려 봤어";
  const question = "바로 떠오르지 않을 때는 어떻게 해 보고 싶어?";
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    success({
      question,
      understood: [],
      errors: null,
      missing: null,
      improve: [],
      unverified: [],
      hint: null,
      hints: null,
      evidence: [
        {
          kind: "understood",
          claim: "잘못된 보조 근거",
          page: 1,
          quote: "가".repeat(651),
        },
      ],
      questionGrounding: {
        answerQuote: "책을 덮고",
        page: 1,
        quote: sample.pages[0].text.slice(0, 20),
      },
    }),
  );
  const result = await evaluate(
    sample.pages,
    sample.concepts[0],
    newStudy(sample.concepts[0].id),
    answer,
    true,
    false,
  );
  assert.equal(result.feedback.question, question);
  assert.equal(result.hints.length, 2);
  assert.deepEqual(result.feedback.evidence, []);
  assert.ok(result.feedback.unverified.some((item) => item.includes("미확인")));
  assert.equal(fetch.mock.callCount(), 1);
});

test("짧은 PDF의 소수 개념은 허용하지만 빈 결과·10개 초과·없는 페이지는 거부한다", async (t) => {
  environment(t);
  let concepts = [sample.concepts[0]];
  t.mock.method(globalThis, "fetch", async () => success({ concepts }));
  assert.equal((await extractConcepts(sample.pages, true)).length, 1);
  for (const invalid of [
    [],
    Array(11).fill(sample.concepts[0]),
    [{ ...sample.concepts[0], pages: [999] }],
  ]) {
    concepts = invalid;
    await assert.rejects(
      extractConcepts(sample.pages, true),
      (error) => (error as { status: number }).status === 502,
    );
  }
});
test("Gemini 한도 초과 시 서버의 학습 단계·초안·질문 이력을 유지한다", async (t) => {
  environment(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: {} }, { status: 429 }),
  );
  const concept = sample.concepts[0];
  const record: StoredProject = {
    owner: "demo:test",
    pages: sample.pages,
    project: {
      id: crypto.randomUUID(),
      name: "test",
      createdAt: new Date().toISOString(),
      pageCount: 3,
      concepts: [concept],
      studies: {
        [concept.id]: { ...newStudy(concept.id), draft: "유지할 초안" },
      },
      version: 3,
      mode: "live",
      receipts: [],
    },
  };
  const before = structuredClone(record);
  await assert.rejects(
    applyCommand(record, {
      requestId: crypto.randomUUID(),
      version: 3,
      conceptId: concept.id,
      action: "submit",
      text: "작성한 설명",
    }),
    (e) => (e as { status: number }).status === 429,
  );
  assert.deepEqual(record, before);
});

test("Gemini가 400으로 반환하는 잘못된 키도 설정 오류로 안내한다", async (t) => {
  environment(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: {
          message: "PRIVATE_DETAIL",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      },
      { status: 400 },
    ),
  );
  await assert.rejects(generateGemini("지시", {}, resultSchema), (e) => {
    const error = e as Error & { status: number };
    assert.equal(error.status, 503);
    assert.ok(error.message.includes("GEMINI_API_KEY"));
    assert.ok(!error.message.includes("PRIVATE_DETAIL"));
    return true;
  });
});

test("후속 평가 요청은 최근 평가와 첫 평가를 함께 전달한다", async (t) => {
  environment(t);
  const previous = {
    ...demoFeedback("인출 연습", "설명"),
    understood: ["설명에서 확인된 연결"],
    missing: ["아직 말하지 않은 조건"],
  };
  let input: Record<string, any> = {};
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      input = JSON.parse(
        JSON.parse(String(init?.body)).contents[0].parts[0].text,
      );
      return success({
        ...previous,
        question: "어떤 조건이 필요할까?",
        hints: ["조건 하나를 골라 봐.", "그 조건이 없는 경우를 생각해 봐."],
        questionGrounding: {
          answerQuote: "내 말로",
          page: 1,
          quote: sample.pages[0].text.slice(0, 20),
        },
      });
    },
  );
  await evaluate(
    sample.pages,
    sample.concepts[0],
    {
      ...newStudy(sample.concepts[0].id),
      assessment: previous,
      firstAssessment: previous,
    },
    "내 말로 설명했어",
    true,
    false,
  );
  assert.deepEqual(
    input.previousAssessment.confirmedUnderstanding,
    previous.understood,
  );
  assert.deepEqual(input.firstAssessment, previous);
});

test("사용자가 이미 말한 원문 표현을 짚는 맞춤 질문은 원문 유출로 오인하지 않는다", async (t) => {
  environment(t);
  const answer =
    "인출 연습은 책을 덮고 기억에서 배운 내용을 스스로 떠올려 설명하는 학습 방법이다.";
  const question = `“${answer}”라고 했는데, 그냥 다시 읽는 것과 무슨 차이가 있을까?`;
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    success({
      ...demoFeedback("인출 연습", answer),
      question,
      hints: ["두 방법을 나눠 봐.", "기억을 꺼내는 때를 비교해 봐."],
      questionGrounding: { answerQuote: "책을 덮고", page: 1, quote: answer },
    }),
  );
  const result = await evaluate(
    [{ number: 1, text: answer }],
    sample.concepts[0],
    newStudy(sample.concepts[0].id),
    answer,
    true,
    false,
  );
  assert.equal(result.feedback.question, question);
  assert.equal(fetch.mock.callCount(), 1);
});
