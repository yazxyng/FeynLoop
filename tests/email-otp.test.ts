import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  sendEmailCode,
  verifyEmailCode,
  validEmailCode,
  EmailCodeError,
  type EmailOtpClient,
} from "../src/lib/email-otp";

function fakeAuth(overrides: Partial<EmailOtpClient> = {}): EmailOtpClient {
  return {
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({
      data: { session: { access_token: "mock-token" } },
      error: null,
    }),
    ...overrides,
  };
}
test("인증번호 발송은 이메일을 정리하고 링크 리다이렉트를 요청하지 않는다", async () => {
  let payload: unknown;
  const auth = fakeAuth({
    signInWithOtp: async (input) => {
      payload = input;
      return { error: null };
    },
  });
  assert.equal(
    await sendEmailCode(auth, "  learner@example.com  "),
    "learner@example.com",
  );
  assert.deepEqual(payload, {
    email: "learner@example.com",
    options: { shouldCreateUser: true },
  });
  let calls = 0;
  await assert.rejects(
    sendEmailCode(
      fakeAuth({
        signInWithOtp: async () => {
          calls++;
          return { error: null };
        },
      }),
      "not-email",
    ),
    /이메일/,
  );
  assert.equal(calls, 0);
});
test("인증번호는 숫자만 검증하고 이메일 OTP 유형으로 확인한다", async () => {
  let payload: unknown;
  const auth = fakeAuth({
    verifyOtp: async (input) => {
      payload = input;
      return { data: { session: { access_token: "mock-token" } }, error: null };
    },
  });
  await verifyEmailCode(auth, "learner@example.com", "123 456");
  assert.deepEqual(payload, {
    email: "learner@example.com",
    token: "123456",
    type: "email",
  });
  assert.ok(validEmailCode("12345678"));
  assert.ok(validEmailCode("1234567890"));
  assert.ok(!validEmailCode("12a456"));
  assert.ok(!validEmailCode("12345"));
  let calls = 0;
  await assert.rejects(
    verifyEmailCode(
      fakeAuth({
        verifyOtp: async () => {
          calls++;
          return { data: { session: null }, error: null };
        },
      }),
      "learner@example.com",
      "abc123",
    ),
    /숫자/,
  );
  assert.equal(calls, 0);
});
test("만료·잘못된 번호·발송 제한은 비밀 정보 없이 안내하고 성공으로 처리하지 않는다", async () => {
  await assert.rejects(
    verifyEmailCode(
      fakeAuth({
        verifyOtp: async () => ({
          data: { session: null },
          error: { code: "otp_expired", message: "PRIVATE_DETAIL" },
        }),
      }),
      "learner@example.com",
      "123456",
    ),
    (error) => {
      assert.ok((error as Error).message.includes("만료"));
      assert.ok(!(error as Error).message.includes("PRIVATE_DETAIL"));
      return true;
    },
  );
  await assert.rejects(
    sendEmailCode(
      fakeAuth({ signInWithOtp: async () => ({ error: { status: 429 } }) }),
      "learner@example.com",
    ),
    (error) => error instanceof EmailCodeError && error.rateLimited,
  );
  await assert.rejects(
    verifyEmailCode(
      fakeAuth({
        verifyOtp: async () => ({ data: { session: null }, error: null }),
      }),
      "learner@example.com",
      "123456",
    ),
    /세션/,
  );
  await assert.rejects(
    sendEmailCode(
      fakeAuth({
        signInWithOtp: async () => {
          throw new Error("PRIVATE_DETAIL");
        },
      }),
      "learner@example.com",
    ),
    /네트워크/,
  );
});
test("실제 Supabase SDK의 OTP 전송·확인·세션 생성을 모의 요청으로 검증한다", async (t) => {
  let sends = 0,
    verifies = 0;
  const client = createClient("https://supabase.test", "mock-publishable-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const user = {
    id: "20b6520a-8a6e-46bb-9fda-6c77bca4bc64",
    email: "learner@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-11-07T00:00:00Z",
  };
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
      );
      assert.equal(url.hostname, "supabase.test");
      const body = JSON.parse(String(init?.body));
      if (url.pathname === "/auth/v1/otp") {
        sends++;
        assert.equal(body.email, user.email);
        assert.equal(body.create_user, true);
        assert.ok(!url.searchParams.has("redirect_to"));
        return Response.json({});
      }
      if (url.pathname === "/auth/v1/verify") {
        verifies++;
        assert.equal(body.email, user.email);
        assert.equal(body.token, "12345678");
        assert.equal(body.type, "email");
        return Response.json({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      }
      throw new Error("예상하지 못한 네트워크 요청");
    },
  );
  let authenticated = false;
  const subscription = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") authenticated = true;
  });
  t.after(() => subscription.data.subscription.unsubscribe());
  await sendEmailCode(client.auth, user.email);
  await verifyEmailCode(client.auth, user.email, "12345678");
  assert.equal(sends, 1);
  assert.equal(verifies, 1);
  assert.ok(authenticated);
  assert.equal((await client.auth.getSession()).data.session?.user.id, user.id);
});
