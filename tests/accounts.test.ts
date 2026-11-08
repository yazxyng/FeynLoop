import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  POST as authenticate,
  GET as session,
} from "../src/app/api/auth/session/route";
import { POST as importLegacy } from "../src/app/api/auth/import-legacy/route";
import {
  POST as createProject,
  GET as projects,
} from "../src/app/api/projects/route";
import {
  GET as project,
  POST as updateStudy,
} from "../src/app/api/projects/[id]/route";
import {
  hashPassword,
  verifyPassword,
  secretHash,
} from "../src/lib/server/auth/crypto";
import { sample } from "../src/lib/server/demo";
import {
  GET as getProfile,
  POST as saveProfile,
} from "../src/app/api/account/profile/route";
import { learningDay } from "../src/lib/activity";

function request(body?: unknown, cookie?: string, origin = "http://localhost") {
  return new Request("http://localhost/api/auth/session", {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function cookieOf(response: Response) {
  return response.headers.get("set-cookie")!.split(";")[0];
}

// SDK -> PostgREST 모의 전송 -> 실제 PostgreSQL SQL/함수 실행.
// 실서비스 계정·메일·API 키를 사용하지 않습니다.
test(
  "자체 로그인: 가입·검증·세션·소유권·복구·이관·요청 제한을 PostgreSQL로 검증",
  { timeout: 60000 },
  async (t) => {
    const db = new PGlite();
    await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table feynloop_projects(id uuid primary key,user_id uuid,state jsonb,version integer,file_path text,updated_at timestamptz default now());
    create table feynloop_sources(project_id uuid primary key,user_id uuid,pages jsonb);
  `);
    const migration = await readFile(
      "supabase/migrations/20261108_accounts.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration); // 마이그레이션 재실행도 검증
    const profileMigration = await readFile(
      "supabase/migrations/20261108_profile.sql",
      "utf8",
    );
    await db.exec(profileMigration);
    await db.exec(profileMigration);
    t.after(() => db.close());
    const values = {
      SUPABASE_URL: "https://accounts.test",
      NEXT_PUBLIC_SUPABASE_URL: "https://accounts.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public",
      SUPABASE_SECRET_KEY: "test-server",
      ALLOW_DEMO: "true",
      GEMINI_API_KEY: "",
    };
    const previous = Object.fromEntries(
      Object.keys(values).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, values);
    t.after(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    const legacyId = "72a492f8-6b8d-4d58-8189-557e4222e945";
    let legacyLookups = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        assert.equal(
          url.hostname,
          "accounts.test",
          "외부 네트워크 요청은 허용하지 않음",
        );
        const headers = new Headers(init?.headers);
        if (url.pathname === "/auth/v1/user") {
          legacyLookups++;
          return headers.get("authorization") === "Bearer verified-legacy-token"
            ? Response.json({
                id: legacyId,
                aud: "authenticated",
                role: "authenticated",
              })
            : Response.json({ message: "invalid token" }, { status: 401 });
        }
        assert.equal(headers.get("apikey"), "test-server");
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        try {
          if (url.pathname.startsWith("/rest/v1/rpc/")) {
            const name = url.pathname.split("/").at(-1)!;
            assert.match(name, /^[a-z_]+$/);
            const keys = Object.keys(body);
            const result = await db.query<{ value: unknown }>(
              `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`,
              Object.values(body),
            );
            return Response.json(result.rows[0].value);
          }
          const table = url.pathname.split("/").at(-1)!;
          assert.match(table, /^feynloop_[a-z_]+$/);
          const parameters: unknown[] = [];
          const conditions: string[] = [];
          for (const [key, value] of url.searchParams) {
            if (["select", "order", "limit"].includes(key)) continue;
            assert.match(key, /^[a-z_]+$/);
            const dot = value.indexOf(".");
            const operator = value.slice(0, dot);
            const expected = value.slice(dot + 1);
            assert.ok(["eq", "gt"].includes(operator));
            parameters.push(expected);
            conditions.push(
              `${key}${operator === "eq" ? "=" : ">"}$${parameters.length}`,
            );
          }
          const where = conditions.length
            ? " where " + conditions.join(" and ")
            : "";
          const method = init?.method || "GET";
          if (method === "POST") {
            const keys = Object.keys(body);
            const result = await db.query(
              `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
              Object.values(body),
            );
            return headers.get("prefer")?.includes("return=representation")
              ? Response.json(result.rows)
              : new Response(null, { status: 201 });
          }
          if (method === "PATCH") {
            const assignments = Object.entries(body).map(([key, value]) => {
              assert.match(key, /^[a-z_]+$/);
              parameters.push(value);
              return `${key}=$${parameters.length}`;
            });
            const result = await db.query(
              `update ${table} set ${assignments.join(",")}${where} returning *`,
              parameters,
            );
            return Response.json(result.rows);
          }
          if (method === "DELETE") {
            await db.query(`delete from ${table}${where}`, parameters);
            return new Response(null, { status: 204 });
          }
          const select = url.searchParams.get("select") || "*";
          assert.match(select, /^[a-z_,*]+$/);
          const result = await db.query(
            `select ${select} from ${table}${where}`,
            parameters,
          );
          return headers.get("accept")?.includes("vnd.pgrst.object")
            ? Response.json(result.rows[0] || null)
            : Response.json(result.rows);
        } catch (error) {
          return Response.json(
            {
              code: (error as { code: string }).code || "XX000",
              message: "database test error",
            },
            { status: 400 },
          );
        }
      },
    );
    await t.test(
      "동일 비밀번호도 다른 salt, 잘못된 비밀번호 거부",
      async () => {
        const first = await hashPassword("a-password-123");
        const second = await hashPassword("a-password-123");
        assert.notEqual(first, second);
        assert.ok(await verifyPassword("a-password-123", first));
        assert.ok(!(await verifyPassword("wrong", first)));
      },
    );
    let aliceCookie = "",
      aliceId = "",
      aliceRecovery = "",
      bobCookie = "",
      projectId = "";
    await t.test(
      "메일 없이 즉시 가입, HttpOnly 쿠키, DB에 해시만 저장",
      async () => {
        const response = await authenticate(
          request({
            action: "signup",
            username: "Alice",
            password: "alice-password",
          }),
        );
        assert.equal(
          response.status,
          201,
          JSON.stringify(await response.clone().json()),
        );
        const data = await response.json();
        aliceId = data.user.id;
        aliceRecovery = data.recoveryCode;
        aliceCookie = cookieOf(response);
        assert.equal(data.user.username, "alice");
        assert.ok(aliceRecovery.startsWith("FYN-"));
        assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
        assert.match(response.headers.get("set-cookie")!, /SameSite=strict/i);
        assert.ok(!("password_hash" in data.user));
        const stored = (
          await db.query<{ password_hash: string; recovery_hash: string }>(
            "select password_hash,recovery_hash from feynloop_accounts where id=$1",
            [aliceId],
          )
        ).rows[0];
        assert.notEqual(stored.password_hash, "alice-password");
        assert.notEqual(stored.recovery_hash, aliceRecovery);
        const tokens = (
          await db.query<{ token_hash: string }>(
            "select token_hash from feynloop_sessions",
          )
        ).rows;
        assert.equal(
          tokens[0].token_hash,
          secretHash(aliceCookie.split("=")[1]),
        );
        assert.equal(legacyLookups, 0);
      },
    );
    await t.test("쿠키로 로그인 복원, 중복 아이디·오답·CSRF 거부", async () => {
      assert.equal(
        (await (await session(request(undefined, aliceCookie))).json()).user.id,
        aliceId,
      );
      assert.equal(
        (
          await authenticate(
            request({
              action: "signup",
              username: "alice",
              password: "other-password",
            }),
          )
        ).status,
        409,
      );
      for (const username of ["alice", "unknown_user"]) {
        const response = await authenticate(
          request({ action: "login", username, password: "wrong" }),
        );
        assert.equal(response.status, 401);
        assert.equal(
          (await response.json()).error,
          "아이디 또는 비밀번호를 확인해 주세요.",
        );
      }
      assert.equal(
        (
          await authenticate(
            request({ action: "logout" }, aliceCookie, "https://other.test"),
          )
        ).status,
        403,
      );
    });
    await t.test("계정별 학습 저장소 분리, 타인의 문서 접근 차단", async () => {
      const bob = await authenticate(
        request({
          action: "signup",
          username: "bobby",
          password: "bob-password",
        }),
      );
      bobCookie = cookieOf(bob);
      const created = await createProject(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { cookie: aliceCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ sample: true, mode: "demo" }),
        }),
      );
      assert.equal(
        created.status,
        201,
        JSON.stringify(await created.clone().json()),
      );
      projectId = (await created.json()).project.id;
      const bobProjects = await (
        await projects(
          new Request("http://localhost/api/projects", {
            headers: { cookie: bobCookie },
          }),
        )
      ).json();
      assert.equal(bobProjects.projects.length, 0);
      const denied = await project(
        new Request(`http://localhost/api/projects/${projectId}`, {
          headers: { cookie: bobCookie },
        }),
        { params: Promise.resolve({ id: projectId }) },
      );
      assert.equal(denied.status, 404);
    });
    await t.test(
      "새 계정의 채팅 초안을 저장하고 본문 없이 다시 불러온다",
      async () => {
        const context = { params: Promise.resolve({ id: projectId }) };
        const initial = await (
          await project(
            new Request(`http://localhost/api/projects/${projectId}`, {
              headers: { cookie: aliceCookie },
            }),
            context,
          )
        ).json();
        const conceptId = initial.project.concepts[0].id;
        let version = initial.project.version;
        for (const [action, extra] of [
          ["start", {}],
          ["draft", { text: "새 계정에서 저장한 설명" }],
        ] as const) {
          const response = await updateStudy(
            request(
              {
                action,
                conceptId,
                version,
                requestId: crypto.randomUUID(),
                ...extra,
              },
              aliceCookie,
            ),
            context,
          );
          assert.equal(
            response.status,
            200,
            JSON.stringify(await response.clone().json()),
          );
          version = (await response.json()).project.version;
        }
        const restored = await (
          await project(
            new Request(
              `http://localhost/api/projects/${projectId}?conceptId=${conceptId}`,
              { headers: { cookie: aliceCookie } },
            ),
            context,
          )
        ).json();
        assert.equal(
          restored.project.studies[conceptId].draft,
          "새 계정에서 저장한 설명",
        );
        assert.ok(!JSON.stringify(restored).includes(sample.pages[0].text));
      },
    );
    await t.test(
      "성공한 학습 제출만 잔디에 기록하고 중복 제출은 한 번만 센다",
      async () => {
        const context = { params: Promise.resolve({ id: projectId }) };
        const current = await (
          await project(
            new Request(`http://localhost/api/projects/${projectId}`, {
              headers: { cookie: aliceCookie },
            }),
            context,
          )
        ).json();
        const body = {
          action: "submit",
          text: "인지 부하를 내 말로 설명해 볼게",
          conceptId: current.project.concepts[0].id,
          version: current.project.version,
          requestId: crypto.randomUUID(),
        };
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await updateStudy(request(body, aliceCookie), context)).status,
            200,
          );
        const { profile } = await (
          await getProfile(request(undefined, aliceCookie))
        ).json();
        assert.equal(profile.learning.days[learningDay()], 1);
        assert.equal(profile.learning.currentStreak, 1);
        assert.equal(profile.learning.totalMessages, 1);
        const { profile: other } = await (
          await getProfile(request(undefined, bobCookie))
        ).json();
        assert.equal(other.learning.totalMessages, 0);
        assert.equal((await getProfile(request())).status, 401);
      },
    );
    await t.test(
      "닉네임과 관심 요금제 저장은 본인만 변경하며 결제 권한은 주지 않는다",
      async () => {
        const response = await saveProfile(
          request({ action: "nickname", nickname: "배우는 사람" }, aliceCookie),
        );
        assert.equal(response.status, 200);
        assert.equal(
          (
            await saveProfile(
              request({ action: "plan", preference: "plus" }, aliceCookie),
            )
          ).status,
          200,
        );
        const { profile } = await (
          await getProfile(request(undefined, aliceCookie))
        ).json();
        assert.equal(profile.user.nickname, "배우는 사람");
        assert.equal(profile.plan.current, "free");
        assert.equal(profile.plan.preference, "plus");
        assert.equal(profile.plan.billingAvailable, false);
        assert.equal(
          (
            await saveProfile(
              request(
                { action: "nickname", nickname: "가로채기", userId: aliceId },
                bobCookie,
              ),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await saveProfile(
              request({ action: "nickname", nickname: "" }, aliceCookie),
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "현재 비밀번호를 확인한 뒤 변경하고 기존 세션을 폐기한다",
      async () => {
        assert.equal(
          (
            await saveProfile(
              request(
                {
                  action: "password",
                  currentPassword: "wrong",
                  password: "bob-new-password",
                },
                bobCookie,
              ),
            )
          ).status,
          401,
        );
        const response = await saveProfile(
          request(
            {
              action: "password",
              currentPassword: "bob-password",
              password: "bob-new-password",
            },
            bobCookie,
          ),
        );
        assert.equal(
          response.status,
          200,
          JSON.stringify(await response.clone().json()),
        );
        assert.equal(
          (await (await session(request(undefined, bobCookie))).json()).user,
          null,
        );
        bobCookie = cookieOf(response);
        assert.ok(
          (await (await session(request(undefined, bobCookie))).json()).user,
        );
        assert.equal(
          (
            await authenticate(
              request({
                action: "login",
                username: "bobby",
                password: "bob-password",
              }),
            )
          ).status,
          401,
        );
      },
    );
    await t.test(
      "복구코드 재설정은 이전 세션과 코드를 폐기하고 새 세션을 발급",
      async () => {
        const recovered = await authenticate(
          request({
            action: "recover",
            username: "alice",
            password: "new-alice-password",
            recoveryCode: aliceRecovery,
          }),
        );
        assert.equal(
          recovered.status,
          200,
          JSON.stringify(await recovered.clone().json()),
        );
        const result = await recovered.json();
        assert.notEqual(result.recoveryCode, aliceRecovery);
        assert.equal(
          (await (await session(request(undefined, aliceCookie))).json()).user,
          null,
        );
        aliceCookie = cookieOf(recovered);
        assert.equal(
          (
            await authenticate(
              request({
                action: "recover",
                username: "alice",
                password: "another-password",
                recoveryCode: aliceRecovery,
              }),
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await authenticate(
              request({
                action: "login",
                username: "alice",
                password: "alice-password",
              }),
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await authenticate(
              request({
                action: "login",
                username: "alice",
                password: "new-alice-password",
              }),
            )
          ).status,
          200,
        );
      },
    );
    await t.test("이전 기록은 검증된 토큰으로만 한 계정에 이관", async () => {
      const legacyProject = crypto.randomUUID();
      await db.query(
        "insert into feynloop_projects(id,user_id,state,version) values($1,$2,$3,0)",
        [
          legacyProject,
          legacyId,
          { id: legacyProject, name: "legacy.pdf", version: 0 },
        ],
      );
      await db.query(
        "insert into feynloop_sources(project_id,user_id,pages) values($1,$2,$3)",
        [legacyProject, legacyId, sample.pages],
      );
      assert.equal(
        (await importLegacy(request({ token: "wrong-token" }, aliceCookie)))
          .status,
        401,
      );
      const imported = await importLegacy(
        request({ token: "verified-legacy-token" }, aliceCookie),
      );
      assert.equal(imported.status, 200);
      assert.equal((await imported.json()).imported, 1);
      assert.equal(
        (
          await importLegacy(
            request({ token: "verified-legacy-token" }, bobCookie),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await db.query("select id from feynloop_projects where id=$1", [
            legacyProject,
          ])
        ).rows.length,
        1,
      );
    });
    await t.test(
      "분산 요청 제한·세션 만료·로그아웃·공개 DB 권한 차단",
      async () => {
        for (let i = 0; i < 8; i++)
          await authenticate(
            request({
              action: "login",
              username: "limited_user",
              password: "wrong",
            }),
          );
        const limited = await authenticate(
          request({
            action: "login",
            username: "limited_user",
            password: "wrong",
          }),
        );
        assert.equal(limited.status, 429);
        assert.ok(Number(limited.headers.get("retry-after")) > 0);
        await db.query(
          "update feynloop_sessions set expires_at=now()-interval '1 minute' where token_hash=$1",
          [secretHash(aliceCookie.split("=")[1])],
        );
        assert.equal(
          (await (await session(request(undefined, aliceCookie))).json()).user,
          null,
        );
        const loggedOut = await authenticate(
          request({ action: "logout" }, bobCookie),
        );
        assert.equal(loggedOut.status, 200);
        assert.match(loggedOut.headers.get("set-cookie")!, /Max-Age=0/);
        assert.equal(
          (await (await session(request(undefined, bobCookie))).json()).user,
          null,
        );
        await db.exec("set role anon");
        await assert.rejects(
          db.query("select * from feynloop_accounts"),
          /permission denied/,
        );
        await db.exec("reset role");
        await db.exec("set role authenticated");
        await assert.rejects(
          db.query("select feynloop_auth_attempt('x',8,900)"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
  },
);
