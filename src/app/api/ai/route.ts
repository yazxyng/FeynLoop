import { json } from "@/lib/server/http";
// 클라이언트가 원문·평가 이력을 임의로 제출하던 이전 API는 더 이상 허용하지 않습니다.
export async function POST() {
  return json({ error: "학습 프로젝트 API를 사용해 주세요." }, undefined, 410);
}
