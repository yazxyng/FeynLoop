import { z } from "zod";
import { newPasswordSchema } from "./account-types";

export const profileInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("nickname"),
      nickname: z
        .string()
        .trim()
        .min(1, "닉네임을 입력해 주세요.")
        .max(24, "닉네임은 24자 이하로 입력해 주세요."),
    })
    .strict(),
  z
    .object({ action: z.literal("plan"), preference: z.enum(["free", "plus"]) })
    .strict(),
  z
    .object({
      action: z.literal("password"),
      currentPassword: z.string().min(1).max(128),
      password: newPasswordSchema,
    })
    .strict(),
]);
export type LearningDays = Record<string, number>;
export type AccountProfile = {
  user: { id: string; username: string; nickname: string; createdAt: string };
  plan: {
    current: "free";
    preference: "free" | "plus";
    billingAvailable: false;
  };
  learning: {
    days: LearningDays;
    today: string;
    currentStreak: number;
    longestStreak: number;
    totalDays: number;
    completedStudies: number;
    totalMessages: number;
  };
};
