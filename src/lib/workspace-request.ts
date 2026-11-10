import { RequestError, responseRequestId } from "./request-error";
/** 업로드·학습 요청은 응답 본문을 읽는 시간까지 제한합니다. 자동 재전송은 하지 않습니다. */
export async function workspaceRequest(
  path: string,
  body?: unknown,
  timeoutMs = 180_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isForm = body instanceof FormData;
  let requestId: string | undefined;
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: controller.signal,
      headers:
        body !== undefined && !isForm
          ? { "Content-Type": "application/json" }
          : {},
      ...(body !== undefined
        ? { body: isForm ? body : JSON.stringify(body) }
        : {}),
    });
    requestId = responseRequestId(response);
    const data = await response.json().catch(() => {
      if (controller.signal.aborted) throw new DOMException("", "AbortError");
      throw new RequestError(
        "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
        requestId,
      );
    });
    requestId = responseRequestId(response, data);
    if (!response.ok)
      throw new RequestError(
        typeof data?.error === "string"
          ? data.error
          : "요청을 처리하지 못했습니다.",
        requestId,
      );
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new RequestError(
        "응답 대기 시간이 초과됐어요. 작성한 내용은 유지돼요. 저장이 끝났을 수 있으니 카드함이나 학습 기록을 확인한 뒤 다시 시도해 주세요.",
        requestId,
      );
    if (error instanceof TypeError)
      throw new Error("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
