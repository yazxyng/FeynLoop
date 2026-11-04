import { z } from "zod";
export const conceptSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(150),
  description: z.string().max(600),
  pages: z.array(z.number().int().positive()).min(1),
  importance: z.enum(["높음", "보통"]),
  order: z.number().int().positive(),
});
export const feedbackSchema = z.object({
  understood: z.array(z.string()),
  improve: z.array(z.string()),
  unverified: z.array(z.string()),
  question: z.string(),
  hint: z.string(),
});
export type Concept = z.infer<typeof conceptSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Turn = { question: string; answer: string };
export type Study = {
  conceptId: string;
  first: string;
  final: string;
  turns: Turn[];
  feedback?: Feedback;
  result?: Feedback;
  phase: "explain" | "questions" | "rewrite" | "done";
  draft: string;
};
export type Project = {
  id: string;
  name: string;
  createdAt: string;
  pages: { number: number; text: string }[];
  concepts: Concept[];
  studies: Record<string, Study>;
  filePath?: string;
};
