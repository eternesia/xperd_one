/** Studio AI Qalling — server function (pengguna & Super Admin). Logika inti di `ai-studio.server.ts`. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import {
  AI_DURATIONS,
  AI_PROVIDERS,
  AI_RATIOS,
  AI_STYLES,
  AI_TIERS,
  type AiJobView,
} from "./ai-studio";

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
        style: z.enum(AI_STYLES),
        note: z.string().trim().max(300).optional(),
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

/** Daftar pekerjaan terbaru workspace; sekalian memeriksa yang masih berjalan. */
export const listAiJobs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("./auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Akses ditolak");
    const { processPendingJobs } = await import("./ai-studio.server");
    await processPendingJobs(data.workspaceId, 5);
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT id, status, tier, style, duration_s, aspect_ratio, credits, refunded, error, result_media_id,
              source_media_id, created_at
         FROM ai_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20`,
      [data.workspaceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      tier: String(r.tier),
      style: String(r.style),
      aspect_ratio: String(r.aspect_ratio),
      result_media_id: r.result_media_id ? String(r.result_media_id) : null,
      source_media_id: String(r.source_media_id),
      duration_s: Number(r.duration_s),
      credits: Number(r.credits),
      refunded: Number(r.refunded) === 1,
      // Pesan teknis penyedia hanya untuk Super Admin; pengguna melihat pesan umum.
      error: r.error ? "Pembuatan gagal, kredit dikembalikan." : null,
      created_at: String(r.created_at),
    })) as AiJobView[];
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
              COALESCE(SUM(CASE WHEN refunded = 0 THEN charged_idr ELSE 0 END), 0) AS revenue_idr,
              COALESCE(SUM(CASE WHEN status = 'done' THEN est_cost_usd ELSE 0 END), 0) AS cost_usd
         FROM ai_jobs WHERE created_at >= NOW(6) - INTERVAL 30 DAY AND is_admin_test = 0`,
    );
    const t = totals[0] ?? {};
    return {
      enabled: s.enabled,
      fal_key_hint: hint(s.fal_api_key),
      atlas_key_hint: hint(s.atlas_api_key),
      tiers: s.tiers,
      daily_limit: s.daily_limit,
      usd_idr: s.usd_idr,
      totals30d: {
        jobs: Number(t.jobs ?? 0),
        done: Number(t.done ?? 0),
        failed: Number(t.failed ?? 0),
        revenue_idr: Number(t.revenue_idr ?? 0),
        cost_idr: Math.round(Number(t.cost_usd ?? 0) * s.usd_idr),
      },
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
        dailyLimit: z.number().int().min(0).max(500),
        usdIdr: z.number().int().min(1000).max(100000),
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
              usd_idr = ?, updated_by = ? WHERE id = 'platform'`,
      [
        data.enabled ? 1 : 0,
        fal,
        atlas,
        JSON.stringify(data.tiers),
        data.dailyLimit,
        data.usdIdr,
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
