import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { POST as create } from "../src/app/api/projects/route";
import { GET as get, POST as act } from "../src/app/api/projects/[id]/route";
import { GET as configuration } from "../src/app/api/config/route";
import { projectMode } from "../src/lib/server/project-mode";
import { sample, demoFeedback } from "../src/lib/server/demo";
import type { PrivateProject, SourcePage } from "../src/lib/server/models";
import { textPdf } from "./pdf-fixture";

function environment(t: TestContext) {
  const values = {
    GEMINI_API_KEY: "mock-gemini-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-public-key",
    SUPABASE_SECRET_KEY: "mock-server-key",
    ALLOW_DEMO: "true",
  };
  const previous = new Map(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
const userId = "14a6c766-5dc2-4e8c-91fa-698cfe4281db",
  otherId = "74b3bc32-c1a4-4e09-b355-bb0eb4317160";
function request(path: string, body?: unknown, authenticated = true) {
  return new Request("http://localhost" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authenticated ? { Authorization: "Bearer mock-user-token" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function mockServices(t: TestContext) {
  const records = new Map<
    string,
    {
      userId: string;
      state: PrivateProject;
      pages: SourcePage[];
      file_path: string | null;
      version: number;
    }
  >();
  const calls = { gemini: 0, storage: 0, limit: 0 };
  let usageWait = 0;
  let failGemini = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        ),
        headers = new Headers(init?.headers);
      if (url.hostname === "generativelanguage.googleapis.com") {
        calls.gemini++;
        assert.equal(headers.get("x-goog-api-key"), "mock-gemini-key");
        if (failGemini) return Response.json({ error: {} }, { status: 429 });
        const body = JSON.parse(String(init?.body)),
          payload = JSON.parse(body.contents[0].parts[0].text);
        const answer = body.generationConfig.responseJsonSchema.properties
          .concepts
          ? {
              concepts: sample.concepts.map((concept) => ({
                ...concept,
                pages: concept.pages.filter((page) =>
                  payload.pages.some(
                    (p: { number: number }) => p.number === page,
                  ),
                ).length
                  ? concept.pages
                  : [payload.pages[0].number],
              })),
            }
          : {
              ...demoFeedback("인출 연습", payload.explanation),
              question:
                payload.final || payload.turns.length >= 3
                  ? ""
                  : `질문 ${payload.turns.length + 1}: ${payload.explanation.slice(0, 30)}에서 이유는 무엇인가요?`,
              hints: ["생각할 단서", "원인과 결과를 나눠 보세요."],
              questionGrounding:
                payload.final || payload.turns.length >= 3
                  ? null
                  : {
                      answerQuote: payload.explanation.slice(0, 60),
                      page: payload.pages[0].number,
                      quote: payload.pages[0].text.slice(0, 20),
                    },
            };
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(answer) }] },
            },
          ],
        });
      }
      assert.equal(
        url.hostname,
        "supabase.test",
        "실제 외부 서비스 요청은 허용하지 않음",
      );
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id:
            headers.get("authorization") === "Bearer other-user"
              ? otherId
              : userId,
          aud: "authenticated",
          role: "authenticated",
        });
      assert.equal(
        headers.get("apikey"),
        "mock-server-key",
        "서버 저장소는 사용자 토큰과 분리",
      );
      if (url.pathname === "/rest/v1/rpc/feynloop_auth_attempt") {
        calls.limit++;
        return Response.json(usageWait);
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        calls.storage++;
        return Response.json({
          Key: url.pathname.replace("/storage/v1/object/", ""),
        });
      }
      if (url.pathname === "/rest/v1/rpc/create_feynloop_project") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.p_user_id, userId);
        records.set(body.p_id, {
          userId: body.p_user_id,
          state: structuredClone(body.p_state),
          pages: body.p_pages,
          file_path: body.p_file_path,
          version: 0,
        });
        return Response.json(null);
      }
      const id =
        url.searchParams.get("id")?.replace(/^eq\./, "") ||
        url.searchParams.get("project_id")?.replace(/^eq\./, "");
      const row = id ? records.get(id) : undefined;
      const owner = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      const matches = row && row.userId === owner;
      if (url.pathname === "/rest/v1/feynloop_sources")
        return matches
          ? Response.json({ pages: row.pages })
          : Response.json(null, { status: 404 });
      if (url.pathname === "/rest/v1/feynloop_projects") {
        if (init?.method === "PATCH") {
          const version = Number(
            url.searchParams.get("version")?.replace(/^eq\./, ""),
          );
          if (!matches || row.version !== version) return Response.json([]);
          const body = JSON.parse(String(init.body));
          row.state = structuredClone(body.state);
          row.version = body.version;
          return Response.json([{ id }]);
        }
        if (!id)
          return Response.json(
            [...records.values()]
              .filter((r) => r.userId === owner)
              .map((r) => ({ state: r.state })),
          );
        const result = matches
          ? { state: row.state, file_path: row.file_path }
          : null;
        return headers.get("accept")?.includes("vnd.pgrst.object")
          ? Response.json(result)
          : Response.json(result ? [result] : []);
      }
      throw new Error("처리되지 않은 테스트 요청");
    },
  );
  return {
    records,
    calls,
    setUsageWait: (seconds: number) => {
      usageWait = seconds;
    },
    setFailure: (value: boolean) => {
      failGemini = value;
    },
  };
}

test("사용자가 실제 모드를 고른 경우에만 AI 활성화하고 미설정·비로그인은 차단", (t) => {
  environment(t);
  assert.equal(projectMode({ owner: "user:test", userId }), "demo");
  assert.equal(projectMode({ owner: "user:test", userId }, "demo"), "demo");
  assert.equal(projectMode({ owner: "user:test", userId }, "live"), "live");
  assert.throws(
    () => projectMode({ owner: "demo:test" }, "live"),
    (e) => (e as { status: number }).status === 401,
  );
  delete process.env.GEMINI_API_KEY;
  assert.throws(
    () => projectMode({ owner: "user:test", userId }, "live"),
    (e) => (e as { status: number }).status === 503,
  );
});
test("설정 상태 API는 비밀 키를 노출하거나 외부 요청을 하지 않는다", async (t) => {
  environment(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("외부 요청 금지");
  });
  const response = await configuration().json();
  assert.deepEqual(response.readiness, {
    gemini: true,
    authentication: true,
    storage: true,
  });
  assert.ok(!JSON.stringify(response).includes("mock-"));
  assert.equal(fetch.mock.callCount(), 0);
});
test("API 통합: 로그인·PDF 분석·질문·근거·재설명·저장을 모의 서비스로 연결", async (t) => {
  environment(t);
  const service = mockServices(t);
  const noChoice = await create(request("/api/projects", { sample: true }));
  assert.equal(noChoice.status, 201);
  assert.equal((await noChoice.json()).project.mode, "demo");
  assert.equal(
    service.calls.gemini,
    0,
    "키와 로그인이 있어도 자동 호출하지 않음",
  );
  const unsigned = await create(
    request("/api/projects", { sample: true, mode: "live" }, false),
  );
  assert.equal(unsigned.status, 401);
  assert.equal(service.calls.gemini, 0);
  const form = new FormData();
  form.set(
    "file",
    new File([textPdf()], "learning.pdf", { type: "application/pdf" }),
  );
  form.set("mode", "live");
  const uploaded = await create(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { Authorization: "Bearer mock-user-token" },
      body: form,
    }),
  );
  assert.equal(
    uploaded.status,
    201,
    JSON.stringify(await uploaded.clone().json()),
  );
  const uploadedProject = (await uploaded.json()).project;
  assert.equal(uploadedProject.mode, "live");
  assert.equal(uploadedProject.pageCount, 1);
  assert.ok(!("pages" in uploadedProject));
  assert.ok(
    !JSON.stringify(uploadedProject).includes(
      "recalling information without looking at the source",
    ),
  );
  assert.equal(service.calls.storage, 1);
  const textResponse = await create(
    request("/api/projects", {
      source: "text",
      title: "텍스트 학습",
      text: "인출 연습은 배운 내용을 보지 않고 기억에서 꺼내 설명하는 활동이다.",
      mode: "live",
    }),
  );
  assert.equal(textResponse.status, 201);
  const textProject = (await textResponse.json()).project;
  assert.equal(textProject.sourceType, "text");
  assert.equal(textProject.mode, "live");
  assert.equal(
    service.records.get(textProject.id)?.pages[0].text,
    "인출 연습은 배운 내용을 보지 않고 기억에서 꺼내 설명하는 활동이다.",
  );
  assert.ok(
    !JSON.stringify(textProject).includes("기억에서 꺼내 설명하는 활동이다"),
  );
  assert.equal(
    service.calls.storage,
    1,
    "텍스트 자료에는 PDF 파일 업로드를 하지 않음",
  );
  const response = await create(
    request("/api/projects", { sample: true, mode: "live" }),
  );
  assert.equal(
    response.status,
    201,
    JSON.stringify(await response.clone().json()),
  );
  let p = (await response.json()).project;
  assert.equal(p.mode, "live");
  assert.ok(!("pages" in p));
  const context = { params: Promise.resolve({ id: p.id }) },
    path = `/api/projects/${p.id}`,
    conceptId = p.concepts[0].id;
  async function command(action: string, extra: Record<string, unknown> = {}) {
    const res = await act(
      request(path, {
        action,
        conceptId,
        requestId: crypto.randomUUID(),
        version: p.version,
        ...extra,
      }),
      context,
    );
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    p = (await res.json()).project;
  }
  await command("start");
  await command("draft", { text: "기억에서 설명하기" });
  const callsBefore = service.calls.gemini;
  service.setFailure(true);
  const before = structuredClone(service.records.get(p.id));
  const failed = await act(
    request(path, {
      action: "submit",
      conceptId,
      requestId: crypto.randomUUID(),
      version: p.version,
      text: "첫 설명",
    }),
    context,
  );
  assert.equal(failed.status, 429);
  assert.deepEqual(service.records.get(p.id), before);
  service.setFailure(false);
  await command("submit", { text: "첫 설명" });
  assert.equal(p.studies[conceptId].phase, "questions");
  await command("hint", { text: "작성 중인 답변" });
  assert.equal(p.studies[conceptId].draft, "작성 중인 답변");
  for (let n = 0; n < 3; n++) await command("submit", { text: `답변 ${n}` });
  assert.equal(p.studies[conceptId].phase, "review");
  await command("evidence", { page: 1 });
  assert.equal(p.studies[conceptId].evidenceViews.length, 1);
  await command("rewrite");
  assert.ok(!p.studies[conceptId].evidence);
  await command("submit", { text: "최종 재설명" });
  assert.equal(p.studies[conceptId].phase, "done");
  assert.ok(p.studies[conceptId].initialFeedback);
  assert.ok(p.studies[conceptId].result);
  assert.equal(
    service.calls.gemini,
    callsBefore + 6,
    "실패 1회와 첫 설명·답변 3회·최종 설명만 호출",
  );
  const restored = await get(
    request(path + "?conceptId=" + conceptId),
    context,
  );
  assert.equal(
    (await restored.json()).project.studies[conceptId].final,
    "최종 재설명",
  );
  const other = await get(
    new Request("http://localhost" + path, {
      headers: { Authorization: "Bearer other-user" },
    }),
    context,
  );
  assert.equal(other.status, 404);
});

test("사용 한도를 초과하면 AI 호출·저장을 시작하지 않고 성공 요청 재전송은 다시 차감하지 않는다", async (t) => {
  environment(t);
  const service = mockServices(t);
  service.setUsageWait(42);
  const blockedImport = await create(
    request("/api/projects", { sample: true, mode: "live" }),
  );
  assert.equal(blockedImport.status, 429);
  assert.equal(blockedImport.headers.get("Retry-After"), "42");
  assert.equal(service.calls.gemini, 0);
  assert.equal(service.records.size, 0);
  service.setUsageWait(0);
  const created = await create(
    request("/api/projects", { sample: true, mode: "live" }),
  );
  assert.equal(created.status, 201);
  const p = (await created.json()).project;
  const path = `/api/projects/${p.id}`;
  const context = { params: Promise.resolve({ id: p.id }) };
  const base = {
    conceptId: p.concepts[0].id,
    requestId: crypto.randomUUID(),
    version: 0,
  };
  assert.equal(
    (await act(request(path, { ...base, action: "start" }), context)).status,
    200,
  );
  const before = structuredClone(service.records.get(p.id));
  const aiBefore = service.calls.gemini;
  const submission = {
    ...base,
    version: 1,
    requestId: crypto.randomUUID(),
    action: "submit",
    text: "기억에서 꺼내 설명하는 과정이야",
  };
  service.setUsageWait(42);
  const blockedSubmit = await act(request(path, submission), context);
  assert.equal(blockedSubmit.status, 429);
  assert.equal(blockedSubmit.headers.get("Retry-After"), "42");
  assert.equal(service.calls.gemini, aiBefore);
  assert.deepEqual(service.records.get(p.id), before);
  service.setUsageWait(0);
  assert.equal((await act(request(path, submission), context)).status, 200);
  const used = service.calls.limit;
  assert.equal((await act(request(path, submission), context)).status, 200);
  assert.equal(service.calls.limit, used);
  assert.equal(service.calls.gemini, aiBefore + 1);
});
