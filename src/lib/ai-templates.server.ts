/**
 * Studio AI — tingkat Template (tanpa model AI).
 *  - `createTemplateJob`: potong kredit, simpan pekerjaan berstatus `queued` (provider `render`).
 *  - Mesin render (VPS, `render-worker/`) memakai token untuk `claimRenderJob` → render → `completeRenderJob`
 *    (unggah MP4) atau `failRenderJob`. Hanya koneksi keluar dari VPS; Qalling tidak menghubungi VPS.
 *  - Batas waktu & refund ditangani `processJob` di ai-studio.server.ts.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { execute, executeOne, result, transaction, uuid } from "@/integrations/mysql/pool";
import {
  finalSeconds,
  NARRATION,
  PHOTOS,
  MUSIC_MOOD_KEYS,
  TEMPLATE_DURATIONS,
  TEMPLATE_LIMITS,
  TEMPLATE_RATIOS,
  TEMPLATE_SECONDS,
  TEMPLATES,
  templateCredits,
  type TemplateText,
} from "./ai-templates";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const BLOCKED = /\b(nude|naked|nsfw|porn|sex|bugil|telanjang|porno)\b/i;

export interface CreateTemplateInput {
  workspaceId: string;
  userId: string;
  sourceMediaId: string | null;
  items?: { mediaId: string; title: string; price: string }[];
  sound?: boolean;
  narrationPath?: string | null;
  narrationSeconds?: number;
  template: string;
  text: TemplateText;
  aspectRatio: string;
  seconds?: number;
  /** Suasana musik; "auto"/kosong = sesuai template. */
  mood?: string;
}

export async function createTemplateJob(i: CreateTemplateInput) {
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(i.workspaceId, i.userId))) throw new Error("Akses ditolak");
  const { studioAccess, getStudioSettings, workspaceTenant } = await import("./ai-studio.server");
  const access = await studioAccess(i.workspaceId, i.userId);
  if (!access.available || !access.template.available)
    throw new Error("Video Template belum tersedia");
  const s = await getStudioSettings();
  if (!s.has_worker_token) throw new Error("Mesin render belum disiapkan di Super Admin");
  if (access.used_today >= s.daily_limit)
    throw new Error(`Batas harian tercapai (${s.daily_limit} video per 24 jam)`);
  const tpl = TEMPLATES.find((t) => t.key === i.template);
  if (!tpl) throw new Error("Template tidak dikenal");
  const text: TemplateText = {
    headline: i.text.headline.trim().slice(0, TEMPLATE_LIMITS.headline),
    subline: i.text.subline.trim().slice(0, TEMPLATE_LIMITS.subline),
    badge: i.text.badge.trim().slice(0, TEMPLATE_LIMITS.badge),
    cta: i.text.cta.trim().slice(0, TEMPLATE_LIMITS.cta),
    // "auto" = warna dari foto (dihitung mesin render); warna tegas tetap boleh (mis. lewat MCP).
    accent: /^#[0-9A-Fa-f]{6}$/.test(i.text.accent) ? i.text.accent : "auto",
  };
  if (!text.headline) throw new Error("Judul wajib diisi");
  text.sound = i.sound !== false;
  if (i.mood && i.mood !== "auto" && MUSIC_MOOD_KEYS.includes(i.mood))
    text.mood = i.mood as TemplateText["mood"];
  if (!(TEMPLATE_RATIOS as readonly string[]).includes(i.aspectRatio))
    throw new Error("Rasio tidak didukung");
  const chosen = (TEMPLATE_DURATIONS as readonly number[]).includes(i.seconds ?? 0)
    ? (i.seconds as number)
    : TEMPLATE_SECONDS;

  const okPhoto = async (mediaId: string) => {
    const m = await executeOne<{ id: string; mime_type: string | null }>(
      "SELECT id, mime_type FROM crm_media WHERE id = ? AND workspace_id = ?",
      [mediaId, i.workspaceId],
    );
    if (!m) throw new Error("Foto tidak ditemukan di Media workspace ini");
    if (!["image/jpeg", "image/png", "image/webp"].includes(m.mime_type ?? ""))
      throw new Error("Pilih foto JPG, PNG, atau WebP");
    return m.id;
  };
  // Semua template menerima 1–8 foto berurutan (Pengumuman: 0–8). `sourceMediaId` lama = satu foto.
  const raw = (i.items ?? []).length
    ? (i.items ?? [])
    : i.sourceMediaId
      ? [{ mediaId: i.sourceMediaId, title: "", price: "" }]
      : [];
  if (raw.length > PHOTOS.max) throw new Error(`Maksimal ${PHOTOS.max} foto`);
  if (!raw.length && tpl.photos === "required") throw new Error("Pilih minimal 1 foto");
  text.items = [];
  for (const it of raw) {
    const title = it.title.trim().slice(0, PHOTOS.title);
    const price = it.price.trim().slice(0, PHOTOS.label);
    if (BLOCKED.test(`${title} ${price}`))
      throw new Error("Teks mengandung kata yang tidak diizinkan");
    text.items.push({ media_id: await okPhoto(it.mediaId), title, price });
  }
  const sourceId = text.items[0]?.media_id ?? null;
  if (BLOCKED.test(`${text.headline} ${text.subline} ${text.badge} ${text.cta}`))
    throw new Error("Teks mengandung kata yang tidak diizinkan");

  if (i.narrationPath) {
    if (!/^ai\/narration\/[0-9a-f-]{36}-[^/]+\.(mp3|m4a|wav)$/i.test(i.narrationPath))
      throw new Error("Berkas narasi tidak valid");
    const { readWorkspaceFile } = await import("./files.server");
    await readWorkspaceFile(i.narrationPath).catch(() => {
      throw new Error("Berkas narasi tidak ditemukan, unggah ulang");
    });
    const len = Number(i.narrationSeconds) || 0;
    if (len <= 0 || len > NARRATION.maxSeconds + 0.5)
      throw new Error(`Narasi maksimal ${NARRATION.maxSeconds} detik`);
    text.narration = i.narrationPath;
  }
  // Durasi akhir: pilihan pengguna, dipanjangkan oleh jumlah foto atau narasi; harga mengikuti durasi akhir.
  const seconds = finalSeconds(
    tpl.key,
    text.items.length,
    chosen,
    text.narration ? Number(i.narrationSeconds) || 0 : 0,
  );
  const { assertMediaQuota } = await import("./qalling-quota.server");
  await assertMediaQuota(i.workspaceId, { size_bytes: 3_000_000, mime_type: "video/mp4" });

  const tenantId = await workspaceTenant(i.workspaceId);
  const credits = templateCredits(s.template_prices, seconds);
  const id = uuid();
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO ai_jobs (id, workspace_id, tenant_id, user_id, kind, status, tier, provider, model, style, prompt, user_note,
                            source_media_id, duration_s, aspect_ratio, credits, charged_idr, est_cost_usd, is_admin_test, charge_source)
       VALUES (?, ?, ?, ?, 'template_video', 'queued', 'template', 'render', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'credits')`,
      [
        id,
        i.workspaceId,
        tenantId,
        i.userId,
        tpl.key,
        tpl.key,
        JSON.stringify(text),
        text.headline,
        sourceId,
        seconds,
        i.aspectRatio,
        credits,
        access.mode === "admin_preview" || !s.template_enabled ? 1 : 0,
      ],
    );
    const { creditPostOn } = await import("./ai-credits.server");
    try {
      await creditPostOn(conn, {
        tenantId,
        delta: -credits,
        kind: "usage",
        ref: id,
        idem: `ai-job:${id}`,
        description: `Video Template (${tpl.name})`,
        actor: i.userId,
      });
    } catch (e) {
      if ((e as Error).message === "insufficient_credits")
        throw new Error(`Kredit tidak cukup. Butuh ${credits} kredit, beli paket kredit dulu.`);
      throw e;
    }
  });
  return { id, credits };
}

/* ------------------------------ mesin render ------------------------------ */

/** Buat token baru (menggantikan yang lama). Token asli hanya dikembalikan sekali di sini. */
export async function rotateWorkerToken(actor: string): Promise<string> {
  const token = `qrw_${randomBytes(32).toString("hex")}`;
  await execute(
    "UPDATE ai_studio_settings SET worker_token_hash = ?, worker_seen_at = NULL, worker_info = NULL, updated_by = ? WHERE id = 'platform'",
    [sha(token), actor],
  );
  return token;
}

/** Periksa header `Authorization: Bearer <token>` mesin render. */
export async function authenticateWorker(request: Request): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return false;
  const row = await executeOne<{ worker_token_hash: string | null }>(
    "SELECT worker_token_hash FROM ai_studio_settings WHERE id = 'platform'",
  );
  if (!row?.worker_token_hash) return false;
  const a = Buffer.from(sha(m[1]), "hex");
  const b = Buffer.from(row.worker_token_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Catat mesin render aktif, lalu serahkan pekerjaan Template tertua yang masih antre (bila ada). */
export async function claimRenderJob(
  origin: string,
  info: string,
  metrics?: Record<string, unknown> | null,
) {
  // Metrik server render (v2.1.0+) untuk halaman Kesehatan Sistem; dibatasi ukurannya.
  const m = metrics && typeof metrics === "object" ? JSON.stringify(metrics).slice(0, 4000) : null;
  await execute(
    "UPDATE ai_studio_settings SET worker_seen_at = NOW(6), worker_info = ?, worker_metrics = COALESCE(?, worker_metrics) WHERE id = 'platform'",
    [info.slice(0, 255), m && m.length < 4000 ? m : null],
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const j = await executeOne<Record<string, unknown>>(
      `SELECT j.id, j.model, j.prompt, j.aspect_ratio, j.duration_s, m.file_path
         FROM ai_jobs j LEFT JOIN crm_media m ON m.id = j.source_media_id
        WHERE j.provider = 'render' AND j.status = 'queued'
        ORDER BY j.created_at LIMIT 1`,
    );
    if (!j) return null;
    const r = await result(
      "UPDATE ai_jobs SET status = 'processing', progress = NULL, claimed_at = NOW(6), submitted_at = NOW(6) WHERE id = ? AND status = 'queued'",
      [String(j.id)],
    );
    if (!r.affectedRows) continue; // diambil mesin lain — coba pekerjaan berikutnya
    const { signMediaUrl } = await import("./crm-media.server");
    const { items, narration, ...text } = (
      typeof j.prompt === "string" ? JSON.parse(j.prompt) : j.prompt
    ) as TemplateText;
    // Slideshow Katalog: tautan bertanda tangan untuk tiap foto.
    const slides: { image_url: string; title: string; price: string }[] = [];
    for (const it of items ?? []) {
      const m = await executeOne<{ file_path: string }>(
        "SELECT file_path FROM crm_media WHERE id = ?",
        [it.media_id],
      );
      if (m)
        slides.push({
          image_url: signMediaUrl(origin, m.file_path, 3600),
          title: it.title,
          price: it.price,
        });
    }
    return {
      id: String(j.id),
      template: String(j.model),
      image_url: j.file_path ? signMediaUrl(origin, String(j.file_path), 3600) : null,
      items: slides,
      audio_ext: narration ? (narration.split(".").pop() ?? "mp3").toLowerCase() : null,
      props: {
        ...text,
        // Benih variasi musik: tiap video beda nada/tempo/pola walau template sama.
        seed: parseInt(String(j.id).replace(/-/g, "").slice(0, 8), 16) || 1,
        ratio: String(j.aspect_ratio),
        seconds: Number(j.duration_s) || TEMPLATE_SECONDS,
      },
    };
  }
  return null;
}

/** Rekaman narasi untuk pekerjaan yang sedang dirender (diunduh mesin render). */
export async function renderJobAudio(jobId: string) {
  const j = await executeOne<{ prompt: unknown }>(
    "SELECT prompt FROM ai_jobs WHERE id = ? AND provider = 'render' AND status = 'processing'",
    [jobId],
  );
  if (!j) return null;
  const text = (typeof j.prompt === "string" ? JSON.parse(j.prompt) : j.prompt) as TemplateText;
  if (!text.narration) return null;
  const { readWorkspaceFile, mimeFromPath } = await import("./files.server");
  return { bytes: await readWorkspaceFile(text.narration), mime: mimeFromPath(text.narration) };
}

/** Terima MP4 dari mesin render → simpan ke Media. Aman bila dipanggil ganda. */
export async function completeRenderJob(jobId: string, bytes: Buffer) {
  if (bytes.length < 1000 || bytes.subarray(4, 8).toString("latin1") !== "ftyp")
    throw new Error("Berkas bukan MP4 yang valid");
  const j = await executeOne<Record<string, unknown>>(
    "SELECT * FROM ai_jobs WHERE id = ? AND provider = 'render'",
    [jobId],
  );
  if (!j) throw new Error("Pekerjaan tidak ditemukan");
  if (j.status === "done") return { ok: true };
  const r = await result(
    "UPDATE ai_jobs SET status = 'saving' WHERE id = ? AND status = 'processing'",
    [jobId],
  );
  if (!r.affectedRows) throw new Error("Pekerjaan sudah tidak aktif");
  const { saveVideoBytes, failJob } = await import("./ai-studio.server");
  try {
    const mediaId = await saveVideoBytes(j, bytes);
    await execute(
      "UPDATE ai_jobs SET status = 'done', result_media_id = ?, finished_at = NOW(6) WHERE id = ?",
      [mediaId, jobId],
    );
  } catch (e) {
    await failJob(jobId, `Gagal menyimpan hasil: ${(e as Error).message}`);
    throw e;
  }
  return { ok: true };
}

export async function failRenderJob(jobId: string, error: string) {
  const j = await executeOne<{ id: string }>(
    "SELECT id FROM ai_jobs WHERE id = ? AND provider = 'render' AND status = 'processing'",
    [jobId],
  );
  if (!j) return { ok: true };
  const { failJob } = await import("./ai-studio.server");
  await failJob(jobId, `Render gagal: ${error}`);
  return { ok: true };
}
