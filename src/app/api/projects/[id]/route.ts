import { withDiagnostics, setDiagnosticStage } from "@/lib/server/diagnostics";
import { z } from "zod";
import {
  identity,
  json,
  failure,
  guardOrigin,
  readJson,
} from "@/lib/server/http";
import { loadProject } from "@/lib/server/store";
import { present, execute, commandSchema } from "@/lib/server/learning";
export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  return withDiagnostics("projects.get", async () => {
    try {
      setDiagnosticStage("validate");
      const projectId = z
        .string()
        .uuid()
        .parse((await context.params).id);
      setDiagnosticStage("authenticate");
      const id = await identity(req);
      setDiagnosticStage("read-storage");
      const record = await loadProject(id, projectId);
      const focus = new URL(req.url).searchParams.get("conceptId") || undefined;
      return json(
        { project: present(record.project, record.pages, focus) },
        id,
      );
    } catch (e) {
      return failure(e);
    }
  });
}

export async function POST(req: Request, context: Context) {
  return withDiagnostics("projects.update", async () => {
    try {
      setDiagnosticStage("origin");
      guardOrigin(req);
      setDiagnosticStage("validate");
      const projectId = z
        .string()
        .uuid()
        .parse((await context.params).id);
      setDiagnosticStage("authenticate");
      const id = await identity(req);
      const body = await readJson(req, 100000);
      setDiagnosticStage("validate");
      const command = commandSchema.parse(body);
      return json({ project: await execute(id, projectId, command) }, id);
    } catch (e) {
      return failure(e);
    }
  });
}
