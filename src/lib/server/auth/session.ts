import type { NextResponse } from "next/server";
import type { AccountUser } from "@/lib/account-types";
import { database } from "../database";
import { ApiError } from "../errors";
import { secretHash } from "./crypto";

export const ACCOUNT_COOKIE = "feynloop_account_v1";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
export function accountToken(req: Request) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(ACCOUNT_COOKIE + "="))
    ?.slice(ACCOUNT_COOKIE.length + 1);
}
export function databaseFailure() {
  return new ApiError(
    503,
    "아이디 로그인 저장소를 준비하지 못했습니다. Supabase에서 20261108_accounts.sql을 실행했는지 확인해 주세요.",
  );
}
export async function currentAccount(
  req: Request,
): Promise<AccountUser | null> {
  const token = accountToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const client = database();
  const session = await client
    .from("feynloop_sessions")
    .select("account_id")
    .eq("token_hash", secretHash(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (session.error) throw databaseFailure();
  if (!session.data) return null;
  const account = await client
    .from("feynloop_accounts")
    .select("id,username")
    .eq("id", session.data.account_id)
    .maybeSingle();
  if (account.error) throw databaseFailure();
  return account.data;
}
export function setAccountCookie(
  response: NextResponse,
  req: Request,
  token: string,
  maxAge = SESSION_SECONDS,
) {
  const hostname = new URL(req.url).hostname;
  response.cookies.set(ACCOUNT_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.NODE_ENV === "production" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(hostname),
    path: "/",
    maxAge,
  });
}
export async function revokeSession(req: Request) {
  const token = accountToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const { error } = await database()
    .from("feynloop_sessions")
    .delete()
    .eq("token_hash", secretHash(token));
  if (error) throw databaseFailure();
}
