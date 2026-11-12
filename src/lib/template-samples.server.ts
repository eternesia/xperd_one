/**
 * Contoh video per tipe template Studio (server-only). Super Admin memilih video hasil render
 * (pekerjaan template yang sudah selesai) sebagai contoh; berkasnya disalin ke
 * `ai/template-samples/` agar tidak hilang bila media aslinya dihapus, lalu disajikan publik
 * lewat `/api/public/template-sample?key=…`.
 */
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";
import { TEMPLATE_KEYS } from "@/lib/ai-templates";

export interface TemplateSample {
  path: string;
  ratio: string;
  updated_at: string;
}
export type SampleMap = Record<string, TemplateSample>;

const FOLDER = "ai/template-samples";

export async function loadSamples(): Promise<SampleMap> {
  const r = await executeOne<{ s: unknown }>(
    "SELECT template_samples AS s FROM ai_studio_settings WHERE id = 'platform'",
  ).catch(() => null);
  const raw = r?.s;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as SampleMap | null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

async function saveSamples(map: SampleMap) {
  await execute("INSERT IGNORE INTO ai_studio_settings (id, enabled) VALUES ('platform', 0)");
  await execute("UPDATE ai_studio_settings SET template_samples = ? WHERE id = 'platform'", [
    JSON.stringify(map),
  ]);
}

/** Untuk pengguna: kunci template → URL contoh (versi di query agar cache diperbarui). */
export async function publicSamples() {
  const map = await loadSamples();
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [
      k,
      {
        url: `/api/public/template-sample?key=${encodeURIComponent(k)}&v=${encodeURIComponent(v.updated_at)}`,
        ratio: v.ratio,
      },
    ]),
  );
}

/** Video template yang sudah selesai dirender (kandidat contoh), terbaru dulu. */
export async function sampleCandidates() {
  const rows = await execute<Record<string, unknown>>(
    `SELECT j.id, j.model AS template, j.aspect_ratio, j.duration_s, j.created_at, j.is_admin_test,
            w.name AS workspace, m.file_path, m.size_bytes
       FROM ai_jobs j
       JOIN crm_media m ON m.id = j.result_media_id
       LEFT JOIN workspaces w ON w.id = j.workspace_id
      WHERE j.kind = 'template_video' AND j.status = 'done'
      ORDER BY j.created_at DESC LIMIT 60`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    template: String(r.template),
    ratio: String(r.aspect_ratio ?? ""),
    duration: Number(r.duration_s ?? 0),
    created_at: String(r.created_at),
    admin_test: Number(r.is_admin_test) === 1,
    workspace: r.workspace ? String(r.workspace) : null,
    size: Number(r.size_bytes ?? 0),
  }));
}

export async function setSampleFromJob(key: string, jobId: string) {
  if (!TEMPLATE_KEYS.includes(key)) throw new Error("Template tidak dikenal");
  const job = await executeOne<{ model: string; aspect_ratio: string | null; file_path: string }>(
    `SELECT j.model, j.aspect_ratio, m.file_path FROM ai_jobs j JOIN crm_media m ON m.id = j.result_media_id
      WHERE j.id = ? AND j.kind = 'template_video' AND j.status = 'done'`,
    [jobId],
  );
  if (!job) throw new Error("Video tidak ditemukan atau belum selesai");
  const { readWorkspaceFile, saveWorkspaceFile, deleteWorkspaceFile } =
    await import("@/lib/files.server");
  const bytes = await readWorkspaceFile(job.file_path);
  const path = `${FOLDER}/${key}-${uuid()}.mp4`;
  await saveWorkspaceFile(path, bytes);
  const map = await loadSamples();
  const old = map[key]?.path;
  map[key] = { path, ratio: job.aspect_ratio || "9:16", updated_at: new Date().toISOString() };
  await saveSamples(map);
  if (old && old !== path) await deleteWorkspaceFile(old).catch(() => undefined);
  return map[key];
}

export async function removeSample(key: string) {
  const map = await loadSamples();
  const old = map[key]?.path;
  delete map[key];
  await saveSamples(map);
  if (old) {
    const { deleteWorkspaceFile } = await import("@/lib/files.server");
    await deleteWorkspaceFile(old).catch(() => undefined);
  }
}
