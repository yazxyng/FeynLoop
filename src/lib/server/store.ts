import { database as admin } from "./database";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  open,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Identity } from "./http";
import type { StoredProject, PrivateProject } from "./models";
import { ApiError } from "./errors";
async function directory(id: Identity) {
  const root =
    process.env.FEYNLOOP_DATA_DIR || join(process.cwd(), ".feynloop-data");
  const folder = join(
    root,
    createHash("sha256").update(id.owner).digest("hex"),
  );
  await mkdir(folder, { recursive: true, mode: 0o700 });
  return folder;
}
async function read<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new ApiError(404, "프로젝트를 찾을 수 없습니다.");
    throw e;
  }
}
async function atomic(path: string, value: unknown) {
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export async function listProjects(id: Identity): Promise<PrivateProject[]> {
  if (id.userId) {
    const { data, error } = await admin()
      .from(id.account ? "feynloop_account_projects" : "feynloop_projects")
      .select("state")
      .eq("user_id", id.userId)
      .order("updated_at", { ascending: false });
    if (error)
      throw new ApiError(
        503,
        "저장소를 읽지 못했습니다. Supabase v2 마이그레이션을 확인해 주세요.",
      );
    return (data || []).map((r) => r.state as PrivateProject);
  }
  const folder = await directory(id);
  const files = (await readdir(folder)).filter((f) =>
    f.endsWith(".state.json"),
  );
  return (
    await Promise.all(files.map((f) => read<PrivateProject>(join(folder, f))))
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function loadProject(
  id: Identity,
  projectId: string,
): Promise<StoredProject> {
  if (id.userId) {
    const client = admin();
    const { data, error } = await client
      .from(id.account ? "feynloop_account_projects" : "feynloop_projects")
      .select("state,file_path")
      .eq("id", projectId)
      .eq("user_id", id.userId)
      .maybeSingle();
    if (error) throw new ApiError(503, "프로젝트를 읽지 못했습니다.");
    if (!data) throw new ApiError(404, "프로젝트를 찾을 수 없습니다.");
    const source = await client
      .from(id.account ? "feynloop_account_sources" : "feynloop_sources")
      .select("pages")
      .eq("project_id", projectId)
      .eq("user_id", id.userId)
      .single();
    if (source.error) throw new ApiError(503, "문서 근거를 읽지 못했습니다.");
    return {
      owner: id.owner,
      project: data.state,
      pages: source.data.pages,
      filePath: data.file_path,
    };
  }
  const folder = await directory(id);
  const project = await read<PrivateProject>(
    join(folder, projectId + ".state.json"),
  );
  const source = await read<{ pages: StoredProject["pages"] }>(
    join(folder, projectId + ".source.json"),
  );
  return { owner: id.owner, project, pages: source.pages };
}
export async function createProject(
  id: Identity,
  record: StoredProject,
  file?: File,
) {
  if (id.userId) {
    const client = admin();
    const path = file ? `${id.userId}/${record.project.id}.pdf` : null;
    if (file) {
      const uploaded = await client.storage
        .from("pdfs")
        .upload(path!, file, { contentType: "application/pdf" });
      if (uploaded.error) throw new ApiError(503, "PDF를 저장하지 못했습니다.");
    }
    const { error } = await client.rpc(
      id.account
        ? "create_feynloop_account_project"
        : "create_feynloop_project",
      {
        p_id: record.project.id,
        p_user_id: id.userId,
        p_state: record.project,
        p_pages: record.pages,
        p_file_path: path,
      },
    );
    if (error) {
      if (path) await client.storage.from("pdfs").remove([path]);
      throw new ApiError(
        503,
        "프로젝트를 저장하지 못했습니다. Supabase v2 마이그레이션을 확인해 주세요.",
      );
    }
    return;
  }
  const folder = await directory(id);
  await atomic(join(folder, record.project.id + ".source.json"), {
    pages: record.pages,
  });
  await atomic(join(folder, record.project.id + ".state.json"), record.project);
}
export async function updateProject(
  id: Identity,
  project: PrivateProject,
  expected: number,
) {
  if (id.userId) {
    const { data, error } = await admin()
      .from(id.account ? "feynloop_account_projects" : "feynloop_projects")
      .update({
        state: project,
        version: project.version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id)
      .eq("user_id", id.userId)
      .eq("version", expected)
      .select("id");
    if (error) throw new ApiError(503, "학습 기록을 저장하지 못했습니다.");
    if (!data?.length)
      throw new ApiError(
        409,
        "다른 화면에서 기록이 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
      );
    return;
  }
  const path = join(await directory(id), project.id + ".state.json");
  const current = await read<PrivateProject>(path);
  if (current.version !== expected)
    throw new ApiError(
      409,
      "기록이 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
    );
  await atomic(path, project);
}
const activeCloudMutations = new Set<string>();
export async function withProjectLock<T>(
  id: Identity,
  projectId: string,
  task: () => Promise<T>,
) {
  if (id.userId) {
    const key = id.owner + ":" + projectId;
    if (activeCloudMutations.has(key))
      throw new ApiError(
        409,
        "이미 처리 중입니다. 잠시 후 다시 시도해 주세요.",
      );
    activeCloudMutations.add(key);
    try {
      return await task();
    } finally {
      activeCloudMutations.delete(key);
    }
  }
  const path = join(await directory(id), projectId + ".lock");
  let lock;
  try {
    lock = await open(path, "wx", 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new ApiError(
        409,
        "이미 처리 중입니다. 잠시 후 다시 시도해 주세요.",
      );
    throw e;
  }
  try {
    return await task();
  } finally {
    await lock.close();
    await unlink(path).catch(() => {});
  }
}
