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
  X,
  Lightbulb,
  Leaf,
} from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "@/lib/supabase";
import {
  newStudy,
  appConfigurationSchema,
  type AppConfiguration,
  type LearningMode,
  type Concept,
  type Feedback,
  type Project,
  type Study,
} from "@/lib/types";
import StudyRoom from "./study-room";
import LearningModeChoice from "./learning-mode";
type View = "dashboard" | "concepts" | "study" | "result";
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
    [email, setEmail] = useState(""),
    [userId, setUserId] = useState<string | null>(null),
    [configuration, setConfiguration] = useState<AppConfiguration | null>(null),
    [learningMode, setLearningMode] = useState<LearningMode>("demo"),
    [operation, setOperation] = useState(
      "처리 중입니다. 잠시만 기다려 주세요.",
    ),
    [authOpen, setAuthOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null),
    running = useRef(false),
    generation = useRef(0),
    accessTokenRef = useRef<string | undefined>(undefined);
  const canStart =
    !busy &&
    ready &&
    (learningMode === "demo"
      ? Boolean(!configuration || configuration.demoAllowed || userId)
      : Boolean(
          userId &&
          configuration &&
          Object.values(configuration.readiness).every(Boolean),
        ));
  const project = projects.find((p) => p.id === projectId),
    concept = project?.concepts.find((c) => c.id === conceptId),
    study = project?.studies[conceptId] || newStudy(conceptId);
  async function api(path: string, body?: unknown, token?: string) {
    const accessToken = token ?? accessTokenRef.current;
    const isForm = body instanceof FormData;
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        ...(body !== undefined && !isForm
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined
        ? { body: isForm ? body : JSON.stringify(body) }
        : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
  }
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setConfiguration(appConfigurationSchema.parse(d)))
      .catch(() => {});
    let active = true;
    const load = async (id: string | null, token?: string) => {
      const current = ++generation.current;
      setReady(false);
      setView("dashboard");
      setUserId(id);
      setProjects([]);
      try {
        const data = await api("/api/projects", undefined, token || "");
        if (active && current === generation.current)
          setProjects(data.projects);
      } catch (e) {
        if (active && current === generation.current)
          setError(e instanceof Error ? e.message : "기록을 읽지 못했습니다.");
      } finally {
        if (active && current === generation.current) setReady(true);
      }
    };
    void load(null);
    if (supabase) {
      let lastId: string | null = null;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        accessTokenRef.current = session?.access_token;
        const id = session?.user.id || null;
        if (id === lastId) return;
        lastId = id;
        void load(id, session?.access_token);
      });
      return () => {
        active = false;
        generation.current++;
        data.subscription.unsubscribe();
      };
    }
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  function accept(p: Project) {
    setProjects((prev) =>
      prev.some((v) => v.id === p.id)
        ? prev.map((v) => (v.id === p.id ? p : v))
        : [p, ...prev],
    );
  }
  async function command(
    action: string,
    extra: Record<string, unknown> = {},
    p = project,
    cId = conceptId,
  ) {
    if (!p) throw new Error("프로젝트를 선택해 주세요.");
    const current = generation.current;
    const data = await api(`/api/projects/${p.id}`, {
      action,
      conceptId: cId,
      version: p.version,
      requestId: crypto.randomUUID(),
      ...extra,
    });
    if (current !== generation.current)
      throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
    accept(data.project);
    return data.project as Project;
  }
  function patchStudy(next: Study) {
    if (!project) return;
    accept({ ...project, studies: { ...project.studies, [conceptId]: next } });
  }
  async function run(
    task: () => Promise<void>,
    label = "처리 중입니다. 잠시만 기다려 주세요.",
  ) {
    if (running.current) return;
    running.current = true;
    setOperation(label);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function open(p: Project) {
    setProjectId(p.id);
    setView("concepts");
  }
  async function upload(file: File) {
    await run(
      async () => {
        const form = new FormData();
        if (!canStart)
          throw new Error("선택한 학습 방식의 설정과 로그인을 확인해 주세요.");
        if (
          !file.name.toLowerCase().endsWith(".pdf") ||
          file.size === 0 ||
          file.size > 20 * 1024 * 1024
        )
          throw new Error("20MB 이하의 PDF 파일을 선택해 주세요.");
        form.set("file", file);
        form.set("mode", learningMode);
        const { project: p } = await api("/api/projects", form);
        accept(p);
        open(p);
        setNotice(
          p.mode === "demo"
            ? "데모 개념 후보입니다. 학습 전에 이름을 확인해 주세요."
            : "분석을 마쳤습니다. 학습할 개념을 선택해 주세요.",
        );
      },
      learningMode === "live"
        ? "Gemini가 PDF에서 학습 개념을 분석하고 있어요."
        : "PDF를 읽고 데모 학습을 준비하고 있어요.",
    );
  }
  function start(c: Concept, selectedProject = project) {
    void run(async () => {
      const prepared =
        selectedProject && !selectedProject.studies[c.id]
          ? await command(
              "editConcept",
              { title: c.title, description: c.description },
              selectedProject,
              c.id,
            )
          : selectedProject;
      const p = await command("start", {}, prepared, c.id);
      setProjectId(p.id);
      setConceptId(c.id);
      setTab("editor");
      setView(p.studies[c.id].phase === "done" ? "result" : "study");
    });
  }
  async function editConcept(c: Concept) {
    await command(
      "editConcept",
      { title: c.title, description: c.description },
      project,
      c.id,
    );
  }
  async function submit() {
    if (!study.draft.trim()) return;
    await run(async () => {
      const p = await command("submit", { text: study.draft });
      const s = p.studies[conceptId];
      setTab(s.phase === "questions" ? "chat" : "editor");
      if (s.phase === "done") setView("result");
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
              {userId ? "클라우드 저장 사용 중" : "서버에 데모 기록 저장"}
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
              {(project && view !== "dashboard"
                ? project.mode
                : learningMode) === "demo"
                ? "DEMO MODE"
                : "GEMINI MODE"}
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
                disabled={!canStart}
                onClick={() => uploadRef.current?.click()}
              >
                <Plus size={17} />새 PDF 업로드
              </Button>
            </div>
            <LearningModeChoice
              configuration={configuration}
              mode={learningMode}
              signedIn={Boolean(userId)}
              busy={busy}
              onSelect={(mode) => {
                setLearningMode(mode);
                setError("");
              }}
              onLogin={() => setAuthOpen(true)}
            />
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
                      const { project: p } = await api("/api/projects", {
                        sample: true,
                        mode: learningMode,
                      });
                      accept(p);
                      open(p);
                      setNotice(
                        p.mode === "live"
                          ? "Gemini가 예제 문서의 개념을 분석했습니다."
                          : "실제 AI 호출 없는 데모입니다.",
                      );
                    })
                  }
                  disabled={!canStart}
                >
                  {learningMode === "live"
                    ? "Gemini로 예제 분석하기"
                    : "예제 문서로 시작하기"}{" "}
                  <ArrowUpRight size={16} />
                </Button>
                <small>
                  {learningMode === "live"
                    ? "로그인 후 Gemini로 실제 학습을 시작해요"
                    : "별도 설정 없이 학습 흐름을 경험해 보세요"}
                </small>
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
                  if (ongoing.c) start(ongoing.c, ongoing.p);
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
                          {p.pageCount}페이지 <span>·</span> 핵심 개념{" "}
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
                  disabled={!canStart}
                  onClick={() => uploadRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (canStart && e.dataTransfer.files[0])
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
                    {project.name} · {project.pageCount}페이지{" "}
                    {project.mode === "demo"
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
                        {project.mode === "live"
                          ? "Gemini가 문서에서 추출한 개념입니다. 근거 페이지와 학습 목표를 확인해 주세요."
                          : "이 프로젝트는 데모입니다. 실제 AI를 사용하려면 대시보드에서 Gemini 학습을 선택해 새 프로젝트를 만들어 주세요."}
                      </small>
                    </p>
                  </div>
                  {project.mode === "demo" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setLearningMode("live");
                        setView("dashboard");
                      }}
                    >
                      실제 Gemini 학습 준비하기 <ArrowRight size={15} />
                    </Button>
                  )}
                  <div className="concept-list">
                    {project.concepts.map((c, i) => (
                      <div className="concept-card" key={c.id}>
                        <span className="concept-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="concept-details">
                          <input
                            aria-label={`개념 ${i + 1} 이름`}
                            disabled={busy || Boolean(project.studies[c.id])}
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
                          />
                          <textarea
                            aria-label={`개념 ${i + 1} 설명`}
                            disabled={busy || Boolean(project.studies[c.id])}
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
                          />
                          <div>
                            {!project.studies[c.id] && (
                              <button
                                className="hint-button"
                                disabled={busy || !c.title.trim()}
                                onClick={() => void run(() => editConcept(c))}
                              >
                                변경 저장
                              </button>
                            )}
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
                <StudyRoom
                  project={project}
                  concept={concept}
                  study={study}
                  busy={busy}
                  tab={tab}
                  setTab={setTab}
                  onDraft={(text) => patchStudy({ ...study, draft: text })}
                  onSubmit={() => void submit()}
                  onAction={(action, extra) =>
                    void run(async () => {
                      await command(action, {
                        ...extra,
                        ...(action === "hint" ? { text: study.draft } : {}),
                      });
                      if (action === "rewrite") setTab("editor");
                    })
                  }
                  onSave={() =>
                    void run(async () => {
                      await command("draft", { text: study.draft });
                      setNotice("설명을 서버에 저장했습니다.");
                    })
                  }
                />
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
                  {study.initialFeedback && (
                    <>
                      <h3>첫 설명의 평가</h3>
                      <FeedbackView feedback={study.initialFeedback} />
                    </>
                  )}
                  {study.result && (
                    <>
                      <h3>마지막 설명의 평가</h3>
                      <FeedbackView feedback={study.result} />
                      <div className="info-box">
                        <p>{study.result.change}</p>
                      </div>
                    </>
                  )}
                  <p className="muted">
                    이번 시도 {study.attempt}회차 · 근거 열람{" "}
                    {study.evidenceViews.length}페이지 · 사용한 힌트{" "}
                    {study.turns.reduce((n, t) => n + t.hints.length, 0)}개
                  </p>
                  <div className="info-box">
                    <Lightbulb size={18} />
                    <p>
                      {project.mode === "demo"
                        ? "데모에서는 정확도나 이해 향상을 점수로 판정하지 않습니다. 결과는 설명 기록이며 의미 기반 평가 결과가 아닙니다."
                        : "미확인은 아직 설명에서 확인하지 못한 내용입니다. 이해하지 못했다는 뜻은 아닙니다."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        await command("restart");
                        setTab("editor");
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
            <Loader2 size={16} className="spin" /> {operation}
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
                ? "이메일 로그인 후 프로젝트와 PDF를 내 계정에 저장합니다. 데모 기록은 별도로 유지됩니다."
                : "Supabase 환경변수가 설정되지 않았습니다. 현재는 로그인 없이 서버의 데모 저장 방식으로 사용할 수 있습니다."}
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
        ["개념 오류", feedback.errors, "amber"],
        ["설명에서 빠진 요소 · 이해 여부 미확인", feedback.missing, "gray"],
        ["보완할 요소", feedback.improve, "amber"],
        ["아직 미확인", feedback.unverified, "gray"],
      ].map(([title, items, color]) => (
        <section className={`feedback-section ${color}`} key={String(title)}>
          <h3>
            <span /> {String(title)}
          </h3>
          <ul>
            {(items as string[]).length ? (
              (items as string[]).map((item, i) => (
                <li key={i}>
                  {item}
                  {feedback.evidence
                    .filter((e) => e.claim === item)
                    .map((e, j) => (
                      <details key={j}>
                        <summary>근거 p.{e.page}</summary>
                        <blockquote>{e.quote}</blockquote>
                      </details>
                    ))}
                </li>
              ))
            ) : (
              <li>확인된 항목이 없습니다.</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
