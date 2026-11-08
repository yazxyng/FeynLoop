import { z } from "zod";
import {
  conceptSchema,
  feedbackSchema,
  type Concept,
  type Feedback,
} from "../types";
import type { SourcePage, PrivateStudy } from "./models";
import { demoFeedback } from "./demo";
import { ApiError } from "./errors";
import { generateGemini } from "./gemini";
const conceptsResponseSchema = z.object({
  concepts: z.array(conceptSchema).min(1).max(10),
});
const assessmentResponseSchema = feedbackSchema.extend({
  hints: z.array(z.string().min(1).max(1000)).length(2),
});
export async function extractConcepts(
  pages: SourcePage[],
  live: boolean,
): Promise<Concept[]> {
  if (!live) {
    const headings = pages.flatMap((p) =>
      p.text
        .split("\n")
        .map((v) => v.trim())
        .filter(
          (v) => /^(\d+[.)]|제\s*\d+|chapter\s*\d+)/i.test(v) && v.length < 100,
        )
        .map((v) => ({ title: v.replace(/^\d+[.)]\s*/, ""), page: p.number })),
    );
    // 원문 문장을 그대로 노출하는 대신 제목이 없으면 중립적인 주제 후보를 제공합니다.
    const candidates = headings.length
      ? headings.slice(0, 10)
      : pages.slice(0, 8).map((p) => ({
          title: `${p.number}페이지의 핵심 개념`,
          page: p.number,
        }));
    return candidates.map((c, i) => ({
      id: crypto.randomUUID(),
      title: c.title.slice(0, 150),
      description: "학습할 개념 이름을 확인하고 필요하면 수정해 주세요.",
      pages: [c.page],
      importance: i < 3 ? "높음" : "보통",
      order: i + 1,
    }));
  }
  const parsed = await generateGemini(
    '개념 5~10개를 학습 순서대로 추출하라. 단, 짧은 문서에 독립적인 개념이 부족하면 1~4개도 허용한다. 개수를 채우려고 문서에 없는 내용이나 중복 개념을 만들지 마라. 정의나 정답을 노출하지 않는 짧은 개념 이름만 title로 제공하고 description은 학습 목표를 한 문장으로 작성하라. {concepts:[{id:문자열,title,description,pages:[제공한 실제 페이지 번호],importance:"높음"|"보통",order:정수}]}',
    { pages },
    conceptsResponseSchema,
  );
  const concepts = conceptsResponseSchema.parse(parsed).concepts;
  const numbers = new Set(pages.map((p) => p.number));
  if (concepts.some((c) => c.pages.some((p) => !numbers.has(p))))
    throw new ApiError(502, "AI가 잘못된 근거 페이지를 반환했습니다.");
  return concepts.map((c, i) => ({
    ...c,
    id: crypto.randomUUID(),
    order: i + 1,
  }));
}
export function validateGrounding(feedback: Feedback, pages: SourcePage[]) {
  for (const kind of ["understood", "errors", "missing"] as const) {
    for (const claim of feedback[kind]) {
      if (
        !feedback.evidence.some(
          (e) =>
            e.kind === kind &&
            normalizeText(e.claim) === normalizeText(claim) &&
            hasSourceQuote(e, pages),
        )
      )
        throw new ApiError(
          502,
          "AI 평가의 문서 근거를 확인하지 못했습니다. 다시 시도해 주세요.",
        );
    }
  }
  if (feedback.evidence.some((e) => !hasSourceQuote(e, pages)))
    throw new ApiError(502, "AI 평가의 인용문을 확인하지 못했습니다.");
}

// PDF의 줄바꿈·연속 공백·한글 조합 방식만 정규화합니다.
// 단어, 숫자, 문장부호는 바꾸지 않으며 유사도나 부분 단어로 근거를 추정하지 않습니다.
function normalizeText(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}
function hasSourceQuote(
  evidence: Feedback["evidence"][number],
  pages: SourcePage[],
) {
  const quote = normalizeText(evidence.quote);
  return (
    Boolean(quote) &&
    pages.some(
      (page) =>
        page.number === evidence.page &&
        normalizeText(page.text).includes(quote),
    )
  );
}

/** 근거를 못 찾은 판단은 성공/오답으로 저장하지 않고 미확인으로 남깁니다. */
export function groundAssessment(original: Feedback, pages: SourcePage[]) {
  const feedback = structuredClone(original);
  const validEvidence: Feedback["evidence"] = [];
  let withheld = 0;
  for (const kind of ["understood", "errors", "missing"] as const) {
    feedback[kind] = original[kind].filter((claim) => {
      const evidence = original.evidence.filter(
        (entry) =>
          entry.kind === kind &&
          normalizeText(entry.claim) === normalizeText(claim) &&
          hasSourceQuote(entry, pages),
      );
      if (!evidence.length) {
        withheld++;
        return false;
      }
      validEvidence.push(...evidence.map((entry) => ({ ...entry, claim })));
      return true;
    });
  }
  feedback.evidence = [
    ...new Map(
      validEvidence.map((entry) => [JSON.stringify(entry), entry]),
    ).values(),
  ];
  if (withheld) {
    // 확인되지 않은 판단을 개선 조언이나 변화 요약에서 다시 확정하지 않습니다.
    feedback.improve = [];
    feedback.change =
      "일부 평가의 문서 근거가 확인되지 않아 이해도 변화 판단을 보류했어요.";
    feedback.unverified = [
      ...original.unverified.slice(0, 11),
      `문서 근거를 확인하지 못한 평가 ${withheld}개는 맞음·틀림으로 판정하지 않고 미확인으로 남겼어요.`,
    ];
  }
  validateGrounding(feedback, pages);
  return { feedback, withheld: withheld > 0 };
}
export async function evaluate(
  pages: SourcePage[],
  concept: Concept,
  study: PrivateStudy,
  explanation: string,
  live: boolean,
  final: boolean,
): Promise<{ feedback: Feedback; hints: string[] }> {
  if (!live) {
    const f = demoFeedback(
      concept.title,
      study.first || explanation,
      final ? undefined : study.turns.at(-1)?.answer,
    );
    if (!final && study.turns.length === 1)
      f.question = `방금 “${explanation.slice(0, 60)}”라고 설명했어요. 그 사례에서 원인과 결과는 각각 무엇인가요?`;
    if (!final && study.turns.length === 2)
      f.question = `“${explanation.slice(0, 60)}”라는 답을 다른 상황에도 적용할 수 있을까요? ${concept.title}이 잘 적용되지 않는 경우를 떠올려 주세요.`;
    return {
      feedback: f,
      hints: [
        "개념 이름을 보고 스스로 떠올린 정의를 짧게 적어 보세요.",
        "정의와 연결되는 일상 사례를 하나 고르고, 원인과 결과를 나눠 설명해 보세요.",
      ],
    };
  }
  const parsed = await generateGemini(
    `설명에서 확인되지 않은 것은 모름이나 오답이 아니라 unverified(미확인)다. errors는 명시적으로 틀린 주장만, missing은 학습 목표 중 설명에 빠진 항목(이해 여부 미확인)으로 구분하라. understood와 errors와 missing의 각 문장마다 evidence에 동일한 claim, kind, page, 원문 그대로의 연속된 짧은 quote를 제공하라. 인용문에 요약·말줄임표를 넣지 마라. claim은 해당 평가 문장을 그대로 복사하라. 정확한 인용문을 찾을 수 없는 판단은 understood/errors/missing에 넣지 말고 unverified에 판단 보류로 기록하라. 근거 없는 확신·점수는 금지한다. ${final ? "첫 설명과 마지막 설명을 동일 기준으로 비교하고 change에 구체적인 변화와 남은 불확실성을 기술하라. 근거·힌트 열람 이력을 함께 고려하고 독립적인 숙달로 단정하지 마라. question은 빈 문자열이다." : study.turns.length >= 3 ? "세 번의 질문을 마쳤으므로 더 질문하지 말고 question을 빈 문자열로 반환하라." : "직전 답변을 반영한 새로운 학생 질문 하나만 question으로 작성하라. 이전 질문을 반복하지 마라. 정답, 정의, 인용문, 원문 문장을 질문과 힌트에 넣지 말고 사용자가 생각할 수 있는 단서만 제시하라."} 형식: {understood:[문자열],errors:[문자열],missing:[문자열],improve:[문자열],unverified:[문자열],question:문자열,hint:"",change:문자열,evidence:[{kind:"understood"|"errors"|"missing",claim:문자열,page:정수,quote:문자열}],hints:[정답을 주지 않는 가벼운 단서,사고 과정을 안내하는 다음 단계 단서]}`,
    {
      pages,
      concept,
      firstExplanation: study.first || explanation,
      explanation,
      turns: study.turns,
      firstAssessment: final ? study.firstAssessment : undefined,
      evidenceViews: study.evidenceViews,
      final,
    },
    assessmentResponseSchema,
  );
  const { feedback, withheld } = groundAssessment(
    feedbackSchema.parse(parsed),
    pages,
  );
  let hints = z
    .array(z.string().min(1).max(1000))
    .length(2)
    .parse(parsed.hints);
  if (withheld) {
    // 근거 없는 평가에서 파생된 질문·힌트를 사용하지 않고 설명을 더 확인합니다.
    feedback.question =
      final || study.turns.length >= 3
        ? ""
        : study.turns.length === 0
          ? "방금 설명한 개념을 보여 주는 구체적인 사례를 하나 들어 줄래요?"
          : study.turns.length === 1
            ? "방금 든 사례에서 원인과 결과가 어떻게 이어지는지 설명해 줄래요?"
            : "방금 답변이 다른 상황에서도 성립할까요? 조건을 바꾸어 생각해 줄래요?";
    hints = [
      "내 설명에서 가장 중요한 단어 하나를 골라 보세요.",
      "그 단어가 드러나는 사례를 고르고, 왜 그런 결과가 생기는지 생각해 보세요.",
    ];
    feedback.hint = "";
  }
  if (!final && study.turns.length < 3 && !feedback.question.trim())
    throw new ApiError(502, "AI가 질문을 생성하지 못했습니다.");
  return { feedback, hints };
}
