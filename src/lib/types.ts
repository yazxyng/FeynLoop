import { z } from "zod";
export const conceptSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(150),
  description: z.string().max(600),
  pages: z.array(z.number().int().positive()).min(1).max(150),
  importance: z.enum(["높음", "보통"]),
  order: z.number().int().positive(),
});
export const feedbackSchema = z.object({
  understood: z.array(z.string().max(1000)).max(12),
  errors: z.array(z.string().max(1000)).max(12).default([]),
  missing: z.array(z.string().max(1000)).max(12).default([]),
  improve: z.array(z.string().max(1000)).max(12),
  unverified: z.array(z.string().max(1000)).max(12),
  question: z.string().max(2000),
  hint: z.string().max(1000),
  change: z.string().max(2000).default(""),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["understood", "errors", "missing"]),
        claim: z.string().max(1000),
        page: z.number().int().positive(),
        quote: z.string().min(1).max(650),
      }),
    )
    .max(36)
    .default([]),
});
export type Concept = z.infer<typeof conceptSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Turn = { question: string; answer: string; hints: string[] };
export type EvidenceExcerpt = { page: number; text: string; viewedAt: string };
export type Study = {
  conceptId: string;
  first: string;
  final: string;
  turns: Turn[];
  feedback?: Feedback;
  initialFeedback?: Feedback;
  result?: Feedback;
  phase: "explain" | "questions" | "review" | "rewrite" | "done";
  draft: string;
  hints: string[];
  evidenceViews: { page: number; viewedAt: string }[];
  evidence?: EvidenceExcerpt[];
  attempt: number;
};
export type Project = {
  id: string;
  name: string;
  createdAt: string;
  pageCount: number;
  concepts: Concept[];
  studies: Record<string, Study>;
  version: number;
  mode: "demo" | "live";
};
export function newStudy(conceptId: string, attempt = 1): Study {
  return {
    conceptId,
    first: "",
    final: "",
    turns: [],
    phase: "explain",
    draft: "",
    hints: [],
    evidenceViews: [],
    attempt,
  };
}

export const appConfigurationSchema = z.object({
  ai: z.enum(["live", "demo"]),
  provider: z.literal("gemini"),
  demoAllowed: z.boolean(),
  readiness: z.object({
    gemini: z.boolean(),
    authentication: z.boolean(),
    storage: z.boolean(),
  }),
});
export type AppConfiguration = z.infer<typeof appConfigurationSchema>;
export type LearningMode = "demo" | "live";
