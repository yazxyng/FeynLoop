import { createHash } from "node:crypto";
import { z } from "zod";
import {
  newStudy,
  conceptSchema,
  type Project,
  type Study,
  type Feedback,
  type EvidenceExcerpt,
} from "../types";
import type {
  StoredProject,
  PrivateProject,
  PrivateStudy,
  SourcePage,
} from "./models";
import type { Identity } from "./http";
import { evaluate } from "./learning-ai";
import { ApiError } from "./errors";
import { loadProject, updateProject, withProjectLock } from "./store";
import { learningDay } from "../activity";
export const commandSchema = z
  .object({
    requestId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    conceptId: z.string().min(1).max(100),
    action: z.enum([
      "start",
      "submit",
      "draft",
      "hint",
      "evidence",
      "rewrite",
      "restart",
      "editConcept",
    ]),
    text: z.string().max(15000).optional(),
    page: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().max(600).optional(),
  })
  .strict();
export type Command = z.infer<typeof commandSchema>;
const emptyFeedback = (question = ""): Feedback => ({
  understood: [],
  errors: [],
  missing: [],
  improve: [],
  unverified: [],
  question,
  hint: "",
  change: "",
  evidence: [],
});
export function excerpts(
  pages: SourcePage[],
  concept: PrivateProject["concepts"][number],
  study: PrivateStudy,
): EvidenceExcerpt[] {
  return study.evidenceViews.map((view) => {
    const text = pages.find((p) => p.number === view.page)?.text || "";
    const paragraphs = text.split(/\n\s*\n/).filter((v) => v.trim());
    const index = paragraphs.findIndex((v) => v.includes(concept.title));
    const selected =
      index < 0
        ? paragraphs[0] || ""
        : paragraphs[index].length > concept.title.length + 15
          ? paragraphs[index]
          : paragraphs.slice(index, index + 2).join("\n\n");
    return {
      page: view.page,
      text: selected.slice(0, 650),
      viewedAt: view.viewedAt,
    };
  });
}
// 공개할 필드를 명시합니다. 원문·비공개 평가·미사용 힌트·과거 시도는 반환하지 않습니다.
export function present(
  project: PrivateProject,
  pages?: SourcePage[],
  focusId?: string,
): Project {
  const studies: Record<string, Study> = {};
  for (const [id, s] of Object.entries(project.studies)) {
    const concept = project.concepts.find((c) => c.id === id);
    studies[id] = {
      conceptId: s.conceptId,
      first: s.first,
      final: s.final,
      turns: s.turns.map((t) => ({
        question: t.question,
        answer: t.answer,
        hints: [...t.hints],
      })),
      phase: s.phase,
      draft: s.draft,
      hints: s.phase === "questions" ? [...s.hints] : [],
      evidenceViews: s.evidenceViews.map((v) => ({ ...v })),
      attempt: s.attempt,
      feedback:
        s.phase === "done" && id === focusId
          ? s.assessment
          : emptyFeedback(
              s.phase === "questions" ? s.assessment?.question : "",
            ),
      ...(s.phase === "done" && id === focusId
        ? { initialFeedback: s.firstAssessment, result: s.assessment }
        : {}),
      ...(s.phase === "review" && pages && concept && id === focusId
        ? { evidence: excerpts(pages, concept, s) }
        : {}),
    };
  }
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    pageCount: project.pageCount,
    concepts: project.concepts.map((c) => ({ ...c, pages: [...c.pages] })),
    studies,
    version: project.version,
    mode: project.mode,
  };
}
export function assertEvidenceAllowed(study: PrivateStudy | undefined) {
  if (study?.phase !== "review")
    throw new ApiError(
      409,
      "관련 근거는 질문을 모두 마친 후 확인할 수 있습니다. 설명 중에는 원문을 열 수 없습니다.",
    );
}
export async function applyCommand(record: StoredProject, command: Command) {
  const p = structuredClone(record.project),
    concept = p.concepts.find((c) => c.id === command.conceptId);
  if (!concept) throw new ApiError(404, "개념을 찾을 수 없습니다.");
  let s = p.studies[concept.id];
  const text = command.text?.trim();
  switch (command.action) {
    case "start":
      if (!s) {
        s = { ...newStudy(concept.id) };
        p.studies[concept.id] = s;
      }
      break;
    case "editConcept":
      if (s)
        throw new ApiError(409, "학습을 시작한 개념은 수정할 수 없습니다.");
      if (command.title === undefined || command.description === undefined)
        throw new ApiError(400, "개념 이름과 설명이 필요합니다.");
      Object.assign(
        concept,
        conceptSchema.parse({
          ...concept,
          title: command.title,
          description: command.description,
        }),
      );
      break;
    case "draft":
      if (!s || !["explain", "questions", "rewrite"].includes(s.phase))
        throw new ApiError(409, "현재 단계에서는 설명을 작성할 수 없습니다.");
      s.draft = command.text || "";
      break;
    case "submit": {
      if (!s || !["explain", "questions", "rewrite"].includes(s.phase))
        throw new ApiError(409, "현재 단계에서는 설명을 제출할 수 없습니다.");
      if (!text) throw new ApiError(400, "설명을 입력해 주세요.");
      const final = s.phase === "rewrite",
        first = s.phase === "explain";
      if (first) s.first = text;
      if (s.phase === "questions") {
        if (!s.assessment?.question || s.turns.length >= 3)
          throw new ApiError(409, "질문 상태를 확인해 주세요.");
        s.turns.push({
          question: s.assessment.question,
          answer: text,
          hints: [...s.hints],
        });
      }
      const assessed = await evaluate(
        record.pages,
        concept,
        s,
        text,
        p.mode === "live",
        final,
      );
      s.assessment = assessed.feedback;
      s.hintPlan = assessed.hints;
      s.hints = [];
      s.draft = "";
      if (first) s.firstAssessment = assessed.feedback;
      if (final) {
        s.final = text;
        s.phase = "done";
      } else s.phase = s.turns.length === 3 ? "review" : "questions";
      break;
    }
    case "hint":
      if (s?.phase !== "questions")
        throw new ApiError(409, "질문 단계에서만 힌트를 요청할 수 있습니다.");
      if (s.hints.length >= 2)
        throw new ApiError(409, "이 질문의 힌트를 모두 확인했습니다.");
      if (!s.hintPlan?.[s.hints.length])
        throw new ApiError(409, "힌트를 찾지 못했습니다.");
      if (command.text !== undefined) s.draft = command.text;
      s.hints.push(s.hintPlan[s.hints.length]);
      break;
    case "evidence": {
      assertEvidenceAllowed(s);
      if (!command.page || !concept.pages.includes(command.page))
        throw new ApiError(
          403,
          "이 개념과 관련된 근거 페이지만 확인할 수 있습니다.",
        );
      if (!s.evidenceViews.some((v) => v.page === command.page)) {
        if (s.evidenceViews.length >= 3)
          throw new ApiError(
            409,
            "한 번의 학습에서 근거는 최대 3페이지까지 확인할 수 있습니다.",
          );
        s.evidenceViews.push({
          page: command.page,
          viewedAt: new Date().toISOString(),
        });
      }
      break;
    }
    case "rewrite":
      if (s?.phase !== "review")
        throw new ApiError(409, "질문을 모두 마친 후 재설명을 시작해 주세요.");
      s.phase = "rewrite";
      s.draft = "";
      s.hints = [];
      break;
    case "restart":
      if (s?.phase !== "done")
        throw new ApiError(409, "학습을 마친 후 다시 연습할 수 있습니다.");
      p.studies[concept.id] = {
        ...newStudy(concept.id, s.attempt + 1),
        archives: [...(s.archives || []), { ...s, archives: undefined }],
      };
      break;
  }
  return p;
}
export async function execute(
  id: Identity,
  projectId: string,
  command: Command,
) {
  return withProjectLock(id, projectId, async () => {
    const record = await loadProject(id, projectId);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          ...command,
          version: undefined,
          requestId: undefined,
        }),
      )
      .digest("hex");
    const receipt = record.project.receipts.find(
      (r) => r.id === command.requestId,
    );
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new ApiError(
          409,
          "동일한 요청 번호를 다른 작업에 사용할 수 없습니다.",
        );
      return present(record.project, record.pages, command.conceptId);
    }
    if (record.project.version !== command.version)
      throw new ApiError(
        409,
        "다른 화면에서 학습 기록이 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
      );
    const next = await applyCommand(record, command);
    if (command.action === "submit") {
      const day = learningDay();
      next.activity = {
        ...next.activity,
        [day]: (next.activity?.[day] || 0) + 1,
      };
    }
    next.version = record.project.version + 1;
    next.receipts = [
      ...next.receipts,
      { id: command.requestId, fingerprint },
    ].slice(-30);
    await updateProject(id, next, record.project.version);
    return present(next, record.pages, command.conceptId);
  });
}
