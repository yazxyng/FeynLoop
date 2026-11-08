import type { Concept, Project, Study } from "./types";
export type CardEntry = { project: Project; concept: Concept; study?: Study };
export function cardsOf(projects: Project[]): CardEntry[] {
  return projects.flatMap((project) =>
    project.concepts.map((concept) => ({
      project,
      concept,
      study: project.studies[concept.id],
    })),
  );
}
export function completedCards(project: Project) {
  return Object.values(project.studies).filter(
    (study) => study.phase === "done",
  ).length;
}
export function documentTitle(name: string) {
  return name.replace(/\.pdf$/i, "");
}
export function studyProgress(study?: Study) {
  if (!study) return 0;
  return study.phase === "done"
    ? 3
    : study.phase === "review" || study.phase === "rewrite"
      ? 2
      : 1;
}
export function studyLabel(study?: Study) {
  return !study
    ? "설명 전"
    : study.phase === "done"
      ? "설명 완료"
      : study.phase === "rewrite"
        ? "재설명 중"
        : study.phase === "review"
          ? "근거 확인"
          : "학습 중";
}
