import type { Study } from "./types";

// 답변을 다른 계정·재학습·질문 단계에 복원하지 않도록 키를 분리합니다.
export function draftRecoveryKey(
  owner: string,
  projectId: string,
  study: Study,
) {
  return `feynloop:draft:${owner}:${projectId}:${study.conceptId}:${study.attempt}:${study.phase}:${study.turns.length}`;
}
export function recoverDraft(
  storage: Pick<Storage, "getItem">,
  key: string,
  saved: string,
) {
  try {
    const local = storage.getItem(key);
    return local === null ? saved : local;
  } catch {
    return saved;
  }
}
