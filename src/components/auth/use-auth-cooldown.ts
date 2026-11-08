"use client";
import { useEffect, useState } from "react";
import {
  AUTH_RETRY_COOLDOWN_SECONDS,
  type AuthLimitScope,
} from "@/lib/auth-rate-limit";

const STORAGE_KEY = "feynloop:auth-cooldown";
type Cooldown = Record<AuthLimitScope, number>;
const EMPTY_COOLDOWN: Cooldown = { email: 0, request: 0 };

// 메일 제한은 비밀번호 로그인을 막지 않습니다. 창을 다시 열어도 대기 시간은 유지합니다.
export function useAuthCooldown() {
  const [expiresAt, setExpiresAt] = useState<Cooldown>(EMPTY_COOLDOWN);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (
        stored &&
        Number.isFinite(stored.email) &&
        Number.isFinite(stored.request)
      ) {
        setExpiresAt(stored);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (Math.max(expiresAt.email, expiresAt.request) <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  function startCooldown(scope: AuthLimitScope) {
    const currentTime = Date.now();
    const next = {
      ...expiresAt,
      [scope]: currentTime + AUTH_RETRY_COOLDOWN_SECONDS * 1000,
    };
    setNow(currentTime);
    setExpiresAt(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function remainingSeconds(sendsEmail: boolean) {
    const until = sendsEmail
      ? Math.max(expiresAt.email, expiresAt.request)
      : expiresAt.request;
    return Math.max(0, Math.ceil((until - now) / 1000));
  }

  return { startCooldown, remainingSeconds };
}
