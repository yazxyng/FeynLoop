import { test } from "node:test";
import assert from "node:assert/strict";
import { demoFeedback, sample } from "../src/lib/server/demo";
import { conceptSchema, feedbackSchema } from "../src/lib/types";
import { extractPdf } from "../src/lib/pdf";
test("예제 개념의 근거가 실제 페이지에 존재한다", () => {
  assert.equal(sample.concepts.length, 6);
  for (const c of sample.concepts) {
    conceptSchema.parse(c);
    assert.ok(c.pages.every((p) => sample.pages.some((v) => v.number === p)));
  }
});
test("데모는 이해를 확정하지 않고 직전 답변을 질문에 반영한다", () => {
  const f = demoFeedback(
    "인출 연습",
    "기억에서 꺼내요",
    "시험 전에 빈 종이에 적어요",
  );
  feedbackSchema.parse(f);
  assert.equal(f.understood.length, 0);
  assert.ok(f.question.includes("빈 종이"));
  assert.ok(f.unverified.join().includes("미확인"));
});
test("잘못된 PDF 확장자, 크기, 서명을 거부한다", async () => {
  await assert.rejects(extractPdf(new File(["hello"], "x.txt")), /PDF/);
  await assert.rejects(extractPdf(new File(["not pdf"], "x.pdf")), /올바른/);
  await assert.rejects(extractPdf(new File([], "x.pdf")), /20MB/);
});

test("실제 PDF를 서버에서 추출하고 페이지 번호를 유지한다", async () => {
  const { textPdf } = await import("./pdf-fixture");
  const pages = await extractPdf(
    new File([textPdf()], "learning.pdf", { type: "application/pdf" }),
  );
  assert.equal(pages.length, 1);
  assert.equal(pages[0].number, 1);
  assert.ok(
    pages[0].text.includes(
      "recalling information without looking at the source",
    ),
  );
});
