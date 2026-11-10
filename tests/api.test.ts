import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST as oldAI } from "../src/app/api/ai/route";
import { GET as list, POST as create } from "../src/app/api/projects/route";
import { GET as get, POST as act } from "../src/app/api/projects/[id]/route";
import { sample } from "../src/lib/server/demo";
import { learningDay } from "../src/lib/activity";
function request(path: string, body?: unknown, cookie?: string) {
  return new Request("http://localhost" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test("API: 원문 비공개·사용자 격리·단계 검증·중복 방지·기록 복원", async () => {
  const folder = await mkdtemp(join(tmpdir(), "feynloop-test-")),
    oldDir = process.env.FEYNLOOP_DATA_DIR,
    oldDemo = process.env.ALLOW_DEMO;
  process.env.FEYNLOOP_DATA_DIR = folder;
  process.env.ALLOW_DEMO = "true";
  try {
    const created = await create(request("/api/projects", { sample: true }));
    assert.equal(created.status, 201);
    const cookie = created.headers.get("set-cookie")!.split(";")[0];
    let p = (await created.json()).project;
    const context = { params: Promise.resolve({ id: p.id }) },
      path = `/api/projects/${p.id}`,
      cid = p.concepts[0].id;
    const source = sample.pages[0].text;
    const noSource = (value: unknown) => {
      const serialized = JSON.stringify(value);
      assert.ok(!serialized.includes(source));
      assert.ok(
        !serialized.includes("배운 정보를 보지 않고 기억에서 꺼내는 활동이다"),
      );
      assert.ok(!("pages" in (value as object)));
    };
    noSource(p);
    assert.equal(p.pageCount, 3);
    assert.equal(
      (await get(request(path), context)).status,
      404,
      "다른 세션은 접근할 수 없음",
    );
    assert.equal(
      (
        await act(
          request(
            path,
            {
              requestId: crypto.randomUUID(),
              version: 0,
              conceptId: cid,
              action: "submit",
              text: "단계 건너뛰기",
            },
            cookie,
          ),
          context,
        )
      ).status,
      409,
    );
    async function command(
      action: string,
      extra: Record<string, unknown> = {},
    ) {
      const body = {
        requestId: crypto.randomUUID(),
        version: p.version,
        conceptId: cid,
        action,
        ...extra,
      };
      const response = await act(request(path, body, cookie), context);
      assert.equal(
        response.status,
        200,
        JSON.stringify(await response.clone().json()),
      );
      p = (await response.json()).project;
      return body;
    }
    await command("start");
    assert.equal(
      (
        await act(
          request(
            path,
            {
              requestId: crypto.randomUUID(),
              version: p.version,
              conceptId: cid,
              action: "evidence",
              page: 1,
            },
            cookie,
          ),
          context,
        )
      ).status,
      409,
    );
    await command("draft", { text: "저장한 초안" });
    const restored = (
      await (await get(request(path, undefined, cookie), context)).json()
    ).project;
    assert.equal(restored.studies[cid].draft, "저장한 초안");
    noSource(restored);
    const submitted = await command("submit", {
      text: "기억나는 내용을 설명합니다",
    });
    const version = p.version;
    assert.equal(p.activity[learningDay()], 1);
    const retry = await act(request(path, submitted, cookie), context);
    assert.equal(retry.status, 200);
    assert.equal(
      (await retry.json()).project.version,
      version,
      "재전송은 단계를 진행하지 않음",
    );
    assert.equal(
      (
        await act(
          request(path, { ...submitted, text: "다른 내용" }, cookie),
          context,
        )
      ).status,
      409,
    );
    assert.equal(p.studies[cid].phase, "questions");
    assert.equal(p.studies[cid].hints.length, 0);
    assert.deepEqual(p.studies[cid].feedback.evidence, []);
    assert.ok(!JSON.stringify(p).includes("hintPlan"));
    assert.ok(!JSON.stringify(p).includes("assessment"));
    await command("hint", { text: "작성 중인 답변" });
    assert.equal(p.studies[cid].draft, "작성 중인 답변");
    assert.equal(p.studies[cid].hints.length, 1);
    await command("hint");
    assert.equal(p.studies[cid].hints.length, 2);
    assert.equal(
      (
        await act(
          request(
            path,
            {
              requestId: crypto.randomUUID(),
              version: p.version,
              conceptId: cid,
              action: "hint",
            },
            cookie,
          ),
          context,
        )
      ).status,
      409,
    );
    for (let n = 0; n < 3; n++) {
      await command("submit", { text: `나의 사례 ${n}` });
      noSource(p);
    }
    assert.equal(p.studies[cid].phase, "review");
    assert.equal(
      (
        await act(
          request(
            path,
            {
              requestId: crypto.randomUUID(),
              version: p.version,
              conceptId: cid,
              action: "evidence",
              page: 2,
            },
            cookie,
          ),
          context,
        )
      ).status,
      403,
    );
    await command("evidence", { page: 1 });
    assert.equal(p.studies[cid].evidence.length, 1);
    assert.ok(!p.studies[cid].evidence[0].text.includes("2. 간격 효과"));
    assert.ok(p.studies[cid].evidence[0].text.length <= 650);
    assert.equal(p.studies[cid].evidenceViews.length, 1);
    await command("rewrite");
    assert.equal(p.studies[cid].phase, "rewrite");
    assert.ok(!("evidence" in p.studies[cid]));
    noSource(p);
    assert.equal(
      (
        await act(
          request(
            path,
            {
              requestId: crypto.randomUUID(),
              version: p.version,
              conceptId: cid,
              action: "evidence",
              page: 1,
            },
            cookie,
          ),
          context,
        )
      ).status,
      409,
    );
    await command("submit", { text: "최종 설명입니다" });
    assert.equal(p.studies[cid].phase, "done");
    assert.ok(!Number.isNaN(Date.parse(p.studies[cid].completedAt)));
    assert.equal(
      p.activity[learningDay()],
      5,
      "첫 설명·답변 3개·최종 설명만 집계",
    );
    assert.ok(p.studies[cid].initialFeedback);
    assert.ok(p.studies[cid].result);
    assert.equal(p.studies[cid].turns.length, 3);
    assert.equal(p.studies[cid].turns[0].hints.length, 2);
    assert.equal(p.studies[cid].evidenceViews.length, 1);
    const loaded = await list(request("/api/projects", undefined, cookie));
    const restoredList = await loaded.json();
    assert.equal(
      restoredList.projects[0].activity[learningDay()],
      5,
      "새로 읽어도 저장된 집계를 반환",
    );
    assert.equal(
      restoredList.projects[0].studies[cid].final,
      "최종 설명입니다",
    );
    const stale = await act(
      request(
        path,
        {
          requestId: crypto.randomUUID(),
          version: 0,
          conceptId: cid,
          action: "restart",
        },
        cookie,
      ),
      context,
    );
    assert.equal(stale.status, 409);
    await command("restart");
    assert.equal(p.studies[cid].attempt, 2);
    assert.equal(p.studies[cid].phase, "explain");
    assert.ok(!JSON.stringify(p).includes("archives"));
    const { textPdf } = await import("./pdf-fixture");
    const form = new FormData();
    form.set(
      "file",
      new File([textPdf()], "learning.pdf", { type: "application/pdf" }),
    );
    const upload = await create(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { cookie },
        body: form,
      }),
    );
    assert.equal(
      upload.status,
      201,
      JSON.stringify(await upload.clone().json()),
    );
    const uploaded = (await upload.json()).project;
    assert.equal(uploaded.pageCount, 1);
    assert.ok(
      !JSON.stringify(uploaded).includes(
        "recalling information without looking at the source",
      ),
    );
    assert.ok(!("pages" in uploaded));
  } finally {
    if (oldDir === undefined) delete process.env.FEYNLOOP_DATA_DIR;
    else process.env.FEYNLOOP_DATA_DIR = oldDir;
    if (oldDemo === undefined) delete process.env.ALLOW_DEMO;
    else process.env.ALLOW_DEMO = oldDemo;
    await rm(folder, { recursive: true, force: true });
  }
});
test("API: 기존 원문 제출형 평가 API는 차단", async () =>
  assert.equal((await oldAI()).status, 410));
test("API: 다른 사이트 요청과 용량 초과 입력 차단", async (t) => {
  // 용량 검증은 데모 API 접근을 명시적으로 허용한 조건에서 확인합니다.
  const previous = process.env.ALLOW_DEMO;
  process.env.ALLOW_DEMO = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.ALLOW_DEMO;
    else process.env.ALLOW_DEMO = previous;
  });
  const response = await create(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: {
        origin: "https://other.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sample: true }),
    }),
  );
  assert.equal(response.status, 403);
  const invalid = await create(
    request("/api/projects", { sample: true, extra: "a".repeat(20001) }),
  );
  assert.equal(invalid.status, 413);
});

test("15,000자 한국어 초안은 UTF-8 바이트 크기 때문에 거부하지 않는다", async () => {
  const folder = await mkdtemp(join(tmpdir(), "feynloop-long-draft-"));
  const previous = {
    FEYNLOOP_DATA_DIR: process.env.FEYNLOOP_DATA_DIR,
    ALLOW_DEMO: process.env.ALLOW_DEMO,
  };
  Object.assign(process.env, { FEYNLOOP_DATA_DIR: folder, ALLOW_DEMO: "true" });
  try {
    const created = await create(request("/api/projects", { sample: true }));
    assert.equal(created.status, 201);
    const cookie = created.headers.get("set-cookie")!.split(";")[0];
    const p = (await created.json()).project;
    const path = `/api/projects/${p.id}`;
    const context = { params: Promise.resolve({ id: p.id }) };
    const base = {
      conceptId: p.concepts[0].id,
      version: 0,
      requestId: crypto.randomUUID(),
    };
    assert.equal(
      (await act(request(path, { ...base, action: "start" }, cookie), context))
        .status,
      200,
    );
    const text = "가".repeat(15000);
    const payload = {
      ...base,
      version: 1,
      requestId: crypto.randomUUID(),
      action: "draft",
      text,
    };
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) > 40000);
    const saved = await act(request(path, payload, cookie), context);
    assert.equal(saved.status, 200);
    assert.equal(
      (await saved.json()).project.studies[base.conceptId].draft,
      text,
    );
    assert.equal(
      (
        await act(
          request(
            path,
            {
              ...payload,
              version: 2,
              requestId: crypto.randomUUID(),
              text: text + "가",
            },
            cookie,
          ),
          context,
        )
      ).status,
      400,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(folder, { recursive: true, force: true });
  }
});
