import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError } from "./errors";
import { accountToken, currentAccount } from "./auth/session";
export type Identity = {
  owner: string;
  userId?: string;
  account?: boolean;
  cookie?: string;
  secureCookie?: boolean;
};
export const DEMO_COOKIE = "feynloop_session_v2";
export async function identity(req: Request): Promise<Identity> {
  if (accountToken(req)) {
    const user = await currentAccount(req);
    if (!user)
      throw new ApiError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
    return { owner: `account:${user.id}`, userId: user.id, account: true };
  }
  const authorization = req.headers.get("authorization");
  if (authorization) {
    if (!/^Bearer \S+$/.test(authorization))
      throw new ApiError(401, "로그인이 올바르지 않습니다.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new ApiError(503, "Supabase 인증 설정이 필요합니다.");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user)
      throw new ApiError(401, "로그인이 만료되었습니다.");
    if (!process.env.SUPABASE_SECRET_KEY)
      throw new ApiError(
        503,
        "서버 저장소 설정이 필요합니다. README의 Supabase v2 설정을 확인해 주세요.",
      );
    return { owner: `user:${data.user.id}`, userId: data.user.id };
  }
  if (process.env.ALLOW_DEMO === "false")
    throw new ApiError(401, "로그인 후 이용해 주세요.");
  const found = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(DEMO_COOKIE + "="))
    ?.slice(DEMO_COOKIE.length + 1);
  const id =
    found && z.string().uuid().safeParse(found).success ? found : randomUUID();
  return {
    owner: `demo:${id}`,
    cookie: found === id ? undefined : id,
    secureCookie:
      process.env.NODE_ENV === "production" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL("http://" + (req.headers.get("host") || new URL(req.url).host))
          .hostname,
      ),
  };
}
export function guardOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || new URL(req.url).host;
  const protocol =
    req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    new URL(req.url).protocol.replace(":", "");
  let sameOrigin = true;
  if (origin) {
    try {
      const parsed = new URL(origin);
      sameOrigin = parsed.host === host && parsed.protocol === protocol + ":";
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin || req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "다른 사이트에서의 요청은 허용하지 않습니다.");
}
export function json(data: unknown, id?: Identity, status = 200) {
  const response = NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Cookie, Authorization" },
  });
  if (id?.cookie)
    response.cookies.set(DEMO_COOKIE, id.cookie, {
      httpOnly: true,
      sameSite: "strict",
      secure: id.secureCookie ?? process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  return response;
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, undefined, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return json(
      { error: "요청 또는 AI 응답 형식이 올바르지 않습니다." },
      undefined,
      400,
    );
  console.error(
    "FeynLoop request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error:
        "처리하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.",
    },
    undefined,
    500,
  );
}
export async function readJson(req: Request, max = 40000) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "요청 내용이 필요합니다.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "요청 크기를 줄여 주세요.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
