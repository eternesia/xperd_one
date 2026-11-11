/**
 * Studio AI Qalling — inti server.
 *  - Saklar `ai_studio_settings.enabled` (bawaan OFF). Saat OFF hanya Super Admin yang bisa memakai (mode uji).
 *  - Video memotong saldo kredit AI (`ai-credits.server.ts`, kunci `ai-job:<id>`), dikembalikan otomatis
 *    (`ai-job:<id>:refund`) bila gagal. Pekerjaan lama (`charge_source = 'wallet'`) di-refund ke saldo Rupiah.
 *  - Hasil diunduh dari penyedia lalu disimpan ke Media workspace (kuota penyimpanan berlaku), label AI.
 */
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import {
  AI_TIERS,
  DEFAULT_STYLES,
  DEFAULT_TIERS,
  tierCredits,
  type StyleConfig,
  type AiTier,
  type StudioAccess,
  type TierConfig,
} from "./ai-studio";
import { PROVIDERS } from "./ai-studio-providers.server";

export interface StudioSettings {
  enabled: boolean;
  fal_api_key: string | null;
  atlas_api_key: string | null;
  tiers: Record<AiTier, TierConfig>;
  styles: StyleConfig[];
  daily_limit: number;
  usd_idr: number;
}

const parseJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

export async function getStudioSettings(): Promise<StudioSettings> {
  await execute("INSERT IGNORE INTO ai_studio_settings (id, enabled) VALUES ('platform', 0)");
  const r = await executeOne<Record<string, unknown>>(
    "SELECT * FROM ai_studio_settings WHERE id = 'platform'",
  );
  const saved = (r?.tiers ? parseJson(r.tiers) : {}) as Partial<
    Record<AiTier, Partial<TierConfig>>
  >;
  const tiers = Object.fromEntries(
    AI_TIERS.map((t) => [t, { ...DEFAULT_TIERS[t], ...(saved?.[t] ?? {}) }]),
  ) as Record<AiTier, TierConfig>;
  return {
    enabled: Number(r?.enabled ?? 0) === 1,
    fal_api_key: (r?.fal_api_key as string) || null,
    atlas_api_key: (r?.atlas_api_key as string) || null,
    tiers,
    styles: parseStyles(r?.styles),
    daily_limit: Number(r?.daily_limit ?? 10),
    usd_idr: Number(r?.usd_idr ?? 16500),
  };
}

function parseStyles(raw: unknown): StyleConfig[] {
  const saved = (raw ? parseJson(raw) : null) as StyleConfig[] | null;
  const ok = (saved ?? []).filter((x) => x?.key && x?.name && x?.prompt);
  return ok.length ? ok : DEFAULT_STYLES;
}

const providerKey = (s: StudioSettings, p: string) =>
  p === "atlas" ? s.atlas_api_key : s.fal_api_key;

async function isAdmin(userId: string) {
  const { hasRole } = await import("./auth-context.server");
  return hasRole(userId, "admin");
}

async function workspaceTenant(workspaceId: string): Promise<string> {
  const r = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1",
    [workspaceId],
  );
  if (!r?.tenant_id) throw new Error("Workspace tidak ditemukan");
  return r.tenant_id;
}

async function usedToday(workspaceId: string): Promise<number> {
  const r = await executeOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM ai_jobs WHERE workspace_id = ? AND created_at >= NOW(6) - INTERVAL 1 DAY",
    [workspaceId],
  );
  return Number(r?.n ?? 0);
}

/** Apakah pengguna ini boleh memakai Studio di workspace ini sekarang. */
export async function studioAccess(workspaceId: string, userId: string): Promise<StudioAccess> {
  const s = await getStudioSettings();
  const admin = await isAdmin(userId);
  const mode: StudioAccess["mode"] = s.enabled ? "live" : admin ? "admin_preview" : "off";
  const tiers = AI_TIERS.filter((t) => s.tiers[t].enabled).map((t) => ({
    tier: t,
    credits_5s: s.tiers[t].credits_5s,
    credits_10s: s.tiers[t].credits_10s,
  }));
  if (mode === "off")
    return {
      available: false,
      mode,
      credits: 0,
      balance_idr: 0,
      can_buy: false,
      packs: [],
      daily_limit: 0,
      used_today: 0,
      tiers: [],
      styles: [],
      can_write: false,
    };
  const tenantId = await workspaceTenant(workspaceId);
  const w = await executeOne<{ balance_idr: number }>(
    "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
    [tenantId],
  );
  const { getCredits, getPacks } = await import("./ai-credits.server");
  const { canManageTenantWallet } = await import("./wallet.server");
  return {
    available: true,
    mode,
    credits: await getCredits(tenantId),
    balance_idr: Number(w?.balance_idr ?? 0),
    can_buy: await canManageTenantWallet(tenantId, userId),
    packs: await getPacks(),
    daily_limit: s.daily_limit,
    used_today: await usedToday(workspaceId),
    tiers,
    styles: s.styles
      .filter((x) => x.enabled)
      .map(({ key, name, name_en, hint, hint_en }) => ({ key, name, name_en, hint, hint_en })),
    can_write: await (await import("./auth-context.server")).canWriteWorkspace(workspaceId, userId),
  };
}

/* ------------------------------ prompt ------------------------------ */

const BLOCKED = /\b(nude|naked|nsfw|porn|sex|bugil|telanjang|porno|gore|blood|darah)\b/i;

/** Keterangan pengguna (sering bahasa Indonesia) → bahasa Inggris singkat; gagal = pakai apa adanya. */
async function translateNote(note: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return note;
  try {
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { text } = await generateText({
      model: createLovableAiGatewayProvider(key)("google/gemini-3.6-flash"),
      system:
        "Translate the user's note into a short English video-motion instruction. Output only the translation, no quotes.",
      prompt: note,
      abortSignal: AbortSignal.timeout(10_000),
    });
    return text.trim().slice(0, 400) || note;
  } catch {
    return note;
  }
}

async function buildPrompt(stylePrompt: string, note?: string | null): Promise<string> {
  const parts = [stylePrompt];
  if (note) parts.push(await translateNote(note));
  parts.push("keep the product's shape, logo and printed text exactly as in the photo");
  return parts.join(". ");
}

/* --------------------------- buat pekerjaan --------------------------- */

export interface CreateJobInput {
  workspaceId: string;
  userId: string;
  sourceMediaId: string;
  style: string;
  note?: string;
  tier: AiTier;
  duration: number;
  aspectRatio: string;
  imageOrigin: string;
}

export async function createVideoJob(i: CreateJobInput) {
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(i.workspaceId, i.userId))) throw new Error("Akses ditolak");
  const access = await studioAccess(i.workspaceId, i.userId);
  if (!access.available) throw new Error("Studio AI belum tersedia");
  const s = await getStudioSettings();
  const cfg = s.tiers[i.tier];
  if (!cfg?.enabled) throw new Error("Tingkat ini belum dibuka");
  const styleCfg = s.styles.find((x) => x.key === i.style && x.enabled);
  if (!styleCfg) throw new Error("Gaya ini tidak tersedia lagi. Pilih gaya lain.");
  const key = providerKey(s, cfg.provider);
  if (!key) throw new Error(`API key ${cfg.provider} belum diisi di Super Admin`);
  if (access.used_today >= s.daily_limit)
    throw new Error(`Batas harian tercapai (${s.daily_limit} video per 24 jam)`);
  if (i.note && BLOCKED.test(i.note))
    throw new Error("Keterangan mengandung kata yang tidak diizinkan");

  const media = await executeOne<{ id: string; file_path: string; mime_type: string | null }>(
    "SELECT id, file_path, mime_type FROM crm_media WHERE id = ? AND workspace_id = ?",
    [i.sourceMediaId, i.workspaceId],
  );
  if (!media) throw new Error("Foto tidak ditemukan di Media workspace ini");
  if (!["image/jpeg", "image/png", "image/webp"].includes(media.mime_type ?? ""))
    throw new Error("Pilih foto JPG, PNG, atau WebP");

  // Cek awal kuota penyimpanan (perkiraan 8 MB per video) supaya kredit tidak terpotong sia-sia.
  const { assertMediaQuota } = await import("./qalling-quota.server");
  await assertMediaQuota(i.workspaceId, { size_bytes: 8_000_000, mime_type: "video/mp4" });

  const tenantId = await workspaceTenant(i.workspaceId);
  const credits = tierCredits(cfg, i.duration);
  const prompt = await buildPrompt(styleCfg.prompt, i.note);
  const id = uuid();
  const adminTest = access.mode === "admin_preview" ? 1 : 0;

  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO ai_jobs (id, workspace_id, tenant_id, user_id, status, tier, provider, model, style, prompt, user_note,
                            source_media_id, duration_s, aspect_ratio, credits, charged_idr, est_cost_usd, is_admin_test, charge_source)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'credits')`,
      [
        id,
        i.workspaceId,
        tenantId,
        i.userId,
        i.tier,
        cfg.provider,
        cfg.model,
        i.style,
        prompt,
        i.note || null,
        media.id,
        i.duration,
        i.aspectRatio,
        credits,
        Number((cfg.cost_usd_per_s * i.duration).toFixed(4)),
        adminTest,
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
        description: `Video ${i.duration} detik (${i.tier})`,
        actor: i.userId,
      });
    } catch (e) {
      if ((e as Error).message === "insufficient_credits")
        throw new Error(`Kredit tidak cukup. Butuh ${credits} kredit, beli paket kredit dulu.`);
      throw e;
    }
  });

  try {
    const { signMediaUrl } = await import("./crm-media.server");
    const sub = await PROVIDERS[cfg.provider].submit(key, {
      model: cfg.model,
      imageParam: cfg.image_param,
      imageUrl: signMediaUrl(i.imageOrigin, media.file_path, 6 * 3600),
      prompt,
      duration: i.duration,
      aspectRatio: i.aspectRatio,
      extra: cfg.extra,
    });
    await execute(
      `UPDATE ai_jobs SET status = 'processing', external_id = ?, status_url = ?, response_url = ?, submitted_at = NOW(6)
        WHERE id = ?`,
      [sub.externalId, sub.statusUrl, sub.responseUrl, id],
    );
  } catch (e) {
    await failJob(id, (e as Error).message);
    throw new Error("Penyedia AI menolak permintaan. Kredit sudah dikembalikan.");
  }
  return { id, credits };
}

/* ------------------------------ gagal + refund ------------------------------ */

export async function failJob(jobId: string, error: string) {
  await transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT * FROM ai_jobs WHERE id = ? FOR UPDATE", [jobId]);
    const j = (rows as Row[])[0];
    if (!j || j.status === "done" || j.status === "failed") return;
    if (!Number(j.refunded) && j.charge_source === "credits" && Number(j.credits) > 0) {
      const { creditPostOn } = await import("./ai-credits.server");
      await creditPostOn(conn, {
        tenantId: j.tenant_id,
        delta: Number(j.credits),
        kind: "refund",
        ref: jobId,
        idem: `ai-job:${jobId}:refund`,
        description: "Pengembalian kredit (video gagal)",
        actor: j.user_id,
      });
    } else if (!Number(j.refunded) && Number(j.charged_idr) > 0) {
      // Pekerjaan lama yang dibayar dari saldo Rupiah.
      const { walletPostEntryOn } = await import("./wallet.server");
      await walletPostEntryOn(conn, {
        tenantId: j.tenant_id,
        type: "refund",
        amount: Number(j.charged_idr),
        product: "qalling",
        ref: jobId,
        idem: `ai-job:${jobId}:refund`,
        description: "Studio AI: pengembalian kredit (gagal)",
        actor: j.user_id,
      });
    }
    await conn.execute(
      "UPDATE ai_jobs SET status = 'failed', refunded = 1, error = ?, finished_at = NOW(6) WHERE id = ?",
      [error.slice(0, 2000), jobId],
    );
  });
}

/* ------------------------------ pantau & simpan ------------------------------ */

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MIN = 30;

/** Periksa satu pekerjaan di penyedia; bila selesai, unduh & simpan ke Media. Aman dipanggil berulang/bersamaan. */
export async function processJob(jobId: string): Promise<void> {
  const j = await executeOne<Row>("SELECT * FROM ai_jobs WHERE id = ?", [jobId]);
  if (!j || !["queued", "processing", "saving"].includes(j.status)) return;
  const ageMin = (Date.now() - new Date(j.created_at).getTime()) / 60_000;
  if (j.status === "saving") {
    // Proses penyimpanan terputus (mis. server restart saat mengunduh) → kembalikan kredit setelah batas waktu.
    if (ageMin > TIMEOUT_MIN) await failJob(jobId, "Penyimpanan hasil terputus");
    return;
  }
  if (j.status === "queued") {
    // Tidak pernah sampai ke penyedia (mis. server mati di tengah) → kembalikan kredit.
    if (ageMin > 5) await failJob(jobId, "Tidak terkirim ke penyedia");
    return;
  }
  if (ageMin > TIMEOUT_MIN) return failJob(jobId, `Melewati batas waktu ${TIMEOUT_MIN} menit`);

  const s = await getStudioSettings();
  const key = providerKey(s, j.provider);
  if (!key) return;
  const prov = PROVIDERS[j.provider as "fal" | "atlas"];
  if (!prov) return failJob(jobId, `Penyedia tidak dikenal: ${j.provider}`);
  let res;
  try {
    res = await prov.check(key, j as never);
  } catch {
    return; // gangguan jaringan sementara — coba lagi di putaran berikut
  }
  if (res.state === "pending") return;
  if (res.state === "failed") return failJob(jobId, res.error);

  // Klaim: hanya satu proses yang boleh mengunduh & menyimpan.
  const { affectedRows } = await claim(jobId);
  if (!affectedRows) return;
  try {
    const mediaId = await saveVideo(j, res.videoUrl);
    await execute(
      "UPDATE ai_jobs SET status = 'done', result_media_id = ?, finished_at = NOW(6) WHERE id = ?",
      [mediaId, jobId],
    );
  } catch (e) {
    await failJob(jobId, `Gagal menyimpan hasil: ${(e as Error).message}`);
  }
}

async function claim(jobId: string) {
  const { result } = await import("@/integrations/mysql/pool");
  return result("UPDATE ai_jobs SET status = 'saving' WHERE id = ? AND status = 'processing'", [
    jobId,
  ]);
}

async function saveVideo(j: Row, videoUrl: string): Promise<string> {
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`unduh HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES)
    throw new Error("ukuran video tidak valid");
  const { assertMediaQuota } = await import("./qalling-quota.server");
  await assertMediaQuota(j.workspace_id, { size_bytes: bytes.length, mime_type: "video/mp4" });
  const { buildFilePath, saveWorkspaceFile, MEDIA_FOLDER } = await import("./files.server");
  const mediaId = uuid();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const name = `Video AI ${j.style} ${stamp}.mp4`;
  const path = buildFilePath(MEDIA_FOLDER, name, mediaId);
  await saveWorkspaceFile(path, bytes);
  await execute(
    `INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, folder, created_by, ai_generated)
     VALUES (?, ?, ?, ?, 'video/mp4', ?, 'Studio AI', ?, 1)`,
    [mediaId, j.workspace_id, name, path, bytes.length, j.user_id],
  );
  return mediaId;
}

/** Proses semua pekerjaan yang masih berjalan (dipanggil cron dan saat pengguna membuka Studio). */
export async function processPendingJobs(workspaceId?: string, limit = 20) {
  const rows = await execute<{ id: string }>(
    `SELECT id FROM ai_jobs WHERE status IN ('queued','processing','saving') ${workspaceId ? "AND workspace_id = ?" : ""}
      ORDER BY created_at LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit)))}`,
    workspaceId ? [workspaceId] : [],
  );
  let n = 0;
  for (const r of rows) {
    await processJob(r.id).catch(() => undefined);
    n++;
  }
  return { checked: n };
}
