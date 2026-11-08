"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

type PlanPreference = "free" | "plus";
type Props = {
  preference: PlanPreference;
  busy: boolean;
  disabled: boolean;
  waiting: string;
  onSave: (plan: PlanPreference) => void;
};

// 결제 연동 전에는 관심 선택만 저장합니다. 실제 이용 요금제는 Free입니다.
export default function ProfilePlans({
  preference,
  busy,
  disabled,
  waiting,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<PlanPreference>(preference);
  useEffect(() => setSelected(preference), [preference]);
  return (
    <section
      className="profile-card profile-plans"
      aria-labelledby="plan-title"
    >
      <div className="profile-section-title">
        <h2 id="plan-title">나에게 맞는 요금제</h2>
        <span className="profile-period">현재 무료</span>
      </div>
      <p>
        플러스는 출시 준비 중이에요. 관심 요금제를 저장할 수 있으며, 결제나 이용
        권한 변경은 발생하지 않아요.
      </p>
      <fieldset className="plan-options">
        <legend className="sr-only">관심 요금제</legend>
        <label
          className={`plan-option ${selected === "free" ? "selected" : ""}`}
        >
          <input
            className="sr-only"
            type="radio"
            name="plan-preference"
            value="free"
            checked={selected === "free"}
            disabled={busy}
            onChange={() => setSelected("free")}
          />
          <span>
            FREE <small>현재 이용 중</small>
          </span>
          <strong>무료</strong>
          <p>현재 제공되는 PDF 학습과 학습 기록</p>
        </label>
        <label
          className={`plan-option ${selected === "plus" ? "selected" : ""}`}
        >
          <input
            className="sr-only"
            type="radio"
            name="plan-preference"
            value="plus"
            checked={selected === "plus"}
            disabled={busy}
            onChange={() => setSelected("plus")}
          />
          <span>
            PLUS <small>출시 준비 중</small>
          </span>
          <strong>가격 미정</strong>
          <p>상세 혜택과 가격은 출시 시 안내해요</p>
        </label>
      </fieldset>
      <Button
        disabled={disabled || selected === preference}
        onClick={() => onSave(selected)}
      >
        {waiting ||
          (selected === preference ? "선택 저장됨" : "관심 요금제 저장")}
      </Button>
    </section>
  );
}
