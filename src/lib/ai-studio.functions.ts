/** Studio AI Qalling — server function (pengguna & Super Admin). Logika inti di `ai-studio.server.ts`. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CATALOG,
  TEMPLATE_KEYS,
  TEMPLATE_LIMITS,
  TEMPLATE_RATIOS,
  TEMPLATE_SECONDS,
  TEMPLATES,
  WORKER_ONLINE_MS,
} from "./ai-templates";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import {
  AI_DURATIONS,
  AI_PROVIDERS,
  AI_RATIOS,
  AI_TIERS,
  NOTE_MAX,
  type AiJobView,
  type UserStyle,
} from "./ai-studio";

const STYLE_KEY = /^[a-z0-9_-]{2,30}$/;

/* --------------------------------- pengguna --------------------------------- */

export const getStudioAccess = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember, hasRole } = await import("./auth-context.server");
    if (
      !(await isWorkspaceMember(data.workspaceId, context.userId)) &&
      !(await hasRole(context.userId, "admin"))
    )
      throw new Error("Akses ditolak");
    const { studioAccess } = await import("./ai-studio.server");
    return studioAccess(data.workspaceId, context.userId);
  });

export const createAiVideo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        sourceMediaId: z.string().uuid(),
        style: z.string().regex(STYLE_KEY),
        note: z.string().trim().max(NOTE_MAX).optional(),
        tier: z.enum(AI_TIERS),
        duration: z.union([z.literal(AI_DURATIONS[0]), z.literal(AI_DURATIONS[1])]),
        aspectRatio: z.enum(AI_RATIOS),
        consent: z.literal(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { createVideoJob } = await import("./ai-studio.server");
    const { publicOrigin } = await import("./crm-media.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    return createVideoJob({
      ...data,
      userId: context.userId,
      imageOrigin: publicOrigin(getRequest().url),
    });
  });

const RUNNING = "('queued','processing','saving')";

/** Riwayat video workspace (berhalaman, bisa difilter & dicari); sekalian memeriksa yang masih berjalan. */
export const listAiJobs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.enum(["all", "active", "done", "running", "failed"]).default("all"),
        q: z.string().trim().max(80).default(""),
        limit: z.number().int().min(1).max(48).default(12),
        offset: z.number().int().min(0).max(5000).default(0),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("./auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Akses ditolak");
    const { processPendingJobs, getStudioSettings } = await import("./ai-studio.server");
    await processPendingJobs(data.workspaceId, 5);
    const { execute } = await import("@/integrations/mysql/pool");
    const styles = (await getStudioSettings()).styles;
    const where = ["j.workspace_id = ?"];
    const args: (string | number)[] = [data.workspaceId];
    if (data.status === "done") where.push("j.status = 'done'");
    if (data.status === "active") where.push("j.status <> 'failed'");
    if (data.status === "failed") where.push("j.status = 'failed'");
    if (data.status === "running") where.push(`j.status IN ${RUNNING}`);
    if (data.q) {
      const keys = styles
        .filter((x) => `${x.name} ${x.name_en}`.toLowerCase().includes(data.q.toLowerCase()))
        .map((x) => x.key);
      const like = `%${data.q.replace(/[\\%_]/g, "\\$&")}%`;
      where.push(
        `(s.name LIKE ? OR j.user_note LIKE ?${keys.length ? ` OR j.style IN (${keys.map(() => "?").join(",")})` : ""})`,
      );
      args.push(like, like, ...keys);
    }
    const rows = await execute<Record<string, unknown>>(
      `SELECT j.id, j.status, j.tier, j.style, j.duration_s, j.aspect_ratio, j.credits, j.refunded, j.error,
              j.result_media_id, j.source_media_id, j.user_note, j.created_at, j.finished_at,
              r.file_path AS result_path, r.name AS result_name, s.file_path AS source_path, s.name AS source_name
         FROM ai_jobs j
         LEFT JOIN crm_media r ON r.id = j.result_media_id
         LEFT JOIN crm_media s ON s.id = j.source_media_id
        WHERE ${where.join(" AND ")}
        ORDER BY j.created_at DESC LIMIT ${data.limit + 1} OFFSET ${data.offset}`,
      args,
    );
    const counts = await execute<Record<string, unknown>>(
      `SELECT SUM(status = 'done') AS done, SUM(status = 'failed') AS failed,
              SUM(status IN ${RUNNING}) AS running, COUNT(*) AS total
         FROM ai_jobs WHERE workspace_id = ?`,
      [data.workspaceId],
    );
    const c = counts[0] ?? {};
    const items = rows.slice(0, data.limit).map((r) => {
      const tpl = r.tier === "template" ? TEMPLATES.find((x) => x.key === r.style) : undefined;
      const st = tpl ?? styles.find((x) => x.key === r.style);
      return {
        id: String(r.id),
        status: String(r.status),
        tier: String(r.tier),
        style: String(r.style),
        style_label: st?.name ?? String(r.style),
        style_label_en: st?.name_en || st?.name || String(r.style),
        aspect_ratio: String(r.aspect_ratio),
        result_media_id: r.result_media_id ? String(r.result_media_id) : null,
        source_media_id: r.source_media_id ? String(r.source_media_id) : null,
        result_path: r.result_path ? String(r.result_path) : null,
        result_name: r.result_name ? String(r.result_name) : null,
        source_path: r.source_path ? String(r.source_path) : null,
        source_name: r.source_name ? String(r.source_name) : null,
        note: r.user_note ? String(r.user_note) : null,
        seconds_elapsed: Math.max(
          0,
          Math.round(
            ((r.finished_at ? new Date(String(r.finished_at)).getTime() : Date.now()) -
              new Date(String(r.created_at)).getTime()) /
              1000,
          ),
        ),
        duration_s: Number(r.duration_s),
        credits: Number(r.credits),
        refunded: Number(r.refunded) === 1,
        // Pesan teknis penyedia hanya untuk Super Admin; pengguna melihat pesan umum.
        error: r.error ? "Pembuatan gagal, kredit dikembalikan." : null,
        created_at: String(r.created_at),
      };
    }) as AiJobView[];
    return {
      items,
      has_more: rows.length > data.limit,
      counts: {
        done: Number(c.done ?? 0),
        failed: Number(c.failed ?? 0),
        running: Number(c.running ?? 0),
        total: Number(c.total ?? 0),
      },
    };
  });

/** Buat video Template (tanpa AI): foto + teks digabung mesin render. */
export const createTemplateVideo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        sourceMediaId: z.string().uuid().nullable().default(null),
        items: z
          .array(
            z.object({
              mediaId: z.string().uuid(),
              title: z.string().trim().max(CATALOG.title).default(""),
              price: z.string().trim().max(CATALOG.price).default(""),
            }),
          )
          .max(CATALOG.max)
          .default([]),
        sound: z.boolean().default(true),
        narrationPath: z.string().max(300).nullable().default(null),
        narrationSeconds: z.number().min(0).max(120).default(0),
        template: z.enum(TEMPLATE_KEYS),
        headline: z.string().trim().min(1).max(TEMPLATE_LIMITS.headline),
        subline: z.string().trim().max(TEMPLATE_LIMITS.subline).default(""),
        badge: z.string().trim().max(TEMPLATE_LIMITS.badge).default(""),
        cta: z.string().trim().max(TEMPLATE_LIMITS.cta).default(""),
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        aspectRatio: z.enum(TEMPLATE_RATIOS),
        seconds: z.number().int().min(1).max(60).default(TEMPLATE_SECONDS),
        consent: z.literal(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { createTemplateJob } = await import("./ai-templates.server");
    return createTemplateJob({
      workspaceId: data.workspaceId,
      userId: context.userId,
      sourceMediaId: data.sourceMediaId,
      items: data.items,
      sound: data.sound,
      narrationPath: data.narrationPath,
      narrationSeconds: data.narrationSeconds,
      template: data.template,
      aspectRatio: data.aspectRatio,
      seconds: data.seconds,
      text: {
        headline: data.headline,
        subline: data.subline,
        badge: data.badge,
        cta: data.cta,
        accent: data.accent,
      },
    });
  });

/* --------------------------------- Gaya saya --------------------------------- */

async function assertWriter(workspaceId: string, userId: string) {
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Akses ditolak");
  const { studioAccess } = await import("./ai-studio.server");
  if (!(await studioAccess(workspaceId, userId)).available)
    throw new Error("Studio AI belum tersedia");
}

export const listUserStyles = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("./auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Akses ditolak");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      "SELECT id, name, style, note FROM ai_user_styles WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 30",
      [data.workspaceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      style: String(r.style),
      note: String(r.note ?? ""),
    })) as UserStyle[];
  });

export const saveUserStyle = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        style: z.string().regex(STYLE_KEY),
        note: z.string().trim().max(NOTE_MAX).default(""),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId);
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const n = await executeOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM ai_user_styles WHERE workspace_id = ?",
      [data.workspaceId],
    );
    if (Number(n?.n ?? 0) >= 30)
      throw new Error("Maksimal 30 gaya tersimpan. Hapus yang tidak dipakai dulu.");
    const id = uuid();
    await execute(
      "INSERT INTO ai_user_styles (id, workspace_id, name, style, note, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [id, data.workspaceId, data.name, data.style, data.note, context.userId],
    );
    return { id };
  });

export const deleteUserStyle = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    await execute("DELETE FROM ai_user_styles WHERE id = ? AND workspace_id = ?", [
      data.id,
      data.workspaceId,
    ]);
    return { ok: true };
  });

async function tenantForMember(workspaceId: string, userId: string) {
  const { isWorkspaceMember, hasRole } = await import("./auth-context.server");
  if (!(await isWorkspaceMember(workspaceId, userId)) && !(await hasRole(userId, "admin")))
    throw new Error("Akses ditolak");
  const { executeOne } = await import("@/integrations/mysql/pool");
  const w = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM workspaces WHERE id = ?",
    [workspaceId],
  );
  if (!w) throw new Error("Workspace tidak ditemukan");
  return w.tenant_id;
}

/** Beli paket kredit dari saldo Qalling. */
export const buyCreditPack = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        credits: z.number().int().positive(),
        idempotencyKey: z.string().uuid(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantForMember(data.workspaceId, context.userId);
    const { studioAccess } = await import("./ai-studio.server");
    const access = await studioAccess(data.workspaceId, context.userId);
    if (!access.available) throw new Error("Studio AI belum tersedia");
    if (!access.can_buy) throw new Error("Hanya owner/admin workspace yang dapat membeli kredit.");
    const { buyPackFromWallet } = await import("./ai-credits.server");
    const r = await buyPackFromWallet({
      tenantId,
      credits: data.credits,
      key: data.idempotencyKey,
      actor: context.userId,
    });
    return { credits: r.credits, bought: r.pack.credits, price_idr: r.pack.price_idr };
  });

/** Riwayat kredit + pembayaran langsung yang masih menunggu. */
export const getCreditActivity = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const tenantId = await tenantForMember(data.workspaceId, context.userId);
    const { creditActivity } = await import("./ai-credits.server");
    return { tenantId, ...(await creditActivity(tenantId)) };
  });

/* -------------------------------- Super Admin -------------------------------- */

const hint = (k: string | null) => (k ? `••••${k.slice(-4)}` : null);

export const adminGetStudio = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./auth-context.server");
    await requireAdmin(context.userId);
    const { getStudioSettings } = await import("./ai-studio.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const s = await getStudioSettings();
    const jobs = await execute<Record<string, unknown>>(
      `SELECT j.id, j.status, j.tier, j.provider, j.model, j.style, j.duration_s, j.credits, j.charged_idr,
              j.refunded, j.est_cost_usd, j.error, j.is_admin_test, j.created_at, j.submitted_at, j.finished_at,
              w.name AS workspace_name
         FROM ai_jobs j LEFT JOIN workspaces w ON w.id = j.workspace_id
        ORDER BY j.created_at DESC LIMIT 100`,
    );
    const totals = await execute<Record<string, unknown>>(
      `SELECT COUNT(*) AS jobs,
              SUM(status = 'done') AS done,
              SUM(status = 'failed') AS failed,
              COALESCE(SUM(CASE WHEN status = 'done' THEN credits ELSE 0 END), 0) AS credits_used,
              COALESCE(SUM(CASE WHEN status = 'done' THEN est_cost_usd ELSE 0 END), 0) AS cost_usd
         FROM ai_jobs WHERE created_at >= NOW(6) - INTERVAL 30 DAY AND is_admin_test = 0`,
    );
    // Penjualan paket (tanpa pembelian akun Super Admin).
    const sales = await execute<Record<string, unknown>>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_idr), 0) AS idr, COALESCE(SUM(delta), 0) AS credits
         FROM ai_credit_ledger
        WHERE kind = 'purchase' AND created_at >= NOW(6) - INTERVAL 30 DAY
          AND (created_by IS NULL OR created_by NOT IN (SELECT user_id FROM user_roles WHERE role = 'admin'))`,
    );
    const outstanding = await execute<Record<string, unknown>>(
      "SELECT COALESCE(SUM(credits), 0) AS n FROM ai_credit_accounts",
    );
    const { getPacks } = await import("./ai-credits.server");
    const packs = await getPacks();
    const t = totals[0] ?? {};
    const sl = sales[0] ?? {};
    return {
      enabled: s.enabled,
      fal_key_hint: hint(s.fal_api_key),
      atlas_key_hint: hint(s.atlas_api_key),
      tiers: s.tiers,
      styles: s.styles,
      template: {
        enabled: s.template_enabled,
        credits: s.template_credits,
        has_token: s.has_worker_token,
        worker_seen_at: s.worker_seen_at,
        worker_info: s.worker_info,
        worker_online:
          !!s.worker_seen_at &&
          Date.now() - new Date(s.worker_seen_at).getTime() < WORKER_ONLINE_MS,
        queued: Number(
          (
            await execute<{ n: number }>(
              "SELECT COUNT(*) AS n FROM ai_jobs WHERE provider = 'render' AND status IN ('queued','processing')",
            )
          )[0]?.n ?? 0,
        ),
      },
      packs,
      daily_limit: s.daily_limit,
      usd_idr: s.usd_idr,
      totals30d: {
        jobs: Number(t.jobs ?? 0),
        done: Number(t.done ?? 0),
        failed: Number(t.failed ?? 0),
        credits_used: Number(t.credits_used ?? 0),
        cost_idr: Math.round(Number(t.cost_usd ?? 0) * s.usd_idr),
        packs_sold: Number(sl.n ?? 0),
        sales_idr: Number(sl.idr ?? 0),
        credits_sold: Number(sl.credits ?? 0),
      },
      credits_outstanding: Number(outstanding[0]?.n ?? 0),
      jobs: jobs.map((j) => ({
        id: String(j.id),
        status: String(j.status),
        tier: String(j.tier),
        provider: String(j.provider),
        model: String(j.model),
        style: String(j.style),
        workspace_name: j.workspace_name ? String(j.workspace_name) : null,
        error: j.error ? String(j.error) : null,
        duration_s: Number(j.duration_s),
        credits: Number(j.credits),
        charged_idr: Number(j.charged_idr),
        refunded: Number(j.refunded) === 1,
        is_admin_test: Number(j.is_admin_test) === 1,
        est_cost_idr: Math.round(Number(j.est_cost_usd ?? 0) * s.usd_idr),
        created_at: String(j.created_at),
        seconds:
          j.finished_at && j.submitted_at
            ? Math.round(
                (new Date(String(j.finished_at)).getTime() -
                  new Date(String(j.submitted_at)).getTime()) /
                  1000,
              )
            : null,
      })),
    };
  });

const tierSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().min(3).max(200),
  image_param: z
    .string()
    .trim()
    .regex(/^[a-z_]{2,40}$/),
  credits_5s: z.number().int().min(1).max(1000),
  credits_10s: z.number().int().min(1).max(2000),
  cost_usd_per_s: z.number().min(0).max(10),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const adminSaveStudio = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        falApiKey: z.string().trim().max(300).optional(),
        atlasApiKey: z.string().trim().max(300).optional(),
        clearFal: z.boolean().optional(),
        clearAtlas: z.boolean().optional(),
        tiers: z.object({ hemat: tierSchema, standar: tierSchema, premium: tierSchema }),
        styles: z
          .array(
            z.object({
              key: z.string().regex(STYLE_KEY),
              name: z.string().trim().min(1).max(40),
              name_en: z.string().trim().max(40).default(""),
              hint: z.string().trim().max(120).default(""),
              hint_en: z.string().trim().max(120).default(""),
              prompt: z.string().trim().min(5).max(600),
              enabled: z.boolean(),
            }),
          )
          .min(1)
          .max(24)
          .refine((a) => new Set(a.map((x) => x.key)).size === a.length, {
            message: "Kunci gaya harus berbeda",
          })
          .refine((a) => a.some((x) => x.enabled), { message: "Minimal satu gaya aktif" }),
        templateEnabled: z.boolean().default(false),
        templateCredits: z.number().int().min(1).max(100).default(1),
        dailyLimit: z.number().int().min(0).max(500),
        usdIdr: z.number().int().min(1000).max(100000),
        packs: z
          .array(
            z.object({
              credits: z.number().int().min(1).max(100000),
              price_idr: z.number().int().min(1000).max(100_000_000),
            }),
          )
          .min(1)
          .max(8)
          .refine((a) => new Set(a.map((p) => p.credits)).size === a.length, {
            message: "Jumlah kredit tiap paket harus berbeda",
          }),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./auth-context.server");
    await requireAdmin(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const { getStudioSettings } = await import("./ai-studio.server");
    const cur = await getStudioSettings();
    const fal = data.clearFal ? null : data.falApiKey || cur.fal_api_key;
    const atlas = data.clearAtlas ? null : data.atlasApiKey || cur.atlas_api_key;
    await execute(
      `UPDATE ai_studio_settings SET enabled = ?, fal_api_key = ?, atlas_api_key = ?, tiers = ?, daily_limit = ?,
              usd_idr = ?, credit_packs = ?, styles = ?, template_enabled = ?, template_credits = ?, updated_by = ?
        WHERE id = 'platform'`,
      [
        data.enabled ? 1 : 0,
        fal,
        atlas,
        JSON.stringify(data.tiers),
        data.dailyLimit,
        data.usdIdr,
        JSON.stringify([...data.packs].sort((a, b) => a.credits - b.credits)),
        JSON.stringify(data.styles),
        data.templateEnabled ? 1 : 0,
        data.templateCredits,
        context.userId,
      ],
    );
    return { ok: true };
  });

/** Super Admin: periksa sekarang semua pekerjaan yang masih berjalan (tanpa menunggu cron). */
export const adminProcessJobs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./auth-context.server");
    await requireAdmin(context.userId);
    const { processPendingJobs } = await import("./ai-studio.server");
    return processPendingJobs(undefined, 50);
  });

/** Super Admin: beri kredit bonus (uji coba, promosi, kompensasi) ke tenant lewat email pengguna. */
export const adminGrantCredits = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email(),
        credits: z
          .number()
          .int()
          .min(-10000)
          .max(10000)
          .refine((n) => n !== 0),
        note: z.string().trim().max(200).default(""),
        idempotencyKey: z.string().uuid(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./auth-context.server");
    await requireAdmin(context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const tenant =
      (await executeOne<{ id: string; name: string }>(
        `SELECT t.id, t.name FROM tenants t JOIN app_users u ON u.id = t.owner_id
          WHERE u.email = ? ORDER BY t.created_at LIMIT 1`,
        [data.email],
      )) ??
      (await executeOne<{ id: string; name: string }>(
        `SELECT t.id, t.name FROM app_users u JOIN workspace_members m ON m.user_id = u.id
           JOIN workspaces w ON w.id = m.workspace_id JOIN tenants t ON t.id = w.tenant_id
          WHERE u.email = ? LIMIT 1`,
        [data.email],
      ));
    if (!tenant) throw new Error("Email ini belum punya workspace di Qalling.");
    const { grantBonusCredits } = await import("./ai-credits.server");
    try {
      const balance = await grantBonusCredits({
        tenantId: tenant.id,
        credits: data.credits,
        key: data.idempotencyKey,
        actor: context.userId,
        note: data.note,
      });
      return { tenant: tenant.name, balance };
    } catch (e) {
      if ((e as Error).message === "insufficient_credits")
        throw new Error("Saldo kredit tenant tidak cukup untuk dikurangi sebanyak itu.");
      throw e;
    }
  });

/** Super Admin: buat token mesin render baru (yang lama langsung tidak berlaku). Token tampil sekali. */
export const adminRotateWorkerToken = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./auth-context.server");
    await requireAdmin(context.userId);
    const { rotateWorkerToken } = await import("./ai-templates.server");
    const { securePublicOrigin } = await import("./crm-media.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    return {
      token: await rotateWorkerToken(context.userId),
      url: securePublicOrigin(getRequest().url),
    };
  });
