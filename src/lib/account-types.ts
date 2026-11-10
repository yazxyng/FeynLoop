import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{3,23}$/,
    "아이디는 영문자로 시작하는 영문·숫자·밑줄 4~24자로 입력해 주세요.",
  );
export const newPasswordSchema = z
  .string()
  .min(8, "비밀번호는 8자 이상으로 입력해 주세요.")
  .max(128, "비밀번호는 128자 이하로 입력해 주세요.");
export const accountInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("signup"),
      username: usernameSchema,
      password: newPasswordSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("login"),
      username: usernameSchema,
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("recover"),
      username: usernameSchema,
      password: newPasswordSchema,
      recoveryCode: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);
export const accountUserSchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
});
export type AccountUser = z.infer<typeof accountUserSchema>;
