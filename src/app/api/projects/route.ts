import { readBody } from "@/lib/server/request-body";
import { limitUsage } from "@/lib/server/usage-limit";
import { z } from "zod";
import {
  identity,
  json,
  failure,
  guardOrigin,
  readJson,
} from "@/lib/server/http";
import { listProjects, createProject } from "@/lib/server/store";
import { sample } from "@/lib/server/demo";
import { present } from "@/lib/server/learning";
import { projectMode } from "@/lib/server/project-mode";
import { extractConcepts } from "@/lib/server/learning-ai";
import { extractPdf, MAX_PDF_BYTES } from "@/lib/pdf";
import { projectInputSchema, textSourceSchema } from "@/lib/source-input";
import { ApiError } from "@/lib/server/errors";
import type { StoredProject, SourcePage } from "@/lib/server/models";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(req: Request) {
  try {
    const id = await identity(req);
    return json(
      { projects: (await listProjects(id)).map((p) => present(p)) },
      id,
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const id = await identity(req);
    await limitUsage(id, "import");
    let name: string, pages: SourcePage[], concepts;
    let file: File | undefined;
    let sourceType: "pdf" | "text" = "pdf";
    let mode: "demo" | "live" = "demo";
    const example = req.headers
      .get("content-type")
      ?.includes("application/json");
    if (example) {
      const input = await readJson(req, 20000);
      const parsed = (
        input?.source === "text" ? textSourceSchema : projectInputSchema
      ).safeParse(input);
      if (!parsed.success)
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message || "자료 입력을 확인해 주세요.",
        );
      const body = parsed.data;
      mode = projectMode(id, body.mode);
      if ("source" in body) {
        sourceType = "text";
        name = body.title;
        pages = [{ number: 1, text: body.text }];
        concepts = await extractConcepts(pages, mode === "live");
      } else {
        name = sample.name;
        pages = structuredClone(sample.pages);
        concepts =
          mode === "live"
            ? await extractConcepts(pages, true)
            : structuredClone(sample.concepts);
      }
    } else {
      if (!req.headers.get("content-type")?.startsWith("multipart/form-data;"))
        throw new ApiError(415, "PDF 파일 업로드 형식이 올바르지 않습니다.");
      const bytes = await readBody(req, MAX_PDF_BYTES + 100000, 30_000);
      const form = await new Request(req.url, {
        method: "POST",
        headers: { "Content-Type": req.headers.get("content-type") || "" },
        body: bytes,
      }).formData();
      mode = projectMode(
        id,
        z.enum(["demo", "live"]).parse(form.get("mode") || "demo"),
      );
      const uploaded = form.get("file");
      if (!(uploaded instanceof File))
        throw new ApiError(400, "PDF 파일이 필요합니다.");
      file = uploaded;
      name = file.name.slice(0, 200);
      try {
        pages = await extractPdf(file);
      } catch (e) {
        throw new ApiError(
          400,
          e instanceof Error ? e.message : "PDF를 분석하지 못했습니다.",
        );
      }
      const live = mode === "live";
      concepts = await extractConcepts(pages, live);
    }
    const record: StoredProject = {
      owner: id.owner,
      pages,
      project: {
        id: crypto.randomUUID(),
        name,
        sourceType,
        createdAt: new Date().toISOString(),
        pageCount: pages.length,
        concepts,
        studies: {},
        version: 0,
        mode,
        receipts: [],
      },
    };
    await createProject(id, record, file);
    return json({ project: present(record.project) }, id, 201);
  } catch (e) {
    return failure(e);
  }
}
