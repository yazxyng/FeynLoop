import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { textPdf } from "./pdf-fixture";

// 소스 단위 테스트에서 발견하지 못하는 Next.js 번들링 문제를 검증합니다.
// npm run build 후 실행하며, 실제 AI·인증·클라우드 저장소는 사용하지 않습니다.
test(
  "빌드된 서버에서 실제 PDF를 업로드하고 텍스트를 추출한다",
  { timeout: 30000 },
  async (t) => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "feynloop-built-pdf-"));
    const port = await new Promise<number>((resolve, reject) => {
      const reservation = createServer();
      reservation.on("error", reject);
      reservation.listen(0, "127.0.0.1", () => {
        const address = reservation.address();
        if (!address || typeof address === "string")
          return reject(new Error("테스트 포트를 찾지 못했습니다."));
        reservation.close(() => resolve(address.port));
      });
    });
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ALLOW_DEMO: "true",
          GEMINI_API_KEY: "",
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          SUPABASE_SECRET_KEY: "",
          FEYNLOOP_DATA_DIR: dataDirectory,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    server.stdout.on("data", (chunk) => {
      logs += String(chunk);
    });
    server.stderr.on("data", (chunk) => {
      logs += String(chunk);
    });
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null) {
        const stopped = new Promise<void>((resolve) =>
          server.once("exit", () => resolve()),
        );
        server.kill("SIGTERM");
        await stopped;
      }
      await rm(dataDirectory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`서버 실행 실패: ${logs}`);
      try {
        const response = await fetch(base + "/api/config");
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, `테스트 서버 준비 실패: ${logs}`);
    const pageResponse = await fetch(base + "/");
    assert.equal(pageResponse.headers.get("x-frame-options"), "DENY");
    assert.equal(pageResponse.headers.get("x-content-type-options"), "nosniff");
    assert.ok(
      pageResponse.headers
        .get("content-security-policy")
        ?.includes("frame-ancestors 'none'"),
    );
    assert.equal(pageResponse.headers.get("x-powered-by"), null);
    const failedLogin = await fetch(base + "/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ action: "signup", username: "!", password: "" }),
    });
    assert.equal(failedLogin.status, 400);
    const failedBody = await failedLogin.json();
    assert.match(failedBody.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(failedBody.requestId, failedLogin.headers.get("X-Request-ID"));
    const form = new FormData();
    form.set("mode", "demo");
    form.set(
      "file",
      new File([textPdf()], "learning.pdf", { type: "application/pdf" }),
    );
    const response = await fetch(base + "/api/projects", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.project.pageCount, 1);
    assert.equal(result.project.mode, "demo");
    assert.ok(
      result.project.concepts.some((concept: { title: string }) =>
        concept.title.includes("Retrieval practice"),
      ),
    );
    assert.ok(!("pages" in result.project));
    const projectPath = `/projects/${result.project.id}`;
    const conceptPath = `${projectPath}/concepts/${result.project.concepts[0].id}`;
    for (const path of [
      "/",
      "/library",
      "/upload",
      "/records",
      "/profile",
      projectPath,
      conceptPath,
      `${conceptPath}/study`,
      `${conceptPath}/result`,
    ]) {
      const page = await fetch(base + path);
      assert.equal(page.status, 200, path);
      assert.ok((await page.text()).includes("FeynLoop"), path);
    }
    assert.equal((await fetch(base + "/unknown-screen")).status, 404);
    assert.ok(
      !JSON.stringify(result).includes(
        "recalling information without looking at the source",
      ),
    );
  },
);
