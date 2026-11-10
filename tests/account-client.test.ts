import { test } from "node:test";
import assert from "node:assert/strict";
import { accountRequest, AccountRequestError } from "../src/lib/account-client";

test("가입 요청은 자동 재전송하지 않고 대기 제한을 적용한다", async (t) => {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options?: RequestInit) => {
      calls++;
      assert.ok(options?.signal);
      throw new DOMException("timeout", "TimeoutError");
    },
  );
  await assert.rejects(
    accountRequest("signup", {
      username: "test_user",
      password: "test-password",
    }),
    /같은 아이디로 로그인/,
  );
  assert.equal(calls, 1);
});

test("가입 제한의 남은 시간과 중복 아이디 안내를 유지한다", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "42" } },
    ),
  );
  await assert.rejects(
    accountRequest("signup"),
    (error) => error instanceof AccountRequestError && error.retryAfter === 42,
  );
});

test("HTML 장애 응답도 JSON 파싱 오류를 노출하지 않는다", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>service unavailable</html>", { status: 503 }),
  );
  await assert.rejects(
    accountRequest("signup"),
    /로그인 요청을 처리하지 못했습니다/,
  );
});

test("서버 가입 성공 후 브라우저의 탭 알림이 막혀도 복구코드를 반환한다", async (t) => {
  const browserDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const channelDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "BroadcastChannel",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: class {
      constructor() {
        throw new DOMException("blocked", "SecurityError");
      }
    },
  });
  t.after(() => {
    if (browserDescriptor)
      Object.defineProperty(globalThis, "window", browserDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (channelDescriptor)
      Object.defineProperty(globalThis, "BroadcastChannel", channelDescriptor);
    else Reflect.deleteProperty(globalThis, "BroadcastChannel");
  });
  const result = {
    user: { id: "9fcb696a-e16e-4fca-b50d-d82b0699a50a", username: "qa_user" },
    recoveryCode: "FYN-" + Array(6).fill("ABCDEF12").join("-"),
  };
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(result, { status: 201 }),
  );
  assert.deepEqual(
    await accountRequest("signup", {
      username: "qa_user",
      password: "test-password",
    }),
    result,
  );
});

test("탭 알림 전송이 실패해도 로그인 성공을 유지하고 채널을 닫는다", async (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousChannel = Object.getOwnPropertyDescriptor(
    globalThis,
    "BroadcastChannel",
  );
  let closed = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: class {
      postMessage() {
        throw new DOMException("blocked", "SecurityError");
      }
      close() {
        closed = true;
      }
    },
  });
  t.after(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousChannel)
      Object.defineProperty(globalThis, "BroadcastChannel", previousChannel);
    else Reflect.deleteProperty(globalThis, "BroadcastChannel");
  });
  const result = {
    user: { id: "9fcb696a-e16e-4fca-b50d-d82b0699a50a", username: "qa_user" },
  };
  t.mock.method(globalThis, "fetch", async () => Response.json(result));
  assert.deepEqual(await accountRequest("login"), result);
  assert.equal(closed, true);
});

test("응답 본문을 읽는 중 시간 초과도 가입 상태 확인 안내로 처리한다", async (t) => {
  const response = Response.json({ user: null });
  t.mock.method(response, "json", async () => {
    throw new DOMException("timeout", "AbortError");
  });
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(
    accountRequest("signup"),
    (error) =>
      error instanceof AccountRequestError &&
      error.message.includes("같은 아이디로 로그인"),
  );
});

test("불완전한 성공 응답은 로그인 완료나 복구코드 발급으로 처리하지 않는다", async (t) => {
  let output: unknown = null;
  t.mock.method(globalThis, "fetch", async () => Response.json(output));
  for (const value of [
    null,
    true,
    "ok",
    { user: null },
    { user: { id: "invalid", username: "qa_user" } },
  ]) {
    output = value;
    await assert.rejects(accountRequest("login"), AccountRequestError);
  }
  output = {
    user: { id: "9fcb696a-e16e-4fca-b50d-d82b0699a50a", username: "qa_user" },
  };
  for (const action of ["signup", "recover", "logout"])
    await assert.rejects(accountRequest(action), AccountRequestError);
  output = { user: null };
  assert.deepEqual(await accountRequest(), output);
  assert.deepEqual(await accountRequest("logout"), output);
});
