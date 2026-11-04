import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/ai/route";
import { sample } from "../src/lib/demo";
const request = (body: unknown) =>
  new Request("http://localhost/api/ai", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("API: 데모 개념 분석은 실제 문서의 페이지만 반환한다", async () => {
  const old = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const res = await POST(
      request({ action: "concepts", pages: sample.pages }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.mode, "demo");
    assert.ok(data.concepts.length > 0);
    assert.ok(
      data.concepts.every((c: { pages: number[] }) =>
        c.pages.every((p) => sample.pages.some((v) => v.number === p)),
      ),
    );
  } finally {
    if (old) process.env.LLM_API_KEY = old;
  }
});
test("API: 설명 없는 평가와 잘못된 페이지를 거부한다", async () => {
  const res = await POST(request({ action: "feedback", pages: sample.pages }));
  assert.equal(res.status, 400);
  const invalid = await POST(
    request({ action: "concepts", pages: [{ number: -1, text: "test" }] }),
  );
  assert.equal(invalid.status, 400);
});
test("API: 요청 한도를 넘는 본문을 거부한다", async () => {
  const res = await POST(request({ large: "a".repeat(350001) }));
  assert.equal(res.status, 413);
});
