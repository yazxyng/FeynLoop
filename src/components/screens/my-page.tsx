"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Flame,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { errorRequestId as diagnosticId } from "@/lib/request-error";
import type { AccountProfile } from "@/lib/profile-types";
import { profileRequest, importLegacyRecords } from "@/lib/profile-client";
import { AccountRequestError } from "@/lib/account-client";
import { Button } from "../ui/button";
import PasswordField from "../auth/password-field";
import LearningHeatmap from "./learning-heatmap";
import InlineFeedback from "../inline-feedback";
import ProfilePlans from "./profile-plans";

type Props = {
  signedIn: boolean;
  onLogin: () => void;
  onLogout: () => Promise<void>;
  onImported: () => void;
};
type Panel = "nickname" | "password" | "plans" | null;
export default function MyPage({
  signedIn,
  onLogin,
  onLogout,
  onImported,
}: Props) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setErrorText] = useState("");
  const [errorRequestId, setErrorRequestId] = useState<string>();
  function setError(message: string) {
    setErrorText(message);
    setErrorRequestId(undefined);
  }
  function reportError(error: unknown, fallback: string) {
    setErrorText(error instanceof Error ? error.message : fallback);
    setErrorRequestId(diagnosticId(error));
  }
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now);
  const locked = useRef(false);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function loadProfile() {
    const result = await profileRequest();
    if (!result.profile) throw new Error("계정 정보를 확인하지 못했습니다.");
    setProfile(result.profile);
    setNickname(result.profile.user.nickname);
  }
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError("");
    setNotice("");
    setPanel(null);
    if (!signedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    profileRequest()
      .then(({ profile: next }) => {
        if (active && next) {
          setProfile(next);
          setNickname(next.user.nickname);
        }
      })
      .catch((error) => {
        if (active) reportError(error, "계정 정보를 불러오지 못했어요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  function togglePanel(next: Panel) {
    setPanel(panel === next ? null : next);
    setError("");
    setNotice("");
    setCurrentPassword("");
    setPassword("");
    setConfirmation("");
    setPasswordVisible(false);
  }
  async function run(task: () => Promise<void>, ignoreCooldown = false) {
    if (locked.current || (!ignoreCooldown && retrySeconds > 0)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (error) {
      reportError(error, "변경을 저장하지 못했어요.");
      if (error instanceof AccountRequestError && error.retryAfter) {
        setRetryAt(Date.now() + error.retryAfter * 1000);
        setNow(Date.now());
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || retrySeconds > 0;
  const waiting = retrySeconds > 0 ? `${retrySeconds}초 후 다시 시도` : "";
  const feedback = (
    <InlineFeedback
      error={error}
      requestId={errorRequestId}
      notice={notice}
      onDismiss={() => {
        setError("");
        setNotice("");
      }}
    />
  );
  return (
    <div className="my-page">
      <div className="my-page-title">
        <h1>마이페이지</h1>
        <p>조금씩 쌓인 설명이, 나의 배움이 돼요.</p>
      </div>
      {!signedIn ? (
        <section className="profile-card profile-signin">
          <div className="profile-avatar">
            <UserRound size={32} />
          </div>
          <h2>나의 배움을 모아 보세요</h2>
          <p>로그인하면 연속 학습일과 잔디, 계정 정보를 확인할 수 있어요.</p>
          <Button onClick={onLogin}>로그인 · 회원가입</Button>
        </section>
      ) : loading ? (
        <div className="profile-loading" role="status">
          <Loader2 className="spin" size={20} />내 학습 기록을 불러오고 있어요.
        </div>
      ) : !profile ? (
        <section className="profile-card profile-unavailable">
          {feedback}
          <h2>계정 정보를 불러오지 못했어요</h2>
          <p>연결과 마이페이지 설정을 확인한 뒤 다시 시도해 주세요.</p>
          <Button disabled={busy} onClick={() => void run(loadProfile)}>
            다시 불러오기
          </Button>
        </section>
      ) : (
        <>
          <section className="profile-card profile-hero">
            <div className="profile-person">
              <div className="profile-avatar" aria-hidden="true">
                {profile.user.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div className="profile-person-name">
                <div>
                  <h2>{profile.user.nickname}</h2>
                  <span className="profile-free-badge">FREE</span>
                </div>
                <p>@{profile.user.username}</p>
                <small>
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(profile.user.createdAt))}{" "}
                  가입
                </small>
              </div>
              <button
                className="profile-edit-link"
                disabled={busy}
                onClick={() => togglePanel("nickname")}
              >
                프로필 수정
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="profile-stats">
              <div>
                <strong>
                  <Flame size={22} />
                  {profile.learning.currentStreak}
                  <small>일</small>
                </strong>
                <span>연속 학습</span>
              </div>
              <div>
                <strong>
                  {profile.learning.completedStudies}
                  <small>회</small>
                </strong>
                <span>완료한 학습</span>
              </div>
            </div>
          </section>
          {panel === "nickname" && (
            <section className="profile-card profile-editor">
              <div className="profile-section-title">
                <h2>프로필 수정</h2>
                <button
                  aria-label="프로필 수정 닫기"
                  onClick={() => togglePanel(null)}
                  disabled={busy}
                >
                  <X size={18} />
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await profileRequest({ action: "nickname", nickname });
                    await loadProfile();
                    setPanel(null);
                    setNotice("닉네임을 저장했어요.");
                  });
                }}
              >
                <label htmlFor="profile-id">아이디</label>
                <input id="profile-id" value={profile.user.username} readOnly />
                <small>로그인 아이디는 변경할 수 없어요.</small>
                <label htmlFor="profile-nickname">닉네임</label>
                <input
                  id="profile-nickname"
                  autoFocus
                  required
                  maxLength={24}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  disabled={busy}
                />
                <Button disabled={disabled}>
                  {waiting || (busy ? "저장 중…" : "프로필 저장")}
                </Button>
                {feedback}
              </form>
            </section>
          )}
          <LearningHeatmap learning={profile.learning} />
          <div className="profile-mini-stats">
            <span>
              총 <strong>{profile.learning.totalDays}일</strong> 학습했어요
            </span>
            <span>
              최장 연속 <strong>{profile.learning.longestStreak}일</strong>
            </span>
          </div>
          <section
            className="profile-card profile-settings"
            aria-labelledby="profile-settings-title"
          >
            <h2 id="profile-settings-title">계정 설정</h2>
            <button
              className="profile-setting-row"
              disabled={busy}
              onClick={() => togglePanel("nickname")}
            >
              <span className="profile-setting-icon">
                <UserRound size={21} />
              </span>
              <span>
                <strong>계정 정보</strong>
                <small>아이디 · 닉네임 수정</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <button
              className="profile-setting-row"
              disabled={busy}
              onClick={() => togglePanel("password")}
              aria-expanded={panel === "password"}
            >
              <span className="profile-setting-icon">
                <KeyRound size={21} />
              </span>
              <span>
                <strong>비밀번호 변경</strong>
                <small>현재 비밀번호로 안전하게 변경해요</small>
              </span>
              <ChevronRight size={20} />
            </button>
            {panel === "password" && (
              <div className="profile-inline-panel">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      if (password !== confirmation)
                        throw new Error("새 비밀번호가 서로 달라요.");
                      await profileRequest({
                        action: "password",
                        currentPassword,
                        password,
                      });
                      setCurrentPassword("");
                      setPassword("");
                      setConfirmation("");
                      setPanel(null);
                      setNotice(
                        "비밀번호를 변경했어요. 다른 기기의 로그인은 해제됩니다.",
                      );
                    });
                  }}
                >
                  <PasswordField
                    id="profile-current-password"
                    label="현재 비밀번호"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    isVisible={passwordVisible}
                    isDisabled={busy}
                    isNewPassword={false}
                    placeholder="현재 비밀번호"
                    onToggleVisibility={() =>
                      setPasswordVisible(!passwordVisible)
                    }
                  />
                  <PasswordField
                    id="profile-new-password"
                    label="새 비밀번호"
                    value={password}
                    onChange={setPassword}
                    isVisible={passwordVisible}
                    isDisabled={busy}
                    isNewPassword
                    placeholder="8자 이상 입력해 주세요"
                  />
                  <PasswordField
                    id="profile-confirmation"
                    label="새 비밀번호 확인"
                    value={confirmation}
                    onChange={setConfirmation}
                    isVisible={passwordVisible}
                    isDisabled={busy}
                    isNewPassword
                    placeholder="한 번 더 입력해 주세요"
                  />
                  <Button disabled={disabled}>
                    {waiting || "비밀번호 변경하기"}
                  </Button>
                  <small>
                    복구코드는 그대로 유지돼요. 현재 비밀번호를 잊었다면 로그인
                    화면에서 복구코드로 재설정할 수 있어요.
                  </small>
                  {feedback}
                </form>
              </div>
            )}
            <button
              className="profile-setting-row"
              disabled={busy}
              onClick={() => togglePanel("plans")}
              aria-expanded={panel === "plans"}
            >
              <span className="profile-setting-icon">
                <Sparkles size={21} />
              </span>
              <span>
                <strong>요금제</strong>
                <small>현재 무료 이용 중 · 플러스 출시 준비 중</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <button
              className="profile-setting-row"
              disabled={disabled}
              onClick={() =>
                void run(async () => {
                  const count = await importLegacyRecords();
                  await loadProfile();
                  onImported();
                  setNotice(`${count}개의 이전 학습 기록을 가져왔어요.`);
                })
              }
            >
              <span className="profile-setting-icon">
                <Layers size={21} />
              </span>
              <span>
                <strong>이전 학습 기록 가져오기</strong>
                <small>이 브라우저의 이전 이메일 계정 확인</small>
              </span>
              <ChevronRight size={20} />
            </button>
          </section>
          {panel === "plans" && (
            <ProfilePlans
              preference={profile.plan.preference}
              busy={busy}
              disabled={disabled}
              waiting={waiting}
              onSave={(preference) =>
                void run(async () => {
                  await profileRequest({ action: "plan", preference });
                  await loadProfile();
                  setNotice(
                    "관심 요금제를 저장했어요. 현재 이용 요금제는 무료로 유지돼요.",
                  );
                })
              }
            />
          )}
          {(!panel || panel === "plans") && feedback}
          <button
            className="profile-logout"
            disabled={busy}
            onClick={() => void run(onLogout, true)}
          >
            <LogOut size={18} />
            로그아웃
          </button>
          <div className="profile-security-note">
            <ShieldCheck size={14} />
            학습 기록은 로그인한 내 계정에 저장돼요.
          </div>
        </>
      )}
    </div>
  );
}
