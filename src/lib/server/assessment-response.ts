import { z } from "zod";
import { scaffoldHints } from "./learning-dialogue";
import { feedbackSchema } from "../types";

export const questionGroundingSchema = z.object({
  answerQuote: z.string().max(120),
  page: z.number().int().positive(),
  quote: z.string().min(1).max(650),
});

// 모델에는 완전한 형식을 요청하고, 받은 뒤 항목별로 검증합니다.
export const assessmentResponseSchema = feedbackSchema.extend({
  hints: z.array(z.string().min(1).max(1000)).length(2),
  questionGrounding: questionGroundingSchema.nullable(),
});

/** 보조 항목 하나의 실패 때문에 정상 질문까지 버리지 않습니다. 판단을 만들어 채우지는 않습니다. */
export function normalizeAssessmentResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const listKeys = [
    "understood",
    "errors",
    "missing",
    "improve",
    "unverified",
  ] as const;
  if (
    typeof raw.question !== "string" &&
    typeof raw.change !== "string" &&
    !listKeys.some((key) => Array.isArray(raw[key]))
  )
    return value;

  let incomplete = false;
  const lists = Object.fromEntries(
    listKeys.map((key) => {
      const values = Array.isArray(raw[key]) ? raw[key] : [];
      const valid = [
        ...new Set(
          values
            .filter(
              (item): item is string =>
                typeof item === "string" &&
                item.trim().length > 0 &&
                item.length <= 1000,
            )
            .map((item) => item.trim()),
        ),
      ].slice(0, 12);
      if (!Array.isArray(raw[key]) || valid.length !== values.length)
        incomplete = true;
      return [key, valid];
    }),
  ) as Record<(typeof listKeys)[number], string[]>;

  const evidence = [];
  for (const entry of Array.isArray(raw.evidence) ? raw.evidence : []) {
    const parsed = feedbackSchema.shape.evidence
      .unwrap()
      .element.safeParse(entry);
    if (parsed.success && evidence.length < 36) evidence.push(parsed.data);
    else incomplete = true;
  }
  const grounding = questionGroundingSchema.safeParse(raw.questionGrounding);
  const suppliedHints = Array.isArray(raw.hints) ? raw.hints : [];
  const hints = suppliedHints
    .filter(
      (hint): hint is string =>
        typeof hint === "string" &&
        hint.trim().length > 0 &&
        hint.length <= 1000,
    )
    .slice(0, 2);
  const fallbackHints = scaffoldHints(
    typeof raw.question === "string" ? raw.question : "",
  );
  while (hints.length < 2) hints.push(fallbackHints[hints.length]);
  const question =
    typeof raw.question === "string" && raw.question.length <= 2000
      ? raw.question.trim()
      : "";
  const change =
    typeof raw.change === "string" && raw.change.length <= 2000
      ? raw.change
      : "";
  if (incomplete)
    lists.unverified = [
      ...lists.unverified.slice(0, 11),
      "AI 응답의 일부 평가 항목이 누락되거나 형식이 맞지 않아 그 항목은 미확인으로 남겼어요.",
    ];
  return {
    ...lists,
    question,
    change,
    hint: "",
    evidence,
    hints,
    questionGrounding: grounding.success ? grounding.data : null,
  };
}
