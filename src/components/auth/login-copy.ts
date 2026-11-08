// 로그인 화면의 문구와 아이디 규칙 안내는 이 파일에서 수정합니다.
export type LoginStep = "login" | "signup" | "recover";
export const LOGIN_COPY: Record<
  LoginStep,
  { title: string; description: string; submitLabel: string }
> = {
  login: {
    title: "다시 만나 반가워요",
    description:
      "아이디와 비밀번호로 바로 로그인하세요. 메일 인증은 필요 없어요.",
    submitLabel: "로그인",
  },
  signup: {
    title: "나만의 학습 공간 만들기",
    description: "아이디와 비밀번호만 정하면 바로 시작할 수 있어요.",
    submitLabel: "회원가입",
  },
  recover: {
    title: "비밀번호 재설정",
    description: "가입할 때 보관한 복구코드로 새 비밀번호를 설정해 주세요.",
    submitLabel: "비밀번호 재설정하기",
  },
};
export const USERNAME_HELP =
  "영문자로 시작 · 영문 소문자, 숫자, 밑줄(_) · 4~24자";
export const LOGIN_LINKS = {
  reset: "비밀번호 재설정하기",
  signup: "회원가입",
  login: "로그인으로 돌아가기",
  close: "학습 공간으로 돌아가기",
};
