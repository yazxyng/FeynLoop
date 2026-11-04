export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export async function extractPdf(file: File) {
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.size > MAX_PDF_BYTES ||
    file.size === 0
  )
    throw new Error("20MB 이하의 PDF 파일을 선택해 주세요.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-")
    throw new Error("올바른 PDF 파일이 아닙니다.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    if (doc.numPages > 150)
      throw new Error("MVP에서는 150페이지 이하의 PDF를 지원합니다.");
    const pages = [];
    let total = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("");
      total += text.length;
      if (total > 250000)
        throw new Error(
          "텍스트가 너무 많습니다. PDF를 나누어 업로드해 주세요.",
        );
      pages.push({ number, text });
    }
    if (pages.reduce((n, p) => n + p.text.trim().length, 0) < 50)
      throw new Error(
        "추출 가능한 텍스트가 부족합니다. 스캔 PDF의 OCR은 지원하지 않습니다.",
      );
    return pages;
  } finally {
    await task.destroy();
  }
}
