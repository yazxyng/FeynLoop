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
  try {
    const projectId = z
        .string()
        .uuid()
        .parse((await context.params).id),
      id = await identity(req);
    const record = await loadProject(id, projectId);
    const focus = new URL(req.url).searchParams.get("conceptId") || undefined;
    return json({ project: present(record.project, record.pages, focus) }, id);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, context: Context) {
  try {
    guardOrigin(req);
    const projectId = z
        .string()
        .uuid()
        .parse((await context.params).id),
      id = await identity(req);
    const command = commandSchema.parse(await readJson(req, 100000));
    return json({ project: await execute(id, projectId, command) }, id);
  } catch (e) {
    return failure(e);
  }
}
