/** 서버가 발급한 오류 번호만 전달합니다. 사용자 입력이나 네트워크 오류로 번호를 만들지 않습니다. */
export function validRequestId(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}
export function responseRequestId(response: Response, data?: unknown) {
  const bodyId =
    data && typeof data === "object" && "requestId" in data
      ? data.requestId
      : undefined;
  return (
    validRequestId(response.headers?.get("X-Request-ID")) ||
    validRequestId(bodyId)
  );
}
export class RequestError extends Error {
  readonly requestId?: string;
  constructor(message: string, requestId?: string) {
    super(message);
    this.requestId = validRequestId(requestId);
  }
}
export function errorRequestId(error: unknown) {
  return error instanceof RequestError ? error.requestId : undefined;
}
