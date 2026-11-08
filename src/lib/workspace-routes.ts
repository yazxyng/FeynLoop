export type View =
  | "dashboard"
  | "library"
  | "upload"
  | "records"
  | "profile"
  | "concepts"
  | "detail"
  | "study"
  | "result";
export type WorkspaceRoute = {
  view: View;
  projectId?: string;
  conceptId?: string;
};

const staticPaths = {
  dashboard: "/",
  library: "/library",
  upload: "/upload",
  records: "/records",
  profile: "/profile",
} as const;
export function workspacePath(route: WorkspaceRoute) {
  if (route.view in staticPaths)
    return staticPaths[route.view as keyof typeof staticPaths];
  if (!route.projectId) throw new Error("자료를 선택해 주세요.");
  const project = `/projects/${encodeURIComponent(route.projectId)}`;
  if (route.view === "concepts") return project;
  if (!route.conceptId) throw new Error("학습할 개념을 선택해 주세요.");
  const concept = `${project}/concepts/${encodeURIComponent(route.conceptId)}`;
  return route.view === "detail" ? concept : `${concept}/${route.view}`;
}
export function parseWorkspacePath(pathname: string): WorkspaceRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  for (const [view, value] of Object.entries(staticPaths))
    if (value === path) return { view: view as View };
  const match =
    /^\/projects\/([^/]+)(?:\/concepts\/([^/]+)(?:\/(study|result))?)?$/.exec(
      path,
    );
  if (!match) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    const conceptId = match[2] ? decodeURIComponent(match[2]) : undefined;
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId) ||
      (conceptId && !/^[a-zA-Z0-9_-]{1,100}$/.test(conceptId))
    )
      return null;
    return {
      view: !conceptId ? "concepts" : match[3] ? (match[3] as View) : "detail",
      projectId,
      ...(conceptId ? { conceptId } : {}),
    };
  } catch {
    return null;
  }
}
