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
  assert.ok(uncertain.feedback.question.includes("원인과 결과"));
  assert.ok(!uncertain.hints.includes("첫 단서"));
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
