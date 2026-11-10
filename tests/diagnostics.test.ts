import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  withDiagnostics,
  setDiagnosticStage,
  setDiagnosticCode,
} from "../src/lib/server/diagnostics";
import { failure, json } from "../src/lib/server/http";
import { ApiError } from "../src/lib/server/errors";
import {
  validRequestId,
  errorRequestId,
  RequestError,
} from "../src/lib/request-error";
import { workspaceRequest } from "../src/lib/workspace-request";
import { accountRequest, AccountRequestError } from "../src/lib/account-client";
import { profileRequest } from "../src/lib/profile-client";
import { POST as signup } from "../src/app/api/auth/session/route";
import InlineFeedback from "../src/components/inline-feedback";

const knownId = "f9db3783-22db-43c8-98c6-8f8889210def";

test("실패 본문·헤더·로그의 번호가 일치하고 코드·상태·시간만 기록한다", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
  });
  const response = await withDiagnostics("projects.create", async () => {
    setDiagnosticStage("extract-concepts");
    setDiagnosticCode("PGRST202");
    await delay(5);
    return failure(new ApiError(429, "잠시 후 다시 시도해 주세요."));
  });
  const body = await response.json();
  assert.ok(validRequestId(body.requestId));
  assert.equal(body.requestId, response.headers.get("X-Request-ID"));
  assert.equal(logs.length, 1);
  const metadata = logs[0][1] as Record<string, unknown>;
  assert.equal(metadata.requestId, body.requestId);
  assert.equal(metadata.stage, "extract-concepts");
  assert.equal(metadata.route, "projects.create");
  assert.equal(metadata.status, 429);
  assert.equal(metadata.code, "PGRST202");
  assert.ok(Number(metadata.durationMs) >= 0);
  assert.deepEqual(
    Object.keys(metadata).sort(),
    ["requestId", "route", "stage", "status", "durationMs", "code"].sort(),
  );
});

test("겹쳐 실행되는 요청의 번호와 실패 단계가 섞이지 않는다", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
  });
  const responses = await Promise.all([
    withDiagnostics("projects.create", async () => {
      setDiagnosticStage("extract-pdf");
      await delay(15);
      return failure(new ApiError(400, "PDF 확인"));
    }),
    withDiagnostics("auth.session.post", async () => {
      setDiagnosticStage("authenticate");
      await delay(2);
      return failure(new ApiError(401, "로그인 확인"));
    }),
  ]);
  const ids = responses.map((response) => response.headers.get("X-Request-ID"));
  assert.notEqual(ids[0], ids[1]);
  const metadata = logs.map((entry) => entry[1] as Record<string, unknown>);
  assert.equal(
    metadata.find((entry) => entry.requestId === ids[0])?.stage,
    "extract-pdf",
  );
  assert.equal(
    metadata.find((entry) => entry.requestId === ids[1])?.stage,
    "authenticate",
  );
});

test("비밀번호·복구코드·키·원문·오류 stack·사용자가 보낸 번호를 로그에 넣지 않는다", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
  });
  const secret = "PRIVATE_PASSWORD_RECOVERY_KEY_SOURCE_ANSWER";
  const result = await withDiagnostics("auth.session.post", async () => {
    setDiagnosticCode(secret);
    return failure(new Error(secret));
  });
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(logs).includes(secret));
  assert.ok(!JSON.stringify(await result.json()).includes(secret));
  const response = await signup(
    new Request("http://localhost/api/auth/session?token=" + secret, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": knownId,
        Cookie: secret,
      },
      body: JSON.stringify({
        action: "signup",
        username: "!",
        password: secret,
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.notEqual(response.headers.get("X-Request-ID"), knownId);
  assert.ok(!JSON.stringify(logs).includes(secret));
});

test("성공 응답에는 추적 헤더만 추가하고 오류 로그를 남기지 않는다", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
  });
  const response = await withDiagnostics("projects.list", async () =>
    json({ projects: [] }),
  );
  assert.deepEqual(await response.json(), { projects: [] });
  assert.ok(validRequestId(response.headers.get("X-Request-ID")));
  assert.equal(logs.length, 0);
});

test("자료·로그인·계정 요청 도우미가 같은 서버 오류 번호를 보존한다", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "확인해 주세요.", requestId: knownId },
      {
        status: 429,
        headers: { "X-Request-ID": knownId, "Retry-After": "42" },
      },
    ),
  );
  for (const call of [
    () => workspaceRequest("/api/projects"),
    () => accountRequest("login"),
    () => profileRequest(),
  ]) {
    await assert.rejects(call(), (error) => errorRequestId(error) === knownId);
  }
  await assert.rejects(
    accountRequest("login"),
    (error) => error instanceof AccountRequestError && error.retryAfter === 42,
  );
});

test("JSON이 아닌 장애 응답도 헤더의 유효한 번호를 보존한다", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>Gateway error</html>", {
        status: 502,
        headers: { "X-Request-ID": knownId },
      }),
  );
  for (const call of [
    () => workspaceRequest("/api/projects"),
    () => accountRequest("login"),
    () => profileRequest(),
  ])
    await assert.rejects(call(), (error) => errorRequestId(error) === knownId);
});

test("통신 실패에는 서버 로그와 연결되지 않는 임의 번호를 만들지 않는다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network offline");
  });
  for (const call of [
    () => workspaceRequest("/api/projects"),
    () => accountRequest("login"),
    () => profileRequest(),
  ])
    await assert.rejects(
      call(),
      (error) => error instanceof Error && errorRequestId(error) === undefined,
    );
  assert.equal(new RequestError("확인", "PRIVATE_TOKEN").requestId, undefined);
});

test("오류 번호는 기존 안내에서 펼쳐 볼 수 있고 성공 알림에는 표시하지 않는다", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineFeedback, {
      error: "확인해 주세요.",
      requestId: knownId,
    }),
  );
  assert.ok(markup.includes("오류 번호 보기"));
  assert.ok(markup.includes(`<code>${knownId}</code>`));
  assert.ok(markup.includes('<details class="error-reference">'));
  assert.ok(!markup.includes(" open="));
  const notice = renderToStaticMarkup(
    createElement(InlineFeedback, {
      notice: "저장했어요.",
      requestId: knownId,
    }),
  );
  assert.ok(!notice.includes(knownId));
});
