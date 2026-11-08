import type { Concept } from "../types";
import type { PrivateStudy } from "./models";

export function normalizeDialogue(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** '모르는 부분을 확인한다' 같은 개념 설명을 도움 요청으로 오인하지 않습니다. */
export function needsSmallerStep(answer: string) {
  return /(?:잘\s*)?모르겠|잘\s*몰라|모르[겠어요습니]|이해(?:가|를)?\s*(?:안\s*돼|안\s*되|못)|헷갈(?:려|리)|어려(?:워|워요)|(?:^|\s)몰라(?:요|[.!?\s]|$)|막혔|힌트(?:를)?\s*(?:줘|주세요)|무슨\s*(?:뜻|말)/u.test(
    answer,
  );
}

// 문장 부호만 달리한 재질문도 같은 질문으로 봅니다. 의미가 비슷하다고 추정하지는 않습니다.
export function sameQuestion(left: string, right: string) {
  const key = (text: string) =>
    normalizeDialogue(text)
      .toLowerCase()
      // 수식의 +, -, =, < 같은 기호는 질문의 의미를 바꾸므로 보존합니다.
      .replace(/[\s“”‘’「」『』"'«»？?！!。.,，;；:：]/gu, "");
  return Boolean(key(left)) && key(left) === key(right);
}

export function learningContext(
  concept: Concept,
  study: PrivateStudy,
  answer: string,
) {
  const previous = study.assessment;
  return {
    learningGoal: concept.description,
    focusPages: concept.pages,
    previousAssessment: previous
      ? {
          confirmedUnderstanding: previous.understood,
          explicitErrors: previous.errors,
          notYetExplained: previous.missing,
          unverified: previous.unverified,
        }
      : null,
    firstAssessment: study.firstAssessment,
    questionMode: needsSmallerStep(answer) ? "small_step" : "probe",
    responsePolicy:
      "직전 질문에 답한 부분을 먼저 확인하고, 해결되지 않은 한 지점만 다음 질문으로 선택한다. 이전 평가는 확정 답안이 아니며 최신 답변에 따라 갱신한다.",
  };
}

/** 모델 질문을 사용할 수 없을 때도 직전 답변과 질문에 연결하며 사실을 만들어 내지 않습니다. */
export function fallbackDialogue(
  concept: Concept,
  study: PrivateStudy,
  answer: string,
) {
  const normalized = normalizeDialogue(answer);
  const anchor = normalized.split(/(?<=[.!?。！？])\s/u)[0].slice(0, 60);
  const previousQuestion = study.turns.at(-1)?.question;
  const small = needsSmallerStep(answer);
  const candidates = small
    ? previousQuestion
      ? [
          "방금 질문에서 뜻이 헷갈리는 말 하나만 골라 줄래?",
          "방금 질문의 상황에서 네가 확실히 아는 부분 하나만 말해 줄래?",
          "지금은 답을 완성하지 않아도 돼. 방금 질문을 네 말로 어떻게 이해했어?",
        ]
      : [
          `${concept.title}에서 들어 본 말이나 기억나는 예 하나만 떠올려 볼까?`,
          `${concept.title}이라는 말을 어디서 접했는지 한 가지만 말해 줄래?`,
        ]
    : [
        `“${anchor}”라고 했는데, 그 과정이 어떻게 일어나는지 한 단계만 더 설명해 줄래?`,
        `“${anchor}”라는 생각을 뒷받침하는 이유 하나는 뭘까?`,
        `“${anchor}”라는 설명이 성립하려면 어떤 조건이 필요할까?`,
      ];
  const question =
    candidates.find(
      (candidate) =>
        !study.turns.some((turn) => sameQuestion(turn.question, candidate)),
    ) || "지금까지 설명한 내용에서 아직 확신이 없는 부분 하나를 골라 줄래?";
  return {
    question,
    hints: small
      ? [
          "직전 질문에서 이해한 말과 낯선 말을 먼저 나눠 봐.",
          "낯선 말 하나를 골라, 어떤 뜻으로 받아들였는지만 말해 봐.",
        ]
      : [
          "방금 말한 부분에서 먼저 일어나는 일 하나를 골라 봐.",
          "그 일 다음에 무엇이 이어지는지, 네 설명의 표현으로 연결해 봐.",
        ],
  };
}

export function scaffoldHints(question: string): [string, string] {
  if (/뜻|표현|무슨\s*말/u.test(question))
    return [
      "질문에 나온 말 하나를 일상에서 쓰는 말로 바꿔 봐.",
      "그 말을 어떤 상황에서 쓰는지 하나만 떠올려 봐.",
    ];
  if (/조건|달라|바뀌|변하/u.test(question))
    return [
      "질문에서 바뀌는 조건과 그대로인 조건을 나눠 봐.",
      "한 조건만 바꿨을 때 네가 예상한 결과를 한 문장으로 말해 봐.",
    ];
  if (/왜|이유|필요/u.test(question))
    return [
      "네 설명에서 결과 바로 앞에 일어나는 일 하나를 찾아 봐.",
      "그 일이 없을 때도 같은 결과가 나올지 생각해 봐.",
    ];
  return [
    "질문 속 상황에서 먼저 일어나는 일 하나를 골라 봐.",
    "그 일 다음에 무엇이 이어질지 네 말로 연결해 봐.",
  ];
}
