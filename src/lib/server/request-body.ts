import { setDiagnosticStage } from "./diagnostics";
import { ApiError } from "./errors";

/** 본문 크기와 전체 수신 시간을 모두 제한합니다. Content-Length가 없어도 검사합니다. */
export async function readBody(
  req: Request,
  maxBytes: number,
  timeoutMs = 15_000,
) {
  setDiagnosticStage("read-body");
  const declared = req.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))
  )
    throw new ApiError(400, "요청 크기 형식이 올바르지 않습니다.");
  if (declared !== null && Number(declared) > maxBytes)
    throw new ApiError(413, "요청 크기를 줄여 주세요.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "요청 내용이 필요합니다.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ApiError(
            408,
            "전송 시간이 초과됐어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
          ),
        ),
      timeoutMs,
    );
  });
  let size = 0;
  const chunks: Uint8Array[] = [];
  let complete = false;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ApiError(413, "요청 크기를 줄여 주세요.");
      chunks.push(value);
    }
    complete = true;
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return all;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {}
  }
}
