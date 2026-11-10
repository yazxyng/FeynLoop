import { test } from "node:test";
import assert from "node:assert/strict";
import { readBody } from "../src/lib/server/request-body";
import { failure, identity } from "../src/lib/server/http";
import { demoAllowed } from "../src/lib/server/demo-policy";
import { limitUsage } from "../src/lib/server/usage-limit";
import { GET as configuration } from "../src/app/api/config/route";
import { profileRequest } from "../src/lib/profile-client";

function streamRequest(stream: ReadableStream<Uint8Array>) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
}

test("본문 크기는 Content-Length 없이도 제한하며 넘치면 스트림을 닫는다", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(12));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBody(streamRequest(stream), 10),
    (error: any) => error.status === 413,
  );
  assert.ok(cancelled);
});

test("본문 전송이 멈춰도 제한 시간 후 연결을 정리한다", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBody(streamRequest(stream), 10, 20),
    (error: any) => error.status === 408,
  );
  assert.ok(cancelled);
});

test("잘못된 선언 크기와 초과 크기를 본문 읽기 전에 거부한다", async () => {
  for (const length of ["-1", "invalid", "999999999999999999999999"])
    await assert.rejects(
      readBody(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Length": length },
          body: "x",
        }),
        10,
      ),
      (error: any) => error.status === 400,
    );
  await assert.rejects(
    readBody(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Length": "11" },
        body: "x",
      }),
      10,
    ),
    (error: any) => error.status === 413,
  );
});

test("운영 기본값은 비로그인 데모를 차단하고 설정 API도 같은 정책을 표시한다", async (t) => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEMO: process.env.ALLOW_DEMO,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.ALLOW_DEMO;
  assert.equal(demoAllowed(), false);
  assert.equal((await configuration().json()).demoAllowed, false);
  await assert.rejects(
    identity(new Request("http://localhost/api/projects")),
    (error: any) => error.status === 401,
  );
  process.env.ALLOW_DEMO = "true";
  assert.equal(demoAllowed(), true);
  assert.match(
    (await identity(new Request("http://localhost/api/projects"))).owner,
    /^demo:/,
  );
});

test("공유 DB의 사용 제한은 해시 키를 쓰며 제한 응답에 Retry-After를 포함한다", async (t) => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };
  Object.assign(process.env, {
    SUPABASE_URL: "https://limits.test",
    SUPABASE_SECRET_KEY: "fake-key",
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let wait = 0;
  const keys: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(new URL(String(input)).hostname, "limits.test");
      const body = JSON.parse(String(init?.body));
      assert.match(body.p_key, /^[a-f0-9]{64}$/);
      assert.equal(body.p_window_seconds, 900);
      keys.push(body.p_key);
      return Response.json(wait);
    },
  );
  await limitUsage({ owner: "account:one", userId: "one" }, "feedback");
  await limitUsage({ owner: "account:two", userId: "two" }, "feedback");
  assert.notEqual(keys[0], keys[1]);
  wait = 42;
  try {
    await limitUsage({ owner: "account:one", userId: "one" }, "feedback");
    assert.fail("must reject");
  } catch (error) {
    const response = failure(error);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "42");
  }
});

test("데모 등록 제한은 세션별이며 다른 세션의 이용을 막지 않는다", async () => {
  const owner = `demo:${crypto.randomUUID()}`;
  for (let i = 0; i < 10; i++) await limitUsage({ owner }, "import");
  await assert.rejects(
    limitUsage({ owner }, "import"),
    (error: any) => error.status === 429,
  );
  await limitUsage({ owner: `demo:${crypto.randomUUID()}` }, "import");
});

test("계정 설정의 HTML 장애·전송 실패를 사용자 안내로 바꾼다", async (t) => {
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      assert.ok(init?.signal);
      return new Response("<html>error</html>", { status: 503 });
    },
  );
  await assert.rejects(profileRequest(), /계정 서버 응답을 확인하지 못했어요/);
  mocked.mock.restore();
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("private network detail");
  });
  await assert.rejects(profileRequest(), /연결 상태/);
});
