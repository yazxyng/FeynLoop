import { z } from "zod";

export const MAX_SOURCE_TEXT_LENGTH = 3000;
export const textSourceSchema = z
  .object({
    source: z.literal("text"),
    title: z.string().trim().min(1).max(80).default("텍스트 학습"),
    // 공백을 포함한 입력 길이를 먼저 검사하고, 빈 원문은 거부합니다.
    text: z
      .string()
      .max(
        MAX_SOURCE_TEXT_LENGTH,
        "텍스트 원문은 최대 3,000자까지 입력할 수 있어요.",
      )
      .trim()
      .min(1, "학습할 텍스트 원문을 입력해 주세요."),
    mode: z.enum(["demo", "live"]).default("demo"),
  })
  .strict();

export const projectInputSchema = z.union([
  z
    .object({
      sample: z.literal(true),
      mode: z.enum(["demo", "live"]).default("demo"),
    })
    .strict(),
  textSourceSchema,
]);
