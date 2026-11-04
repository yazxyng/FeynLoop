"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
  Lightbulb,
  Leaf,
} from "lucide-react";
import { Button } from "./ui/button";
import { sample } from "@/lib/demo";
import { extractPdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";
import type { Concept, Feedback, Project, Study } from "@/lib/types";
type View = "dashboard" | "concepts" | "study" | "result";
const newStudy = (id: string): Study => ({
  conceptId: id,
  first: "",
  final: "",
  turns: [],
  phase: "explain",
  draft: "",
});
export default function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]),
    [ready, setReady] = useState(false),
    [view, setView] = useState<View>("dashboard"),
    [projectId, setProjectId] = useState(""),
    [conceptId, setConceptId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("editor"),
    [page, setPage] = useState(1),
    [hint, setHint] = useState(false),
    [email, setEmail] = useState(""),
    [userId, setUserId] = useState<string | null>(null),
    [aiMode, setAiMode] = useState("demo"),
    [authOpen, setAuthOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === projectId),
    concept = project?.concepts.find((c) => c.id === conceptId),
    study = project?.studies[conceptId] || newStudy(conceptId);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setAiMode(d.ai))
      .catch(() => {});
    let active = true;
    const load = async (id: string | null) => {
      setReady(false);
      setView("dashboard");
      setUserId(id);
      try {
        if (id && supabase) {
          const { data, error } = await supabase
            .from("projects")
            .select("data")
            .order("updated_at", { ascending: false });
          if (error) throw error;
          if (active) setProjects((data || []).map((r) => r.data as Project));
        } else {
          const saved = localStorage.getItem("feynloop-v1");
          if (active) setProjects(saved ? JSON.parse(saved) : []);
        }
      } catch {
        if (active) {
          setProjects([]);
          setError(
            "기록을 불러오지 못했습니다. 새로고침하여 다시 시도해 주세요.",
          );
        }
      } finally {
        if (active) setReady(true);
      }
    };
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        void load(session?.user.id || null);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    }
    void load(null);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || userId) return;
    try {
      localStorage.setItem("feynloop-v1", JSON.stringify(projects));
    } catch {
      setError(
        "브라우저 저장 공간이 부족합니다. 기록을 내보내거나 더 작은 PDF를 사용해 주세요.",
      );
    }
  }, [projects, ready, userId]);
  async function persist(p: Project, file?: File) {
    if (!userId || !supabase) return;
    let path = p.filePath;
    if (file) {
      path = `${userId}/${p.id}.pdf`;
      const { error } = await supabase.storage
        .from("pdfs")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      p.filePath = path;
    }
    const { error } = await supabase
      .from("projects")
      .upsert({
        id: p.id,
        user_id: userId,
        data: p,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
  }
  async function saveProject(p: Project, file?: File) {
    await persist(p, file);
    setProjects((prev) =>
      prev.some((v) => v.id === p.id)
        ? prev.map((v) => (v.id === p.id ? p : v))
        : [p, ...prev],
    );
  }
  function patchStudy(next: Study) {
    if (!project) return;
    const p = {
      ...project,
      studies: { ...project.studies, [conceptId]: next },
    };
    setProjects((prev) => prev.map((v) => (v.id === p.id ? p : v)));
  }
  async function api(payload: unknown) {
    const session = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function open(p: Project) {
    setProjectId(p.id);
    setView("concepts");
    setPage(1);
  }
  async function upload(file: File) {
    await run(async () => {
      const pages = await extractPdf(file);
      const data = await api({ action: "concepts", pages });
      const p: Project = {
        id: crypto.randomUUID(),
        name: file.name,
        pages,
        concepts: data.concepts,
        studies: {},
        createdAt: new Date().toISOString(),
      };
      await saveProject(p, file);
      open(p);
      setNotice(
        data.mode === "demo"
          ? "데모: 문장에서 후보를 만들었습니다. 개념을 검토·수정해 주세요."
          : "문서 분석을 마쳤습니다. 학습할 개념을 선택해 주세요.",
      );
    });
  }
  function start(c: Concept) {
    setConceptId(c.id);
    setPage(c.pages[0]);
    setHint(false);
    setTab("editor");
    setView(project?.studies[c.id]?.phase === "done" ? "result" : "study");
  }
  async function submit() {
    if (!project || !concept || !study.draft.trim()) return;
    await run(async () => {
      const isAnswer = study.phase === "questions";
      const turns = isAnswer
        ? [
            ...study.turns,
            { question: study.feedback?.question || "", answer: study.draft },
          ]
        : study.turns;
      const final = study.phase === "rewrite";
      const data = await api({
        action: "feedback",
        pages: project.pages,
        concept,
        explanation: final ? study.draft : study.first || study.draft,
        turns,
        final,
        initialExplanation: study.first || study.draft,
      });
      const next: Study = {
        ...study,
        first: study.first || study.draft,
        final: final ? study.draft : study.final,
        turns,
        draft: "",
        feedback: data.feedback,
        phase: final
          ? "done"
          : isAnswer && turns.length >= 3
            ? "rewrite"
            : "questions",
        ...(final ? { result: data.feedback } : {}),
      };
      await saveProject({
        ...project,
        studies: { ...project.studies, [conceptId]: next },
      });
      setHint(false);
      setTab("chat");
      if (final) setView("result");
      else if (next.phase === "rewrite") setTab("editor");
    });
  }
  const completed = projects.reduce(
      (sum, p) =>
        sum + Object.values(p.studies).filter((s) => s.phase === "done").length,
      0,
    ),
    total = projects.reduce((sum, p) => sum + p.concepts.length, 0);
  const ongoing = projects
    .flatMap((p) =>
      Object.values(p.studies)
        .filter((s) => s.phase !== "done")
        .map((s) => ({
          p,
          s,
          c: p.concepts.find((c) => c.id === s.conceptId),
        })),
    )
    .find((v) => v.c);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="FeynLoop 홈">
          <span className="brand-icon">
            f<span>↻</span>
          </span>
          FeynLoop<span className="brand-dot">.</span>
        </a>
        <div className="workspace-name">
          <span className="avatar">나</span>
          <div>
            나의 학습 공간<small>Personal workspace</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard size={18} />
            대시보드
          </button>
          <button
            className={view !== "dashboard" ? "active" : ""}
            onClick={() => {
              setView("dashboard");
              setTimeout(
                () =>
                  document
                    .getElementById("projects")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
          >
            <FolderOpen size={18} />내 학습 프로젝트
            <span>{projects.length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Leaf size={20} />
          </div>
          <strong>배움은 설명에서 시작돼요.</strong>
          <p>
            어려운 개념도 나만의 언어로.
            <br />한 번의 설명이, 깊은 이해로.
          </p>
          <span>
            THE FEYNMAN TECHNIQUE <ArrowUpRight size={13} />
          </span>
        </div>
        <button
          className="account"
          onClick={() =>
            userId ? void supabase?.auth.signOut() : setAuthOpen(true)
          }
        >
          <span className="avatar">{userId ? "회" : "D"}</span>
          <div>
            {userId ? "내 계정" : "데모 학습자"}
            <small>
              {userId ? "클라우드 저장 사용 중" : "이 브라우저에 기록 저장"}
            </small>
          </div>
          {userId ? <LogOut size={15} /> : <ChevronRight size={15} />}
        </button>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            나의 학습 공간 <ChevronRight size={13} />{" "}
            {view === "dashboard"
              ? "대시보드"
              : view === "concepts"
                ? "개념 살펴보기"
                : view === "study"
                  ? "파인만 학습실"
                  : "학습 결과"}
          </span>
          <div>
            <span className="mode">
              <i />
              {aiMode === "demo" ? "DEMO MODE" : "AI CONNECTED"}
            </span>
            <span className="header-avatar">나</span>
          </div>
        </header>
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="오류 닫기">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="알림 닫기">
              <X size={16} />
            </button>
          </div>
        )}
        <input
          ref={uploadRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        {view === "dashboard" ? (
          <div className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">LEARN. EXPLAIN. UNDERSTAND.</p>
                <h1>
                  설명할수록, 선명해지는 배움<span>.</span>
                </h1>
                <p>오늘의 작은 설명이 내일의 단단한 이해가 됩니다.</p>
              </div>
              <Button
                disabled={busy || !ready}
                onClick={() => uploadRef.current?.click()}
              >
                <Plus size={17} />새 PDF 업로드
              </Button>
            </div>
            <section className="hero">
              <div className="hero-copy">
                <span className="pill">
                  <Sparkles size={13} /> 나만의 AI 파인만 학습 파트너
                </span>
                <h2>
                  읽는 것을 넘어,
                  <br />
                  <em>진짜 내 지식</em>으로.
                </h2>
                <p>
                  PDF 속 개념을 나의 언어로 설명해 보세요.
                  <br />
                  호기심 많은 AI 학생이 이해의 빈틈을 함께 찾아줘요.
                </p>
                <Button
                  onClick={() =>
                    void run(async () => {
                      const p = structuredClone(sample);
                      p.id = crypto.randomUUID();
                      p.createdAt = new Date().toISOString();
                      await saveProject(p);
                      open(p);
                      setNotice(
                        "예제 문서입니다. AI 키가 없으면 질문 흐름을 데모로 체험합니다.",
                      );
                    })
                  }
                  disabled={busy || !ready}
                >
                  예제 문서로 시작하기 <ArrowUpRight size={16} />
                </Button>
                <small>별도 설정 없이 학습 흐름을 경험해 보세요</small>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <span className="art-spark s1">✧</span>
                <span className="art-spark s2">✦</span>
                <div className="paper paper-back" />
                <div className="paper">
                  <span className="paper-label">MY UNDERSTANDING</span>
                  <div className="paper-title">나의 언어로 설명하기</div>
                  <div className="paper-line" />
                  <div className="paper-line short" />
                  <div className="diagram">
                    <span>개념</span>
                    <i>→</i>
                    <span>설명</span>
                    <i>→</i>
                    <span>이해</span>
                  </div>
                  <div className="paper-line" />
                  <div className="paper-line short" />
                  <span className="paper-check">
                    <Check size={17} /> 아, 이제 알겠어요!
                  </span>
                </div>
                <div className="floating-bubble">
                  <span>✳</span> 왜 그렇게 생각했나요?
                </div>
                <div className="floating-label">
                  <Lightbulb size={17} /> 설명하는 순간, 배움이 깊어져요
                </div>
              </div>
            </section>
            <div className="stats">
              <Stat
                label="학습 프로젝트"
                value={projects.length}
                unit="개"
                icon={<FolderOpen size={19} />}
              />
              <Stat
                label="발견한 개념"
                value={total}
                unit="개"
                icon={<BookOpen size={19} />}
              />
              <Stat
                label="설명을 마친 개념"
                value={completed}
                unit="개"
                icon={<GraduationCap size={19} />}
              />
              <Stat
                label="학습 진행률"
                value={total ? Math.round((completed / total) * 100) : 0}
                unit="%"
                icon={<Sparkles size={19} />}
              />
            </div>
            {ongoing && (
              <button
                className="resume"
                onClick={() => {
                  open(ongoing.p);
                  setConceptId(ongoing.s.conceptId);
                  setView("study");
                }}
              >
                <span className="resume-icon">
                  <MessageCircle size={22} />
                </span>
                <div>
                  <small>이어서 학습해 볼까요?</small>
                  <strong>{ongoing.c?.title}</strong>
                  <span>{ongoing.p.name}</span>
                </div>
                <span>
                  학습 이어하기 <ArrowRight size={16} />
                </span>
              </button>
            )}
            <section id="projects">
              <div className="section-heading">
                <div>
                  <h2>
                    내 학습 프로젝트 <span>{projects.length}</span>
                  </h2>
                  <p>문서 하나에서 시작되는, 나만의 지식 루프</p>
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="프로젝트 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="project-grid">
                {projects
                  .filter((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p, i) => {
                    const done = Object.values(p.studies).filter(
                      (s) => s.phase === "done",
                    ).length;
                    return (
                      <button
                        className="project-card"
                        key={p.id}
                        onClick={() => open(p)}
                      >
                        <div className="card-top">
                          <span className={`file-icon tone-${i % 3}`}>
                            <FileText size={23} />
                          </span>
                          <span className="card-status">
                            {done === p.concepts.length
                              ? "설명 완료"
                              : Object.keys(p.studies).length
                                ? "학습 중"
                                : "학습 준비"}
                          </span>
                        </div>
                        <h3>{p.name.replace(/\.pdf$/i, "")}</h3>
                        <p>
                          {p.pages.length}페이지 <span>·</span> 핵심 개념{" "}
                          {p.concepts.length}개
                        </p>
                        <div className="progress-label">
                          <span>학습 진행률</span>
                          <strong>
                            {Math.round((done / p.concepts.length) * 100)}%
                          </strong>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width: `${(done / p.concepts.length) * 100}%`,
                            }}
                          />
                        </div>
                        <footer>
                          <span>
                            {new Date(p.createdAt).toLocaleDateString("ko-KR")}{" "}
                            생성
                          </span>
                          <ArrowUpRight size={17} />
                        </footer>
                      </button>
                    );
                  })}
                <button
                  className="upload-card"
                  disabled={busy || !ready}
                  onClick={() => uploadRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!busy && e.dataTransfer.files[0])
                      void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <span>
                    <Plus size={23} />
                  </span>
                  <strong>
                    {busy ? "문서를 분석하고 있어요…" : "새로운 배움 시작하기"}
                  </strong>
                  <p>PDF를 끌어놓거나 클릭해 업로드하세요</p>
                  <small>PDF · 최대 20MB · 150페이지</small>
                </button>
              </div>
              {!ready && <p className="muted">학습 기록을 불러오는 중…</p>}
              {query &&
                !projects.some((p) =>
                  p.name.toLowerCase().includes(query.toLowerCase()),
                ) && <p className="muted">검색 결과가 없습니다.</p>}
            </section>
            <div className="bottom-note">
              <span>✳</span>
              <p>
                “쉽게 설명할 수 없다면, 충분히 이해한 것이 아닙니다.”
                <small>파인만 학습법에서 얻은 영감</small>
              </p>
              <span>한 번 더 설명하고, 한 걸음 더 이해해요.</span>
            </div>
          </div>
        ) : (
          project && (
            <div className="content inner-content">
              <button
                className="back"
                onClick={() =>
                  setView(view === "concepts" ? "dashboard" : "concepts")
                }
              >
                <ChevronLeft size={16} />
                {view === "concepts" ? "대시보드" : "개념 목록"}
              </button>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view === "concepts"
                      ? "YOUR LEARNING MAP"
                      : view === "study"
                        ? "THE FEYNMAN ROOM"
                        : "YOUR LEARNING REFLECTION"}
                  </p>
                  <h1>
                    {view === "concepts"
                      ? "배울 개념을 살펴보세요"
                      : view === "study"
                        ? concept?.title
                        : "설명으로 완성한 한 번의 루프"}
                  </h1>
                  <p>
                    {project.name} · {project.pages.length}페이지{" "}
                    {aiMode === "demo"
                      ? "· 데모 질문 / 의미 기반 평가 없음"
                      : ""}
                  </p>
                </div>
                {view === "concepts" && (
                  <span className="pill">
                    <BookOpen size={14} />
                    {project.concepts.length}개의 핵심 개념
                  </span>
                )}
              </div>
              {view === "concepts" ? (
                <>
                  <div className="info-box">
                    <Lightbulb size={19} />
                    <p>
                      추천 순서대로 하나씩 설명해 보세요. 개념 이름과 설명은
                      직접 수정할 수 있어요.
                      <br />
                      <small>
                        데모 분석은 문장 기반 후보입니다. 실제 AI 추출은
                        환경변수 설정과 로그인이 필요합니다.
                      </small>
                    </p>
                  </div>
                  <div className="concept-list">
                    {project.concepts.map((c, i) => (
                      <div className="concept-card" key={c.id}>
                        <span className="concept-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="concept-details">
                          <input
                            aria-label={`개념 ${i + 1} 이름`}
                            maxLength={150}
                            value={c.title}
                            onChange={(e) =>
                              setProjects((prev) =>
                                prev.map((p) =>
                                  p.id === project.id
                                    ? {
                                        ...p,
                                        concepts: p.concepts.map((v) =>
                                          v.id === c.id
                                            ? { ...v, title: e.target.value }
                                            : v,
                                        ),
                                      }
                                    : p,
                                ),
                              )
                            }
                            onBlur={() =>
                              void run(async () => {
                                if (!c.title.trim())
                                  throw new Error("개념 이름을 입력해 주세요.");
                                await persist(project);
                              })
                            }
                          />
                          <textarea
                            aria-label={`개념 ${i + 1} 설명`}
                            maxLength={600}
                            value={c.description}
                            onChange={(e) =>
                              setProjects((prev) =>
                                prev.map((p) =>
                                  p.id === project.id
                                    ? {
                                        ...p,
                                        concepts: p.concepts.map((v) =>
                                          v.id === c.id
                                            ? {
                                                ...v,
                                                description: e.target.value,
                                              }
                                            : v,
                                        ),
                                      }
                                    : p,
                                ),
                              )
                            }
                            onBlur={() => void run(() => persist(project))}
                          />
                          <div>
                            <span className="tag">중요도 {c.importance}</span>
                            <span className="muted">
                              근거 p.{c.pages.join(", ")}
                            </span>
                            {project.studies[c.id]?.phase === "done" && (
                              <span className="complete-tag">
                                <Check size={12} />
                                설명 완료
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          disabled={!c.title.trim() || busy}
                          onClick={() => start(c)}
                        >
                          {project.studies[c.id]?.phase === "done"
                            ? "결과 보기"
                            : project.studies[c.id]
                              ? "이어하기"
                              : "설명 시작"}
                          <ArrowRight size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : view === "study" && concept ? (
                <>
                  <div className="steps">
                    {["자유롭게 설명", "AI와 질문·답변", "처음부터 재설명"].map(
                      (label, i) => (
                        <span
                          className={
                            (study.phase === "explain"
                              ? 0
                              : study.phase === "questions"
                                ? 1
                                : 2) === i
                              ? "current"
                              : ""
                          }
                          key={label}
                        >
                          <b>{i + 1}</b>
                          {label}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="mobile-tabs">
                    {[
                      ["source", "원문"],
                      ["editor", "나의 설명"],
                      ["chat", "AI 학생"],
                    ].map(([key, label]) => (
                      <button
                        className={tab === key ? "selected" : ""}
                        key={key}
                        onClick={() => setTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="study-grid">
                    <section
                      className={`study-panel ${tab === "source" ? "mobile-visible" : ""}`}
                    >
                      <div className="panel-heading">
                        <FileText size={17} />
                        <strong>문서 원문</strong>
                        <span>텍스트 보기</span>
                      </div>
                      <div className="page-controls">
                        <button
                          aria-label="이전 페이지"
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          {page} / {project.pages.length}
                        </span>
                        <button
                          aria-label="다음 페이지"
                          disabled={page >= project.pages.length}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="source-text">
                        {project.pages.find((p) => p.number === page)?.text}
                      </div>
                      <div className="source-footer">
                        관련 페이지{" "}
                        {concept.pages.map((p) => (
                          <button key={p} onClick={() => setPage(p)}>
                            p.{p}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section
                      className={`study-panel editor-panel ${tab === "editor" ? "mobile-visible" : ""}`}
                    >
                      <div className="panel-heading">
                        <BookOpen size={17} />
                        <strong>
                          {study.phase === "questions"
                            ? "질문에 답하기"
                            : study.phase === "rewrite"
                              ? "다시 설명하기"
                              : "나의 첫 설명"}
                        </strong>
                        <span>
                          {userId ? "단계 제출 시 저장" : "자동 임시 저장"}
                        </span>
                      </div>
                      <div className="editor-intro">
                        <span className="tag">{concept.title}</span>
                        <h3>
                          {study.phase === "questions"
                            ? "생각을 한 단계 더 풀어볼까요?"
                            : study.phase === "rewrite"
                              ? "이제 처음부터 설명해 보세요."
                              : "처음 배우는 친구에게 설명하듯."}
                        </h3>
                        <p>
                          {study.phase === "questions"
                            ? study.feedback?.question
                            : "정의, 작동 원리, 나만의 예시를 편하게 적어보세요. 완벽하지 않아도 괜찮아요."}
                        </p>
                      </div>
                      <textarea
                        className="explanation"
                        aria-label="설명 작성"
                        maxLength={15000}
                        placeholder="제가 이해한 이 개념은…"
                        value={study.draft}
                        onChange={(e) =>
                          patchStudy({ ...study, draft: e.target.value })
                        }
                      />
                      <div className="editor-footer">
                        <span>
                          {study.draft.length.toLocaleString()} / 15,000자
                        </span>
                        <Button
                          disabled={busy || !study.draft.trim()}
                          onClick={() => void submit()}
                        >
                          {busy ? (
                            <Loader2 className="spin" size={15} />
                          ) : (
                            <ArrowRight size={15} />
                          )}{" "}
                          {study.phase === "rewrite"
                            ? "학습 결과 확인"
                            : study.phase === "questions"
                              ? "답변 보내기"
                              : "설명 마치기"}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await persist(project);
                            setNotice(
                              userId
                                ? "클라우드에 저장했습니다."
                                : "이 브라우저에 저장했습니다.",
                            );
                          })
                        }
                      >
                        저장하고 잠시 쉬기
                      </Button>
                    </section>
                    <section
                      className={`study-panel chat-panel ${tab === "chat" ? "mobile-visible" : ""}`}
                    >
                      <div className="panel-heading">
                        <span className="ai-icon">✳</span>
                        <strong>호기심 많은 AI 학생</strong>
                        <span>{study.turns.length} / 3 질문</span>
                      </div>
                      <div className="chat-body">
                        <div className="chat-message">
                          <strong>✳ 루프</strong>
                          <p>
                            안녕하세요! 저는 이 개념이 처음이에요. 설명해 주시면
                            궁금한 점을 하나씩 물어볼게요.
                          </p>
                        </div>
                        {study.first && (
                          <div className="chat-answer">
                            <small>나의 첫 설명</small>
                            <p>{study.first}</p>
                          </div>
                        )}
                        {study.turns.map((t, i) => (
                          <div key={i}>
                            <div className="chat-message">
                              <strong>질문 {i + 1}</strong>
                              <p>{t.question}</p>
                            </div>
                            <div className="chat-answer">
                              <p>{t.answer}</p>
                            </div>
                          </div>
                        ))}
                        {study.feedback && (
                          <>
                            <FeedbackView feedback={study.feedback} compact />
                            {study.phase === "questions" && (
                              <div className="chat-message">
                                <strong>✳ 질문 {study.turns.length + 1}</strong>
                                <p>{study.feedback.question}</p>
                                <button
                                  className="hint-button"
                                  onClick={() => setHint(!hint)}
                                >
                                  <Lightbulb size={14} />
                                  힌트 {hint ? "접기" : "보기"}
                                </button>
                                {hint && (
                                  <p className="hint">{study.feedback.hint}</p>
                                )}
                              </div>
                            )}
                            {study.phase === "rewrite" && (
                              <div className="chat-message">
                                <strong>이제 나의 언어로 한 번 더.</strong>
                                <p>
                                  세 번의 질문을 마쳤어요. 원문을 확인하고
                                  에디터에서 처음부터 다시 설명해 주세요.
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <small className="chat-disclaimer">
                        {aiMode === "demo"
                          ? "데모 질문입니다. 실제 이해도를 평가하지 않습니다."
                          : "AI 평가에는 오류가 있을 수 있어요. 원문 근거를 확인하세요."}
                      </small>
                    </section>
                  </div>
                </>
              ) : view === "result" && concept ? (
                <>
                  <div className="result-banner">
                    <span className="result-icon">
                      <Check size={28} />
                    </span>
                    <div>
                      <p className="eyebrow">ONE LOOP COMPLETE</p>
                      <h2>{concept.title}, 한 번 더 선명하게.</h2>
                      <p>
                        첫 설명과 마지막 설명을 비교하며 다음 배움을 준비하세요.
                      </p>
                    </div>
                    <Button onClick={() => setView("concepts")}>
                      다음 개념 살펴보기 <ArrowRight size={16} />
                    </Button>
                  </div>
                  <div className="comparison">
                    <section>
                      <span className="eyebrow">BEFORE</span>
                      <h3>처음의 설명</h3>
                      <p>{study.first}</p>
                    </section>
                    <section>
                      <span className="eyebrow">AFTER</span>
                      <h3>마지막 설명</h3>
                      <p>{study.final}</p>
                    </section>
                  </div>
                  {study.result && <FeedbackView feedback={study.result} />}
                  <div className="info-box">
                    <Lightbulb size={18} />
                    <p>
                      {aiMode === "demo"
                        ? "데모에서는 정확도나 이해 향상을 점수로 판정하지 않습니다. 결과는 설명 기록이며 의미 기반 평가 결과가 아닙니다."
                        : "미확인은 아직 설명에서 확인하지 못한 내용입니다. 이해하지 못했다는 뜻은 아닙니다."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        await saveProject({
                          ...project,
                          studies: {
                            ...project.studies,
                            [conceptId]: newStudy(conceptId),
                          },
                        });
                        setView("study");
                      })
                    }
                  >
                    이 개념 다시 연습하기
                  </Button>
                </>
              ) : null}
            </div>
          )
        )}
        {busy && (
          <div className="busy-indicator" role="status">
            <Loader2 size={16} className="spin" /> 처리 중입니다. 잠시만 기다려
            주세요.
          </div>
        )}
      </main>
      {authOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="계정 로그인"
          >
            <button
              className="modal-close"
              aria-label="닫기"
              onClick={() => setAuthOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="ai-icon">✳</span>
            <h2>배움을 안전하게 이어가세요</h2>
            <p>
              {supabase
                ? "이메일 로그인 후 프로젝트와 PDF를 내 계정에 저장합니다. 데모 기록은 브라우저에 따로 남습니다."
                : "Supabase 환경변수가 설정되지 않았습니다. 현재는 로그인 없이 브라우저 저장 방식으로 사용할 수 있습니다."}
            </p>
            {supabase && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const { error } = await supabase!.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: window.location.origin },
                    });
                    if (error) throw error;
                    setNotice("이메일로 로그인 링크를 보냈습니다.");
                    setAuthOpen(false);
                  });
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="이메일 주소"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button disabled={busy}>로그인 링크 받기</Button>
              </form>
            )}
            <Button variant="ghost" onClick={() => setAuthOpen(false)}>
              학습 공간으로 돌아가기
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>
          {value}
          <small>{unit}</small>
        </strong>
      </div>
    </div>
  );
}
function FeedbackView({
  feedback,
  compact = false,
}: {
  feedback: Feedback;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "feedback compact" : "feedback"}>
      {[
        ["확인된 이해", feedback.understood, "green"],
        ["보완할 요소", feedback.improve, "amber"],
        ["아직 미확인", feedback.unverified, "gray"],
      ].map(([title, items, color]) => (
        <section className={`feedback-section ${color}`} key={String(title)}>
          <h3>
            <span /> {String(title)}
          </h3>
          <ul>
            {(items as string[]).length ? (
              (items as string[]).map((item, i) => <li key={i}>{item}</li>)
            ) : (
              <li>확인된 항목이 없습니다.</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
