import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error(".env.local 파일을 읽지 못했습니다.");
}
let failed = false;
function report(name, ok, help = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !help ? "" : ` — ${help}`}`);
  if (!ok) failed = true;
}
const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
report(
  "Gemini 키 설정",
  Boolean(process.env.GEMINI_API_KEY?.trim()),
  "GEMINI_API_KEY를 설정해 주세요.",
);
console.log(
  "  Gemini 요청은 보내지 않습니다. 키 유효성·사용 한도는 실제 학습 시 확인됩니다.",
);
report(
  "Supabase 환경변수",
  Boolean(url && secret),
  "Supabase URL과 서버 비밀 키가 필요합니다. 공개 인증 키는 이전 기록 이관에만 사용합니다.",
);
if (url && secret) {
  try {
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    };
    const client = createClient(url, secret, options);
    for (const [table, columns] of [
      ["feynloop_accounts", "id,username,nickname,plan_preference"],
      ["feynloop_sessions", "token_hash,account_id"],
      ["feynloop_auth_limits", "key,attempts"],
      ["feynloop_account_projects", "id,version,file_path"],
      ["feynloop_account_sources", "project_id,pages"],
    ]) {
      const { error } = await client.from(table).select(columns).limit(0);
      report(
        `${table} 접근`,
        !error,
        "서버 키 및 supabase/setup-accounts.sql 실행 여부를 확인해 주세요.",
      );
    }
    const bucket = await client.storage.getBucket("pdfs");
    report(
      "비공개 PDF 저장소",
      !bucket.error && bucket.data?.public === false,
      "pdfs 버킷은 비공개로 설정해야 합니다.",
    );
    // 함수는 실행하지 않고 API 스키마에서 존재 여부만 확인합니다.
    const response = await fetch(new URL("/rest/v1/", url), {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10000),
    });
    const schema = response.ok ? await response.json() : null;
    for (const name of [
      "feynloop_auth_attempt",
      "feynloop_register_account",
      "feynloop_recover_account",
      "create_feynloop_account_project",
      "feynloop_import_legacy",
      "feynloop_change_password",
    ]) {
      report(
        name,
        Boolean(schema?.paths?.["/rpc/" + name]),
        "supabase/setup-accounts.sql을 실행해 주세요.",
      );
    }
  } catch {
    report(
      "Supabase 연결 검사",
      false,
      "네트워크 연결과 Supabase URL을 확인해 주세요.",
    );
  }
}
console.log("사용자 데이터 변경·로그인 메일 발송·AI 호출은 하지 않았습니다.");
process.exitCode = failed ? 1 : 0;
