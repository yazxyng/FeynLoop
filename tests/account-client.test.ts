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
