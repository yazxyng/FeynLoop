import { test } from "node:test";
import assert from "node:assert/strict";
import { draftRecoveryKey, recoverDraft } from "../src/lib/draft-recovery";
import { newStudy } from "../src/lib/types";

test("작성 중 설명은 계정·문서·질문·재학습 사이에 섞이지 않는다", () => {
  const study = newStudy("concept");
  const key = draftRecoveryKey("user-a", "project-a", study);
  for (const next of [
    draftRecoveryKey("user-b", "project-a", study),
    draftRecoveryKey("user-a", "project-b", study),
    draftRecoveryKey("user-a", "project-a", { ...study, phase: "rewrite" }),
    draftRecoveryKey("user-a", "project-a", { ...study, attempt: 2 }),
    draftRecoveryKey("user-a", "project-a", {
      ...study,
      turns: [{ question: "q", answer: "a", hints: [] }],
    }),
  ])
    assert.notEqual(key, next);
});
test("복구는 의도적으로 비운 설명도 보존하고 브라우저 저장소 실패 시 서버 초안을 유지한다", () => {
  assert.equal(recoverDraft({ getItem: () => "" }, "key", "서버 설명"), "");
  assert.equal(
    recoverDraft({ getItem: () => null }, "key", "서버 설명"),
    "서버 설명",
  );
  assert.equal(
    recoverDraft(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      "key",
      "서버 설명",
    ),
    "서버 설명",
  );
});
