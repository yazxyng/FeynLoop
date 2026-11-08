import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  saveNewPassword,
  validateNewPassword,
} from "../src/lib/password-auth";

const user = {
  id: "20b6520a-8a6e-46bb-9fda-6c77bca4bc64",
  email: "learner@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-11-07T00:00:00Z",
};
const session = {
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user,
};
function client(fetcher: typeof fetch) {
  return createClient("https://password-auth.test", "mock-public-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetcher },
  });
}
test("실제 SDK로 비밀번호 로그인 시 메일 발송 없이 세션을 생성한다", async () => {
  let calls = 0;
  const c = client(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/auth/v1/token");
    assert.equal(url.searchParams.get("grant_type"), "password");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.email, user.email);
    assert.equal(body.password, "test-password");
    calls++;
    return Response.json(session);
  });
  await loginWithPassword(c.auth, " learner@example.com ", "test-password");
  assert.equal(calls, 1);
  assert.equal((await c.auth.getSession()).data.session?.user.id, user.id);
});
test("회원가입은 확인이 필요한 상태와 로그인 완료를 구별한다", async () => {
  let confirmed = false;
  const c = client(async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/auth/v1/signup");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.password, "test-password");
    return Response.json(confirmed ? session : user);
  });
  assert.deepEqual(
    await registerWithPassword(
      c.auth,
      user.email,
      "test-password",
      "test-password",
    ),
    { email: user.email, confirmed: false },
  );
  confirmed = true;
  assert.equal(
    (
      await registerWithPassword(
        c.auth,
        user.email,
        "test-password",
        "test-password",
      )
    ).confirmed,
    true,
  );
});
test("기존 계정 복구는 이메일 주소와 복귀 주소만 전송하고 인증 후 비밀번호를 변경한다", async () => {
  const paths: string[] = [];
  const c = client(async (input, init) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/auth/v1/recover") {
      assert.equal(
        url.searchParams.get("redirect_to"),
        "http://localhost:3000",
      );
      const body = JSON.parse(String(init?.body));
      assert.equal(body.email, user.email);
      assert.ok(!("password" in body));
      return Response.json({});
    }
    if (url.pathname === "/auth/v1/token") return Response.json(session);
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init?.method, "PUT");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer mock-access-token",
      );
      assert.equal(JSON.parse(String(init?.body)).password, "new-password");
      return Response.json(user);
    }
    throw new Error("Unexpected request");
  });
  await requestPasswordReset(c.auth, user.email, "http://localhost:3000");
  await assert.rejects(
    saveNewPassword(c.auth, "new-password", "new-password"),
    /인증 요청/,
  );
  assert.deepEqual(paths, ["/auth/v1/recover"]);
  await loginWithPassword(c.auth, user.email, "old-password");
  await saveNewPassword(c.auth, "new-password", "new-password");
  assert.deepEqual(paths, [
    "/auth/v1/recover",
    "/auth/v1/token",
    "/auth/v1/user",
  ]);
});
test("약한 비밀번호·불일치 입력은 전송하지 않고 인증 오류에 비밀 정보를 노출하지 않는다", async () => {
  assert.throws(() => validateNewPassword("short", "short"), /8~72/);
  assert.throws(
    () => validateNewPassword("test-password", "different"),
    /서로/,
  );
  let calls = 0;
  const c = client(async () => {
    calls++;
    return Response.json(
      { error_code: "invalid_credentials", msg: "PRIVATE_DETAIL" },
      { status: 400 },
    );
  });
  await assert.rejects(
    registerWithPassword(c.auth, user.email, "short", "short"),
    /8~72/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    loginWithPassword(c.auth, user.email, "wrong"),
    (error: Error) =>
      error.message.includes("비밀번호") &&
      !error.message.includes("PRIVATE_DETAIL"),
  );
  assert.equal(calls, 1);
});
