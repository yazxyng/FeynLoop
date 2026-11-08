"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordLogin from "../password-login";
import { useWorkspace } from "../workspace-provider";

export default function LoginPage() {
  const router = useRouter();
  const { ready, userId } = useWorkspace();
  // 가입 직후에는 로그인 상태여도 복구코드를 보관할 때까지 기다립니다.
  const started = useRef(false);
  useEffect(() => {
    if (ready && userId && !started.current) router.replace("/");
  }, [ready, userId, router]);
  return (
    <main className="auth-page">
      <Link href="/" className="brand">
        <span className="loop-symbol" />
        <strong>FeynLoop</strong>
      </Link>
      {!ready && !started.current ? (
        <p role="status">로그인 정보를 확인하고 있어요.</p>
      ) : (
        <PasswordLogin
          presentation="page"
          onStart={() => {
            started.current = true;
          }}
          onClose={() => router.push("/")}
          onSuccess={() => router.replace("/")}
        />
      )}
    </main>
  );
}
