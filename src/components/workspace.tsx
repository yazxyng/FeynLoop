"use client";
import Link from "next/link";
import { useWorkspace } from "./workspace-provider";
import {
  workspacePath,
  type View,
  type WorkspaceRoute,
} from "@/lib/workspace-routes";
import {
  ChartNoAxesColumn,
  Copy,
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
import { draftRecoveryKey } from "@/lib/draft-recovery";
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
export default function Workspace({ route }: { route: WorkspaceRoute }) {
  const {
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
    notice,
    setError,
    setNotice,
    authOpen,
    setAuthOpen,
    setAuthVersion,
    uploadRef,
    pendingMessage,
    activeOperation,
    screenLoading,
    routeUnavailable,
    routeError,
    retryRoute,
    selectMode,
  } = useWorkspace();
  if (workspacePath(route) !== pathname) return null;
  return (
    <div className={`app-shell ${dark ? "dark-mode" : ""}`}>
      <main className={`app-frame view-${view}`}>
        {!dark && view !== "records" && (
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
          {screenLoading && (
            <section className="route-state" role="status">
              <span className="loop-symbol" />
              <h1>학습 기록을 불러오고 있어요</h1>
              <p>잠시만 기다려 주세요.</p>
            </section>
          )}
          {routeUnavailable && (
            <section className="route-state">
              <h1>학습 자료를 열 수 없어요</h1>
              <p>
                {routeError || "자료가 없거나 현재 계정에서 접근할 수 없어요."}
              </p>
              <div>
                <button onClick={retryRoute}>다시 불러오기</button>
                <button onClick={() => navigate("library")}>
                  카드함으로 가기
                </button>
              </div>
            </section>
          )}
          {view === "study" &&
            ready &&
            !screenLoading &&
            !routeUnavailable &&
            project &&
            concept &&
            !project.studies[concept.id] && (
              <section className="route-state">
                <h1>{concept.title}</h1>
                <p>
                  아직 시작하지 않은 개념이에요. 준비되면 설명을 시작해 보세요.
                </p>
                <button disabled={busy} onClick={() => start(concept)}>
                  설명 시작하기
                </button>
                <button onClick={() => navigate("concepts")}>
                  개념 목록으로 가기
                </button>
              </section>
            )}
          {view === "result" &&
            ready &&
            !screenLoading &&
            !routeUnavailable &&
            project &&
            concept &&
            study.phase !== "done" && (
              <section className="route-state">
                <h1>아직 완료된 학습 결과가 없어요</h1>
                <p>설명과 마지막 정리를 마치면 결과를 확인할 수 있어요.</p>
                <button disabled={busy} onClick={() => start(concept)}>
                  학습 이어가기
                </button>
              </section>
            )}

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
              onText={(title, text) => void importText(title, text)}
              onSample={() => void sampleProject()}
              onBack={() => navigate("dashboard")}
            />
          )}
          {view === "concepts" && project && !routeUnavailable && (
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
          {view === "detail" && project && concept && !routeUnavailable && (
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
          {view === "study" &&
            project &&
            concept &&
            project.studies[concept.id] &&
            !routeUnavailable && (
              <>
                <StudyRoom
                  project={project}
                  concept={concept}
                  study={study}
                  busy={busy}
                  typing={activeOperation && busyPresentation === "reply"}
                  pendingMessage={pendingMessage}
                  statusMessage={
                    activeOperation
                      ? operation
                      : "이전 요청을 마무리하고 있어요."
                  }
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
          {view === "result" &&
            project &&
            concept &&
            study.phase === "done" &&
            !routeUnavailable && (
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
                    navigate("study");
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
              projects={projects}
              busy={busy}
              onSelect={detail}
              onCreate={() => navigate("upload")}
            />
          )}
        </div>
      </main>
      {!dark && (
        <nav
          className={`bottom-nav ${view === "records" ? "records-nav" : ""}`}
          aria-label="주 메뉴"
        >
          {[
            { view: "dashboard" as View, label: "오늘", icon: Home },
            { view: "library" as View, label: "카드함", icon: Layers },
            { view: "upload" as View, label: "등록", icon: Plus },
            { view: "records" as View, label: "기록", icon: ChartNoAxesColumn },
            { view: "profile" as View, label: "마이페이지", icon: UserRound },
          ]
            .filter((item) => view !== "records" || item.view !== "profile")
            .map((item) => {
              const selected =
                view === item.view ||
                (item.view === "library" &&
                  ["concepts", "detail"].includes(view));
              return (
                <Link
                  href={workspacePath({ view: item.view })}
                  key={item.view}
                  className={selected ? "active" : ""}
                  aria-current={selected ? "page" : undefined}
                  aria-label={item.label}
                  aria-disabled={busy || undefined}
                  onClick={(event) => {
                    if (busy) event.preventDefault();
                    else {
                      setError("");
                      setNotice("");
                    }
                  }}
                >
                  {view === "records" && item.view === "dashboard" ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 10 12 3 21 10V21H3Z"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : view === "records" && item.view === "library" ? (
                    <Copy size={21} />
                  ) : (
                    <item.icon size={21} />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
      )}
      {activeOperation && busyPresentation === "dialog" && (
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
