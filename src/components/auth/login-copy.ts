// 로그인 화면의 제목·설명·버튼 문구는 이 파일에서 수정하세요.
export type LoginStep = "login" | "signup" | "confirm" | "reset" | "update";

export const LOGIN_COPY: Record<
  LoginStep,
  { title: string; description: string; submitLabel: string }
> = {
  login: {
    title: "다시 만나 반가워요",
    description:
      "이메일과 비밀번호로 로그인하세요. 이 브라우저에서는 로그인 상태가 유지돼요.",
    submitLabel: "로그인",
  },
  signup: {
    title: "나만의 학습 공간 만들기",
    description:
      "처음 한 번 이메일을 확인하면, 다음부터는 비밀번호로 로그인해요.",
    submitLabel: "회원가입",
  },
  confirm: {
    title: "이메일을 확인해 주세요",
    description: "{email} 메일의 인증번호를 입력해 주세요.",
    submitLabel: "인증하고 시작하기",
  },
  reset: {
    title: "비밀번호 재설정",
    description:
      "전에 인증번호로 가입했어도 같은 이메일로 비밀번호를 만들 수 있어요. 기존 학습 기록은 그대로 유지돼요.",
    submitLabel: "비밀번호 설정 메일 받기",
  },
  update: {
    title: "새 비밀번호를 정해 주세요",
    description:
      "다음부터는 메일을 받지 않고 이 비밀번호로 로그인할 수 있어요.",
    submitLabel: "비밀번호 저장",
  },
};

export const LOGIN_LINKS = {
  reset: "비밀번호 재설정하기",
  signup: "회원가입",
  login: "로그인으로 돌아가기",
  close: "학습 공간으로 돌아가기",
};

export const RESET_COOLDOWN_SECONDS = 60;
