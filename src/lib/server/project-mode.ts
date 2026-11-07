import type { LearningMode } from "../types";
import type { Identity } from "./http";
import { ApiError } from "./errors";
import { geminiConfigured } from "./gemini";
/** 실제 AI는 새 프로젝트 생성 시 사용자가 선택한 경우에만 활성화합니다. */
export function projectMode(
  identity: Identity,
  requested: LearningMode = "demo",
): LearningMode {
  if (requested === "demo") return "demo";
  if (!identity.userId)
    throw new ApiError(401, "실제 Gemini 학습은 로그인 후 사용할 수 있습니다.");
  if (!geminiConfigured())
    throw new ApiError(
      503,
      "Gemini API 키 설정을 확인해 주세요. 데모로 자동 전환하지 않았습니다.",
    );
  return "live";
}
