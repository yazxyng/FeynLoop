import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workspacePath,
  parseWorkspacePath,
  type WorkspaceRoute,
} from "../src/lib/workspace-routes";

test("화면 주소는 프로젝트·개념 선택을 보존하고 직접 진입할 수 있다", () => {
  const routes: WorkspaceRoute[] = [
    { view: "dashboard" },
    { view: "library" },
    { view: "upload" },
    { view: "records" },
    { view: "profile" },
    { view: "concepts", projectId: "project-1" },
    { view: "detail", projectId: "project-1", conceptId: "demo-0" },
    { view: "study", projectId: "project-1", conceptId: "demo-0" },
    { view: "result", projectId: "project-1", conceptId: "demo-0" },
  ];
  for (const route of routes)
    assert.deepEqual(parseWorkspacePath(workspacePath(route)), route);
  assert.equal(workspacePath({ view: "profile" }), "/profile");
  assert.equal(
    workspacePath({
      view: "study",
      projectId: "project-1",
      conceptId: "demo-0",
    }),
    "/projects/project-1/concepts/demo-0/study",
  );
  assert.deepEqual(parseWorkspacePath("/library/"), { view: "library" });
  assert.throws(() => workspacePath({ view: "study" }));
  assert.throws(() => workspacePath({ view: "study", projectId: "project-1" }));
});

test("알 수 없는 경로·외부 주소·경로 구분자를 포함한 ID는 화면으로 해석하지 않는다", () => {
  for (const path of [
    "/unknown",
    "https://example.com/library",
    "//example.com",
    "/projects/p/concepts",
    "/projects/p/concepts/c/unknown",
    "/projects/p%2Fother",
    "/projects/%2E%2E",
    "/projects/%E0%A4%A",
    "/projects/p/concepts/c/result/extra",
  ])
    assert.equal(parseWorkspacePath(path), null, path);
});
