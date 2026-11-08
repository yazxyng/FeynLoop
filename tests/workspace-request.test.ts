import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceRequest } from "../src/lib/workspace-request";

test("응답 본문이 멈춘 요청도 제한 시간 후 끝내고 자동 재전송하지 않는다", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("", "AbortError")),
            { once: true },
          );
        }),
    }),
  );
  await assert.rejects(
    workspaceRequest("/api/projects", { sample: true }, 15),
    /대기 시간이 초과/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("서버가 보낸 오류와 JSON이 아닌 장애 응답을 구분해 안내한다", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Gemini 사용 한도에 도달했습니다." },
      { status: 429 },
    ),
  );
  await assert.rejects(workspaceRequest("/api/projects"), /Gemini 사용 한도/);
  fetch.mock.restore();
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Gateway Timeout</html>", { status: 504 }),
  );
  await assert.rejects(
    workspaceRequest("/api/projects"),
    /서버 응답을 읽지 못/,
  );
});

test("성공한 업로드 결과를 반환하고 전송 오류는 연결 안내로 표시한다", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ project: { id: "saved" } }),
  );
  assert.deepEqual(await workspaceRequest("/api/projects"), {
    project: { id: "saved" },
  });
  fetch.mock.restore();
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(workspaceRequest("/api/projects"), /인터넷 연결/);
});
