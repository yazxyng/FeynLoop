import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST, GET } from "../src/app/api/projects/route";
import {
  POST as command,
  GET as load,
} from "../src/app/api/projects/[id]/route";

test("텍스트 자료: 3,000자 경계·저장·복원·원문 비공개·사용자 격리", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "feynloop-text-"));
  const previous = {
    ALLOW_DEMO: process.env.ALLOW_DEMO,
    FEYNLOOP_DATA_DIR: process.env.FEYNLOOP_DATA_DIR,
  };
  process.env.ALLOW_DEMO = "true";
  process.env.FEYNLOOP_DATA_DIR = directory;
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const external = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("외부 요청 금지");
  });
  const req = (body: unknown, cookie?: string) =>
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  for (const text of [
    "",
    " \n\t",
    "가".repeat(3001),
    " ".repeat(3000) + "가",
  ]) {
    const invalid = await POST(req({ source: "text", text }));
    assert.equal(invalid.status, 400);
  }
  const raw = "1. 인출 연습\n기억을 꺼내 설명하는 학습 원문. ".padEnd(
    3000,
    "가",
  );
  const response = await POST(
    req({ source: "text", text: raw, title: "텍스트 자료", mode: "demo" }),
  );
  assert.equal(response.status, 201);
  const project = (await response.json()).project;
  assert.equal(project.sourceType, "text");
  assert.equal(project.name, "텍스트 자료");
  assert.equal(project.pageCount, 1);
  assert.equal(project.concepts.length, 1);
  assert.ok(!JSON.stringify(project).includes("학습 원문."));
  assert.ok(!("pages" in project));
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const list = await GET(
    new Request("http://localhost/api/projects", {
      headers: { Cookie: cookie },
    }),
  );
  assert.equal((await list.json()).projects[0].sourceType, "text");
  const context = { params: Promise.resolve({ id: project.id }) };
  const restored = await load(
    new Request(`http://localhost/api/projects/${project.id}`, {
      headers: { Cookie: cookie },
    }),
    context,
  );
  assert.equal((await restored.json()).project.name, "텍스트 자료");
  const other = await load(
    new Request(`http://localhost/api/projects/${project.id}`),
    context,
  );
  assert.equal(other.status, 404);
  const started = await command(
    req(
      {
        action: "start",
        conceptId: project.concepts[0].id,
        version: 0,
        requestId: crypto.randomUUID(),
      },
      cookie,
    ),
    context,
  );
  assert.equal(started.status, 200);
  const submitted = await command(
    req(
      {
        action: "submit",
        conceptId: project.concepts[0].id,
        version: 1,
        requestId: crypto.randomUUID(),
        text: "원문을 덮고 기억에서 떠올리는 거야.",
      },
      cookie,
    ),
    context,
  );
  assert.equal(submitted.status, 200);
  const learned = (await submitted.json()).project;
  assert.equal(learned.sourceType, "text");
  assert.equal(learned.studies[project.concepts[0].id].phase, "questions");
  assert.ok(!JSON.stringify(learned).includes("학습 원문."));
  assert.equal(external.mock.callCount(), 0);
});
