import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Route =
  | "auth.session.get"
  | "auth.session.post"
  | "auth.import"
  | "account.profile.get"
  | "account.profile.post"
  | "projects.list"
  | "projects.create"
  | "projects.get"
  | "projects.update"
  | "ai.legacy";
export type DiagnosticStage =
  | "received"
  | "origin"
  | "validate"
  | "authenticate"
  | "read-body"
  | "read-storage"
  | "write-storage"
  | "extract-pdf"
  | "extract-concepts"
  | "evaluate"
  | "account"
  | "read-session"
  | "read-account"
  | "revoke-session"
  | "request-limit"
  | "register"
  | "find-account"
  | "create-session"
  | "recover";
type Context = {
  requestId: string;
  route: Route;
  stage: DiagnosticStage;
  started: number;
  logged: boolean;
  code?: string;
};
const requests = new AsyncLocalStorage<Context>();

// 외부에서 보낸 요청 번호·URL·사용자 입력을 로그 문맥에 사용하지 않습니다.
export function withDiagnostics<T>(
  route: Route,
  task: () => Promise<T>,
): Promise<T> {
  return requests.run(
    {
      requestId: randomUUID(),
      route,
      stage: "received",
      started: performance.now(),
      logged: false,
    },
    task,
  );
}
export function setDiagnosticStage(stage: DiagnosticStage) {
  const context = requests.getStore();
  if (context) context.stage = stage;
}
export function setDiagnosticCode(code?: string) {
  const context = requests.getStore();
  if (
    context &&
    code &&
    /^(?:[0-9]{2}[A-Z0-9]{3}|XX[A-Z0-9]{3}|PGRST\d{3})$/.test(code)
  )
    context.code = code;
}
export function currentRequestId() {
  return requests.getStore()?.requestId;
}
export function logRequestFailure(status: number) {
  const context = requests.getStore();
  const requestId = context?.requestId || randomUUID();
  if (!context?.logged) {
    if (context) context.logged = true;
    // 기록 항목은 고정합니다. 오류 원문·stack·headers·body는 기록하지 않습니다.
    console.error("FeynLoop request failed:", {
      requestId,
      route: context?.route || "unknown",
      stage: context?.stage || "received",
      status,
      durationMs: context
        ? Math.max(0, Math.round(performance.now() - context.started))
        : 0,
      ...(context?.code ? { code: context.code } : {}),
    });
  }
  return requestId;
}
