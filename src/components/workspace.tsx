"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChartNoAxesColumn,
  ChevronDown,
  Home,
  Layers,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { accountRequest } from "@/lib/account-client";
import MyPage from "./screens/my-page";
import ProcessingDialog from "./processing-dialog";
import { workspaceRequest as api } from "@/lib/workspace-request";
import { draftRecoveryKey, recoverDraft } from "@/lib/draft-recovery";
import {
  newStudy,
  appConfigurationSchema,
  type AppConfiguration,
  type LearningMode,
  type Concept,
  type Project,
  type Study,
} from "@/lib/types";
import type { CardEntry } from "@/lib/presentation";
import { documentTitle } from "@/lib/presentation";
import StudyRoom from "./study-room";
import PasswordLogin from "./password-login";
import {
  HomeView,
  LibraryView,
  CardDetailView,
  RecordsView,
} from "./screens/collection-views";
import { ImportView, ConceptsView, ResultView } from "./screens/project-views";
type View =
  | "dashboard"
  | "library"
  | "upload"
  | "concepts"
  | "detail"
  | "study"
  | "result"
  | "records"
  | "profile";
export default function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]),
    [ready, setReady] = useState(false),
    [view, setView] = useState<View>("dashboard"),
    [projectId, setProjectId] = useState(""),
    [conceptId, setConceptId] = useState(""),
    [busy, setBusy] = useState(false),
    [busyPresentation, setBusyPresentation] = useState<
      "dialog" | "reply" | "inline"
    >("dialog"),
    [pendingMessage, setPendingMessage] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [collectionId, setCollectionId] = useState(""),
    [conceptDrafts, setConceptDrafts] = useState<
      Record<string, { title: string; description: string }>
    >({}),
    [userId, setUserId] = useState<string | null>(null),
    [configuration, setConfiguration] = useState<AppConfiguration | null>(null),
    [learningMode, setLearningMode] = useState<LearningMode>("demo"),
    [operation, setOperation] = useState(
      "처리 중입니다. 잠시만 기다려 주세요.",
    ),
    [authOpen, setAuthOpen] = useState(false),
    [authVersion, setAuthVersion] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null),
    running = useRef(false),
    generation = useRef(0);
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
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [view, projectId, conceptId]);
  function selectMode(mode: LearningMode) {
    setLearningMode(mode);
    try {
      localStorage.setItem("feynloop:learning-mode", mode);
    } catch {}
  }
  useEffect(() => {
    try {
      if (localStorage.getItem("feynloop:learning-mode") === "live")
        setLearningMode("live");
    } catch {}
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setConfiguration(appConfigurationSchema.parse(d)))
      .catch(() => {});
    let active = true;
    const current = ++generation.current;
    async function loadAccount() {
      setReady(false);
      setView((previous) => (previous === "profile" ? "profile" : "dashboard"));
      setProjects([]);
      setConceptDrafts({});
      setCollectionId("");
      setError("");
      try {
        const { user } = await accountRequest();
        if (!active || current !== generation.current) return;
        setUserId(user?.id || null);
        const data = await api("/api/projects");
        if (active && current === generation.current)
          setProjects(data.projects);
      } catch (error) {
        if (active && current === generation.current)
          setError(
            error instanceof Error ? error.message : "기록을 읽지 못했습니다.",
          );
      } finally {
        if (active && current === generation.current) setReady(true);
      }
    }
    void loadAccount();
    return () => {
      active = false;
      generation.current++;
    };
  }, [authVersion]);
  useEffect(() => {
    const refresh = () => setAuthVersion((version) => version + 1);
    window.addEventListener("feynloop:account-changed", refresh);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("feynloop-auth")
        : null;
    if (channel) channel.onmessage = refresh;
    return () => {
      window.removeEventListener("feynloop:account-changed", refresh);
      channel?.close();
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
    presentation: "dialog" | "reply" | "inline" = view === "study"
      ? "inline"
      : "dialog",
  ) {
    if (running.current) return;
    running.current = true;
    setOperation(label);
    setBusyPresentation(presentation);
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
  async function persistEdits(selected: Project) {
    let latest = selected;
    for (const c of selected.concepts) {
      const draft = conceptDrafts[`${selected.id}:${c.id}`];
      if (draft && !selected.studies[c.id]) {
        if (!draft.title.trim()) throw new Error("개념 이름을 입력해 주세요.");
        latest = await command("editConcept", draft, latest, c.id);
        setConceptDrafts((prev) => {
          const next = { ...prev };
          delete next[`${selected.id}:${c.id}`];
          return next;
        });
      }
    }
    return latest;
  }
  function start(c: Concept, selectedProject = project) {
    void run(async () => {
      if (!selectedProject) throw new Error("학습할 문서를 선택해 주세요.");
      const prepared = await persistEdits(selectedProject);
      const p = await command("start", {}, prepared, c.id);
      const session = p.studies[c.id];
      if (!["done", "review"].includes(session.phase)) {
        const key = draftRecoveryKey(userId || "guest", p.id, session);
        const draft = recoverDraft(sessionStorage, key, session.draft);
        if (draft !== session.draft) {
          accept({
            ...p,
            studies: { ...p.studies, [c.id]: { ...session, draft } },
          });
          setNotice("이 브라우저에 남아 있던 작성 중 설명을 복구했어요.");
        }
      }
      setProjectId(p.id);
      setConceptId(c.id);
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
    setConceptDrafts((prev) => {
      const next = { ...prev };
      delete next[`${project?.id}:${c.id}`];
      return next;
    });
  }
  function detail(entry: CardEntry) {
    setProjectId(entry.project.id);
    setConceptId(entry.concept.id);
    setView("detail");
  }
  async function sampleProject() {
    await run(
      async () => {
        if (!canStart)
          throw new Error("학습 방식과 로그인을 먼저 확인해 주세요.");
        const { project: p } = await api("/api/projects", {
          sample: true,
          mode: learningMode,
        });
        accept(p);
        open(p);
        setNotice(
          p.mode === "live"
            ? "Gemini가 핵심 카드를 만들었어요."
            : "실제 AI 호출 없는 데모 카드입니다.",
        );
      },
      learningMode === "live"
        ? "Gemini가 예제에서 핵심 카드를 찾고 있어요."
        : "예제 카드를 준비하고 있어요.",
    );
  }
  async function submit() {
    if (!study.draft.trim() || running.current) return;
    await run(
      async () => {
        setPendingMessage(study.draft);
        try {
          const key =
            project && draftRecoveryKey(userId || "guest", project.id, study);
          const p = await command("submit", { text: study.draft });
          try {
            if (key) sessionStorage.removeItem(key);
          } catch {}
          const s = p.studies[conceptId];
          if (s.phase === "done") setView("result");
        } finally {
          setPendingMessage(null);
        }
      },
      project?.mode === "live"
        ? study.phase === "rewrite"
          ? "Gemini가 마지막 설명을 확인하고 학습 결과를 만들고 있어요."
          : "Gemini가 설명을 읽고 다음 질문을 만들고 있어요."
        : "데모 답변을 준비하고 있어요.",
      "reply",
    );
  }
  const collection = collectionId
    ? projects.filter((p) => p.id === collectionId)
    : projects;
  const dark = view === "study" || view === "result";
  function navigate(next: View) {
    if (!busy) {
      setError("");
      setNotice("");
      setView(next);
    }
  }
  function onBackFromStudy() {
    void run(async () => {
      if (study.phase !== "review")
        await command("draft", { text: study.draft });
      setView("concepts");
    });
  }
  return (
    <div className={`app-shell ${dark ? "dark-mode" : ""}`}>
      <main className={`app-frame view-${view}`}>
        {!dark && (
          <header className="app-header">
            <button
              className="brand"
              aria-label="FeynLoop 홈"
              disabled={busy}
              onClick={() => navigate("dashboard")}
            >
              <span className="loop-symbol" />
              <strong>FeynLoop</strong>
            </button>
            <div className="header-controls">
              {["dashboard", "library", "records"].includes(view) &&
                projects.length > 0 && (
                  <label className="collection-picker">
                    <span className="sr-only">학습 문서 선택</span>
                    <select
                      value={collectionId}
                      disabled={busy}
                      onChange={(event) => setCollectionId(event.target.value)}
                    >
                      <option value="">전체 문서</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {documentTitle(p.name)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} />
                  </label>
                )}
              <button
                className="icon-button account-button"
                disabled={busy}
                aria-label="마이페이지"
                onClick={() => {
                  navigate("profile");
                }}
              >
                <UserRound size={18} />
              </button>
            </div>
          </header>
        )}
        {(error || notice) && (
          <div
            className={`alert ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || notice}</span>
            <button
              aria-label="알림 닫기"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <input
          ref={uploadRef}
          hidden
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <div className="page-content">
          {view === "dashboard" && (
            <>
              <HomeView
                projects={collection}
                ready={ready}
                busy={busy}
                sampleMode={learningMode}
                onStart={(entry) => start(entry.concept, entry.project)}
                onLibrary={() => navigate("library")}
                onCreate={() => navigate("upload")}
                onSample={() => {
                  if (canStart) void sampleProject();
                  else navigate("upload");
                }}
              />
            </>
          )}
          {view === "library" && (
            <LibraryView
              projects={collection}
              query={query}
              setQuery={setQuery}
              busy={busy}
              onSelect={detail}
              onCreate={() => navigate("upload")}
            />
          )}
          {view === "upload" && (
            <ImportView
              configuration={configuration}
              mode={learningMode}
              signedIn={Boolean(userId)}
              busy={busy}
              canStart={canStart}
              onMode={selectMode}
              onLogin={() => setAuthOpen(true)}
              onChooseFile={() => uploadRef.current?.click()}
              onFile={(file) => void upload(file)}
              onSample={() => void sampleProject()}
              onBack={() => navigate("dashboard")}
            />
          )}
          {view === "concepts" && project && (
            <ConceptsView
              project={project}
              drafts={conceptDrafts}
              busy={busy}
              onChange={(id, draft) =>
                setConceptDrafts((prev) => ({
                  ...prev,
                  [`${project.id}:${id}`]: draft,
                }))
              }
              onSave={(c) => void run(() => editConcept(c))}
              onStart={(c) => start(c)}
              onBack={() => navigate("library")}
            />
          )}
          {view === "detail" && project && concept && (
            <CardDetailView
              project={project}
              concept={concept}
              study={study}
              busy={busy}
              onBack={() => navigate("library")}
              onStart={() => start(concept)}
              onResult={() => start(concept)}
            />
          )}
          {view === "study" && project && concept && (
            <>
              <StudyRoom
                project={project}
                concept={concept}
                study={study}
                busy={busy}
                typing={busy && busyPresentation === "reply"}
                pendingMessage={pendingMessage}
                statusMessage={operation}
                onDraft={(text) => {
                  patchStudy({ ...study, draft: text });
                  try {
                    sessionStorage.setItem(
                      draftRecoveryKey(userId || "guest", project.id, study),
                      text,
                    );
                  } catch {}
                }}
                onSubmit={() => void submit()}
                onAction={(action, extra) =>
                  void run(
                    async () => {
                      await command(action, {
                        ...extra,
                        ...(action === "hint" ? { text: study.draft } : {}),
                      });
                    },
                    action === "hint"
                      ? "힌트를 준비하고 있어요."
                      : "대화를 업데이트하고 있어요.",
                    action === "hint" ? "reply" : "inline",
                  )
                }
                onSave={() =>
                  void run(async () => {
                    await command("draft", { text: study.draft });
                    setNotice(
                      "설명을 저장했어요. 여기서 다시 이어갈 수 있어요.",
                    );
                  })
                }
                onBack={onBackFromStudy}
              />
            </>
          )}
          {view === "result" && project && concept && (
            <ResultView
              project={project}
              concept={concept}
              study={study}
              busy={busy}
              onClose={() => navigate("dashboard")}
              onNext={() => navigate("concepts")}
              onRestart={() =>
                void run(async () => {
                  await command("restart");
                  setView("study");
                })
              }
            />
          )}
          {view === "profile" && (
            <MyPage
              key={userId || "guest"}
              signedIn={Boolean(userId)}
              onLogin={() => setAuthOpen(true)}
              onImported={() => setAuthVersion((version) => version + 1)}
              onLogout={async () => {
                await accountRequest("logout");
                setNotice("로그아웃했습니다.");
              }}
            />
          )}
          {view === "records" && (
            <RecordsView
              projects={collection}
              busy={busy}
              onSelect={detail}
              onCreate={() => navigate("upload")}
            />
          )}
        </div>
      </main>
      {!dark && (
        <nav className="bottom-nav" aria-label="주 메뉴">
          {[
            { view: "dashboard" as View, label: "오늘", icon: Home },
            { view: "library" as View, label: "카드함", icon: Layers },
            { view: "upload" as View, label: "등록", icon: Plus },
            { view: "records" as View, label: "기록", icon: ChartNoAxesColumn },
            { view: "profile" as View, label: "마이페이지", icon: UserRound },
          ].map((item) => {
            const selected =
              view === item.view ||
              (item.view === "library" &&
                ["concepts", "detail"].includes(view));
            return (
              <button
                key={item.view}
                className={selected ? "active" : ""}
                aria-current={selected ? "page" : undefined}
                aria-label={item.label}
                disabled={busy}
                onClick={() => navigate(item.view)}
              >
                <item.icon size={21} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {busy && busyPresentation === "dialog" && (
        <ProcessingDialog message={operation} />
      )}
      {authOpen && (
        <PasswordLogin
          onClose={() => setAuthOpen(false)}
          onSuccess={() => {
            setAuthOpen(false);
            setNotice("로그인했습니다. 내 학습 기록을 불러옵니다.");
          }}
        />
      )}
    </div>
  );
}
