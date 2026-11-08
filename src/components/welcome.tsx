"use client";
import Link from "next/link";
import { ArrowRight, FileText, MessageCircle, Sparkles } from "lucide-react";
import { useWorkspace } from "./workspace-provider";

const steps = [
  {
    icon: FileText,
    title: "공부한 자료를 넣고",
    text: "PDF나 3,000자 이내의 텍스트에서 설명할 개념을 골라요.",
  },
  {
    icon: MessageCircle,
    title: "내 말로 설명하고",
    text: "원문은 잠시 덮고, 처음 배우는 친구에게 말하듯 설명해요.",
  },
  {
    icon: Sparkles,
    title: "질문하며 이해해요",
    text: "AI 짝꿍의 질문에 답하고 다시 설명하며 배움을 정리해요.",
  },
];

export default function Welcome() {
  const { enterDemo, configuration } = useWorkspace();
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <Link href="/" className="brand">
          <span className="loop-symbol" />
          <strong>FeynLoop</strong>
        </Link>
        <Link href="/login" className="welcome-login">
          로그인 <ArrowRight size={16} />
        </Link>
      </header>
      <section className="welcome-hero">
        <span className="welcome-eyebrow">설명할수록 선명해지는 배움</span>
        <h1>
          읽어서 아는 것에서,
          <br />
          <span>설명할 수 있는 것으로.</span>
        </h1>
        <p>
          자료를 올리고 내 말로 설명하면
          <br />
          AI 짝꿍이 질문하며 이해를 도와줘요.
        </p>
        <Link href="/login" className="welcome-start">
          내 학습 시작하기 <ArrowRight size={21} />
        </Link>
        {configuration?.demoAllowed && (
          <button className="welcome-demo" onClick={enterDemo}>
            가입 전에 데모로 둘러보기
          </button>
        )}
      </section>
      <section className="welcome-steps" aria-label="FeynLoop 학습 방법">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <article key={title}>
            <div>
              <Icon size={22} />
              <span>0{index + 1}</span>
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <footer className="welcome-footer">
        정답을 읽는 대신, 나의 설명에서 시작해 보세요.
      </footer>
    </main>
  );
}
