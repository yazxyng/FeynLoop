"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { errorRequestId as diagnosticId } from "@/lib/request-error";
import { accountRequest } from "@/lib/account-client";
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
import {
  parseWorkspacePath,
  workspacePath,
  type View,
  type WorkspaceRoute,
} from "@/lib/workspace-routes";
function useWorkspaceController() {
  const router = useRouter();
  const pathname = usePathname();
  const route = parseWorkspacePath(pathname) || { view: "dashboard" as View };
  const { view } = route;
  const projectId = route.projectId || "";
  const conceptId = route.conceptId || "";
  const currentPath = useRef(pathname);
  useEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);
  function go(target: WorkspaceRoute, replace = false) {
    if (currentPath.current !== pathname) return;
    const path = workspacePath(target);
    if (path === pathname) return;
    if (replace) router.replace(path);
    else router.push(path);
  }
  const [projects, setProjects] = useState<Project[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [busyPath, setBusyPath] = useState(""),
    [routeLoading, setRouteLoading] = useState(false),
    [routeReadPath, setRouteReadPath] = useState(""),
    [routeError, setRouteError] = useState(""),
    [routeErrorRequestId, setRouteErrorRequestId] = useState<string>(),
    [routeVersion, setRouteVersion] = useState(0),
    [busyPresentation, setBusyPresentation] = useState<
      "dialog" | "reply" | "inline"
    >("dialog"),
    [pendingMessage, setPendingMessage] = useState<string | null>(null),
    [error, setErrorText] = useState(""),
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
    [demoAccess, setDemoAccess] = useState(false),
    [authVersion, setAuthVersion] = useState(0);
  const [errorRequestId, setErrorRequestId] = useState<string>();
  function setError(message: string) {
    setErrorText(message);
    setErrorRequestId(undefined);
  }
  function reportError(error: unknown, fallback: string) {
    setErrorText(error instanceof Error ? error.message : fallback);
    setErrorRequestId(diagnosticId(error));
  }
  function setAuthOpen(open: boolean) {
    if (open) router.push("/login");
  }
  function enterDemo() {
    setDemoAccess(true);
    selectMode("demo");
    try {
      sessionStorage.setItem("feynloop:demo-access", "true");
    } catch {}
    setAuthVersion((version) => version + 1);
  }
  const uploadRef = useRef<HTMLInputElement>(null),
    running = useRef(false),
    draftEdits = useRef(new Map<string, string>()),
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
  function selectMode(mode: LearningMode) {
    setLearningMode(mode);
    try {
      localStorage.setItem("feynloop:learning-mode", mode);
    } catch {}
  }
  useEffect(() => {
    try {
      setDemoAccess(sessionStorage.getItem("feynloop:demo-access") === "true");
      if (localStorage.getItem("feynloop:learning-mode") === "live")
        setLearningMode("live");
    } catch {}
    const configurationRequest = fetch("/api/config", {
      signal: AbortSignal.timeout(10_000),
    })
      .then((r) => r.json())
      .then((d) => appConfigurationSchema.parse(d))
      .catch(() => null);
    let active = true;
    const current = ++generation.current;
    async function loadAccount() {
      setReady(false);
      setRouteReadPath("");
      setProjects([]);
      setPendingMessage(null);
      draftEdits.current.clear();
      setConceptDrafts({});
      setCollectionId("");
      setError("");
      setUserId(null);
      try {
        const [{ user }, config] = await Promise.all([
          accountRequest(),
          configurationRequest,
        ]);
        if (!active || current !== generation.current) return;
        setConfiguration(config);
        setUserId(user?.id || null);
        if (user) {
          setLearningMode("live");
          setDemoAccess(false);
          try {
            if (localStorage.getItem("feynloop:learning-mode") === "demo")
              setLearningMode("demo");
            sessionStorage.removeItem("feynloop:demo-access");
          } catch {}
        }
        // 소개·로그인 화면에서는 비로그인 학습 API를 호출하지 않습니다.
        // 데모도 서버가 허용하고 이 탭에서 명시적으로 선택한 경우만 읽습니다.
        if (!user) {
          let requestedDemo = false;
          try {
            requestedDemo =
              sessionStorage.getItem("feynloop:demo-access") === "true";
          } catch {}
          const guestAccess = Boolean(config?.demoAllowed && requestedDemo);
          setDemoAccess(guestAccess);
          if (!guestAccess) return;
        }
        const data = await api("/api/projects");
        if (active && current === generation.current)
          setProjects(data.projects);
      } catch (error) {
        if (active && current === generation.current)
          reportError(error, "기록을 읽지 못했습니다.");
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
        ? prev.map((v) => (v.id === p.id && v.version <= p.version ? p : v))
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
    draftEdits.current.set(
      draftRecoveryKey(userId || "guest", project.id, next),
      next.draft,
    );
    accept({ ...project, studies: { ...project.studies, [conceptId]: next } });
  }
  function restoreStudyDraft(id: string, session: Study) {
    const key = draftRecoveryKey(userId || "guest", id, session);
    // 느린 서버 읽기가 방금 작성한 내용을 덮지 않게 메모리 초안을 우선합니다.
    if (draftEdits.current.has(key)) return draftEdits.current.get(key)!;
    try {
      return recoverDraft(sessionStorage, key, session.draft);
    } catch {
      return session.draft;
    }
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
    const requestGeneration = generation.current;
    setOperation(label);
    setBusyPresentation(presentation);
    setBusyPath(pathname);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      if (
        currentPath.current === pathname &&
        requestGeneration === generation.current
      )
        reportError(e, "작업을 완료하지 못했습니다.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function open(p: Project) {
    go({ view: "concepts", projectId: p.id });
  }
  async function upload(file: File) {
    await run(
      async () => {
        const current = generation.current;
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
        if (current !== generation.current)
          throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
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
  async function importText(title: string, text: string) {
    await run(
      async () => {
        const current = generation.current;
        if (!canStart)
          throw new Error("학습 방식과 로그인을 먼저 확인해 주세요.");
        const { project: created } = await api("/api/projects", {
          source: "text",
          title: title.trim() || "텍스트 학습",
          text,
          mode: learningMode,
        });
        if (current !== generation.current)
          throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
        accept(created);
        open(created);
        setNotice(
          created.mode === "live"
            ? "텍스트 분석을 마쳤어요. 학습할 개념을 선택해 주세요."
            : "텍스트로 만든 데모 카드예요. 개념 이름을 확인해 주세요.",
        );
      },
      learningMode === "live"
        ? "Gemini가 텍스트에서 학습 개념을 찾고 있어요."
        : "텍스트로 데모 학습을 준비하고 있어요.",
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
        const draft = restoreStudyDraft(p.id, session);
        if (draft !== session.draft) {
          accept({
            ...p,
            studies: { ...p.studies, [c.id]: { ...session, draft } },
          });
          setNotice("이 브라우저에 남아 있던 작성 중 설명을 복구했어요.");
        }
      }
      go({
        view: p.studies[c.id].phase === "done" ? "result" : "study",
        projectId: p.id,
        conceptId: c.id,
      });
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
    // 카드를 고르면 별도 설명 작성 화면을 거치지 않고 대화로 이어갑니다.
    start(entry.concept, entry.project);
  }
  async function sampleProject() {
    await run(
      async () => {
        const current = generation.current;
        if (!canStart)
          throw new Error("학습 방식과 로그인을 먼저 확인해 주세요.");
        const { project: p } = await api("/api/projects", {
          sample: true,
          mode: learningMode,
        });
        if (current !== generation.current)
          throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
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
            if (key) {
              draftEdits.current.delete(key);
              sessionStorage.removeItem(key);
            }
          } catch {}
          const s = p.studies[conceptId];
          if (s.phase === "done")
            go({ view: "result", projectId: p.id, conceptId }, true);
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
      go({ view: next, projectId, conceptId });
    }
  }
  function onBackFromStudy() {
    void run(async () => {
      if (study.phase !== "review")
        await command("draft", { text: study.draft });
      go({ view: "concepts", projectId });
    });
  }

  // 기록 화면에 돌아오거나 탭을 다시 볼 때 다른 화면에서 저장한 집계도 읽습니다.
  useEffect(() => {
    if (!ready || view !== "records") return;
    let active = true;
    let loading = false;
    const current = generation.current;
    async function refreshRecords() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const data = await api("/api/projects");
        if (!active || current !== generation.current) return;
        setProjects((previous) => {
          if (!active || current !== generation.current) return previous;
          const merged = new Map(previous.map((entry) => [entry.id, entry]));
          for (const loaded of data.projects as Project[]) {
            const cached = merged.get(loaded.id);
            if (cached && cached.version > loaded.version) continue;
            for (const session of Object.values(loaded.studies)) {
              if (["explain", "questions", "rewrite"].includes(session.phase))
                session.draft = restoreStudyDraft(loaded.id, session);
            }
            merged.set(loaded.id, {
              ...cached,
              ...loaded,
              studies:
                cached?.version === loaded.version
                  ? cached.studies
                  : loaded.studies,
            });
          }
          return [...merged.values()].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
        });
      } catch (error) {
        if (active && current === generation.current)
          reportError(error, "최신 학습 기록을 읽지 못했어요.");
      } finally {
        loading = false;
      }
    }
    void refreshRecords();
    window.addEventListener("focus", refreshRecords);
    document.addEventListener("visibilitychange", refreshRecords);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRecords);
      document.removeEventListener("visibilitychange", refreshRecords);
    };
  }, [view, ready, authVersion]);

  // Deep links are read-only: opening a study URL never starts an AI request.
  useEffect(() => {
    if (!ready || !projectId) {
      setRouteLoading(false);
      setRouteError("");
      setRouteErrorRequestId(undefined);
      return;
    }
    let active = true;
    const current = generation.current;
    setRouteLoading(true);
    setRouteError("");
    setRouteErrorRequestId(undefined);
    const focus = conceptId
      ? `?conceptId=${encodeURIComponent(conceptId)}`
      : "";
    void api(`/api/projects/${encodeURIComponent(projectId)}${focus}`)
      .then(({ project: loaded }: { project: Project }) => {
        if (!active || current !== generation.current) return;
        for (const session of Object.values(loaded.studies)) {
          if (!["explain", "questions", "rewrite"].includes(session.phase))
            continue;
          session.draft = restoreStudyDraft(loaded.id, session);
        }
        accept(loaded);
      })
      .catch((error) => {
        if (active && current === generation.current) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "학습 자료를 읽지 못했어요.",
          );
          setRouteErrorRequestId(diagnosticId(error));
        }
      })
      .finally(() => {
        if (active && current === generation.current) {
          setRouteLoading(false);
          setRouteReadPath(pathname);
        }
      });
    return () => {
      active = false;
    };
  }, [pathname, ready, authVersion, routeVersion]);
  useEffect(() => {
    if (
      ready &&
      !routeLoading &&
      view === "study" &&
      project &&
      concept &&
      study.phase === "done"
    )
      go({ view: "result", projectId, conceptId }, true);
  }, [
    ready,
    routeLoading,
    view,
    projectId,
    conceptId,
    project?.version,
    study.phase,
  ]);
  const needsProject = ["concepts", "detail", "study", "result"].includes(view);
  const needsConcept = ["detail", "study", "result"].includes(view);
  const screenLoading =
    needsProject &&
    (!ready ||
      ((routeLoading || routeReadPath !== pathname) &&
        (!project || (needsConcept && !concept))));
  const routeUnavailable =
    needsProject &&
    ready &&
    !screenLoading &&
    ((routeReadPath === pathname && !!routeError) ||
      !project ||
      (needsConcept && !concept));
  // 다른 화면에 이전 작업의 오류가 남지 않도록 화면 이동 시 정리합니다.
  useEffect(() => {
    setError("");
    setNotice("");
  }, [pathname]);
  const activeOperation = busy && busyPath === pathname;
  return {
    pathname,
    view,
    dark,
    project,
    concept,
    study,
    projects,
    collection,
    ready,
    busy,
    query,
    setQuery,
    collectionId,
    setCollectionId,
    userId,
    configuration,
    learningMode,
    canStart,
    conceptDrafts,
    setConceptDrafts,
    navigate,
    start,
    detail,
    sampleProject,
    upload,
    importText,
    run,
    editConcept,
    command,
    patchStudy,
    submit,
    onBackFromStudy,
    operation,
    busyPresentation,
    error,
    errorRequestId,
    notice,
    setError,
    setNotice,
    demoAccess,
    enterDemo,
    setAuthOpen,
    setAuthVersion,
    uploadRef,
    pendingMessage: activeOperation ? pendingMessage : null,
    activeOperation,
    screenLoading,
    routeUnavailable,
    routeError,
    routeErrorRequestId,
    retryRoute: () => setRouteVersion((value) => value + 1),
    selectMode,
  };
}
const WorkspaceContext = createContext<ReturnType<
  typeof useWorkspaceController
> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const controller = useWorkspaceController();
  return (
    <WorkspaceContext.Provider value={controller}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const controller = useContext(WorkspaceContext);
  if (!controller) throw new Error("학습 공간을 불러오지 못했어요.");
  return controller;
}
