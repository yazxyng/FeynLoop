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
import { evaluationInstruction } from "./learning-prompts";
import {
  assessmentResponseSchema,
  normalizeAssessmentResponse,
} from "./assessment-response";
const conceptsResponseSchema = z.object({
  concepts: z.array(conceptSchema).min(1).max(10),
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
    '개념 5~10개를 학습 순서대로 추출하라. 단, 짧은 문서에 독립적인 개념이 부족하면 1~4개도 허용한다. 개수를 채우려고 문서에 없는 내용이나 중복 개념을 만들지 마라. 페이지 번호나 “핵심 개념”, “주요 내용” 같은 일반적인 표현을 제목으로 쓰지 말고, 학습자가 무엇을 설명할지 알 수 있는 구체적인 개념명을 사용하라. 정의나 정답을 노출하지 않는 짧은 개념 이름만 title로 제공하고 description은 학습 목표를 한 문장으로 작성하라. {concepts:[{id:문자열,title,description,pages:[제공한 실제 페이지 번호],importance:"높음"|"보통",order:정수}]}',
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
      f.question = `방금 “${explanation.slice(0, 60)}”라고 설명했어요. 그렇게 생각한 이유를 한 가지 말해 줄래?`;
    if (!final && study.turns.length === 2)
      f.question = `“${explanation.slice(0, 60)}”라는 설명에서 조건 하나가 바뀌면 결과도 같을까?`;
    return {
      feedback: f,
      hints: [
        "개념 이름을 보고 스스로 떠올린 정의를 짧게 적어 보세요.",
        "정의와 연결되는 일상 사례를 하나 고르고, 원인과 결과를 나눠 설명해 보세요.",
      ],
    };
  }
  const parsed = await generateGemini(
    evaluationInstruction(final, study.turns.length),
    {
      pages,
      concept,
      firstExplanation: study.first || explanation,
      explanation,
      latestAnswer: explanation,
      questionMode: /모르|어려|헷갈|막혔/.test(explanation)
        ? "small_step"
        : "probe",
      lastQuestion: study.turns.at(-1)?.question || null,
      previousQuestions: study.turns.map((turn) => turn.question),
      remainingQuestions: Math.max(0, 3 - study.turns.length),
      turns: study.turns,
      firstAssessment: final ? study.firstAssessment : undefined,
      evidenceViews: study.evidenceViews,
      final,
    },
    assessmentResponseSchema,
    normalizeAssessmentResponse,
  );
  const { feedback } = groundAssessment(feedbackSchema.parse(parsed), pages);
  let hints = z
    .array(z.string().min(1).max(1000))
    .length(2)
    .parse(parsed.hints);
  const finished = final || study.turns.length >= 3;
  const grounding = parsed.questionGrounding;
  const question = feedback.question.trim();
  const questionSupported =
    grounding &&
    normalizeText(grounding.answerQuote) &&
    normalizeText(explanation).includes(normalizeText(grounding.answerQuote)) &&
    hasSourceQuote({ ...grounding, kind: "understood", claim: "" }, pages);
  const repeated = study.turns.some(
    (turn) => normalizeText(turn.question) === normalizeText(question),
  );
  // 원문을 닫은 학습에서 문서를 해설하거나 긴 원문을 그대로 내보내지 않습니다.
  const citesDocument = (text: string) =>
    /(?:교재|문서|원문|PDF).{0,12}(?:보면|따르면|내용|되어|나와|쪽|페이지)|\d+\s*(?:쪽|페이지)(?:에|을|를|의)/iu.test(
      text,
    );
  const copiesSource = (text: string) => {
    const normalized = normalizeText(text);
    return pages.some((page) => {
      const source = normalizeText(page.text);
      for (let offset = 0; offset <= normalized.length - 24; offset++) {
        const fragment = normalized.slice(offset, offset + 24);
        if (
          !normalizeText(concept.title).includes(fragment) &&
          source.includes(fragment)
        )
          return true;
      }
      return false;
    });
  };
  if (finished) {
    feedback.question = "";
  } else if (
    !questionSupported ||
    !question ||
    question.length > 240 ||
    citesDocument(question) ||
    copiesSource(question) ||
    repeated ||
    (question.match(/[?？]/g)?.length || 0) > 1
  ) {
    // 평가에 미확인 항목이 있어도 질문 자체의 근거가 확인되면 맞춤 질문을 유지합니다.
    const anchor = normalizeText(explanation).slice(0, 60);
    const candidates = /모르|어려|헷갈|막혔/.test(explanation)
      ? [
          `괜찮아. ${concept.title}이 쓰일 법한 상황 하나만 떠올려 볼까?`,
          `${concept.title}에서 이해한 부분과 아직 헷갈리는 부분을 나눠 말해 줄래?`,
        ]
      : [
          `“${anchor}”라고 한 부분을 조금 더 풀어 말해 줄래?`,
          `“${anchor}”라는 생각이 성립하려면 어떤 조건이 필요할까?`,
          `“${anchor}”에서 조건 하나가 달라지면 결과도 달라질까?`,
        ];
    feedback.question =
      candidates.find(
        (candidate) =>
          !study.turns.some(
            (turn) => normalizeText(turn.question) === normalizeText(candidate),
          ),
      ) || `이번 설명에서 아직 확신이 안 드는 부분 하나를 골라 줄래?`;
    hints = [
      "방금 답변에서 내가 확실히 아는 부분 하나만 골라 봐.",
      "그 부분을 처음 듣는 사람에게 한 문장으로 풀어 말해 봐.",
    ];
  } else {
    feedback.question = question;
  }
  // 힌트도 사실 설명 대신 생각할 방향만 제공하게 제한합니다.
  if (
    hints.some(
      (hint) =>
        citesDocument(hint) ||
        copiesSource(hint) ||
        /(?:뜻이야|말해\.|훈련이야|강화돼|강화한다|활동이다)/u.test(hint),
    )
  ) {
    hints = [
      "질문에서 달라지는 조건 하나만 먼저 골라 봐.",
      "그 조건이 바뀌기 전과 후를 나눠, 네 설명으로 결과를 예상해 봐.",
    ];
  }
  feedback.hint = "";
  return { feedback, hints };
}
