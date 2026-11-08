import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

async function assertSuperAdmin(userId: string) {
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await hasRole(userId, "admin"))) throw new Error("Hanya Super Admin");
}
async function assertWsAdmin(workspaceId: string, userId: string) {
  const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
  if (!(await hasWorkspaceRole(workspaceId, userId, ["owner", "admin"])))
    throw new Error("Forbidden");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await workspaceHasFeature(workspaceId, "whatsapp")))
    throw new Error(
      "WhatsApp tersedia pada paket dengan fitur WhatsApp. Upgrade paket untuk mengaktifkannya.",
    );
}
const ws = z.object({ workspaceId: z.string().uuid() });

/* ---- Super Admin ---- */
export const getKirimdevAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { executeOne, execute } = await import("@/integrations/mysql/pool");
    const s = await executeOne<{
      api_key: string | null;
      status: string;
      last_error: string | null;
      verified_at: string | null;
    }>(
      "SELECT api_key, status, last_error, verified_at FROM kirimdev_settings WHERE id = 'platform'",
    );
    const [c] = await execute<{ n: number; connected: number }>(
      "SELECT COUNT(*) AS n, SUM(phone_number_id IS NOT NULL) AS connected FROM crm_wa_settings WHERE managed = 1",
    );
    return {
      hasKey: Boolean(s?.api_key),
      keyHint: s?.api_key ? `${s.api_key.slice(0, 8)}…${s.api_key.slice(-4)}` : null,
      status: s?.status ?? "none",
      lastError: s?.last_error ?? null,
      verifiedAt: s?.verified_at ?? null,
      workspaces: Number(c?.n ?? 0),
      connected: Number(c?.connected ?? 0),
    };
  });

export const saveKirimdevKey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ apiKey: z.string().trim().min(10).max(300) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const { kirimdev } = await import("@/lib/wa-send.server");
    let status = "verified";
    let lastError: string | null = null;
    try {
      await kirimdev({ api_token: data.apiKey, endpoint_url: null }, "GET", "/customers?limit=1");
    } catch (e) {
      status = "invalid";
      lastError = (e as Error).message;
    }
    await execute(
      `INSERT INTO kirimdev_settings (id, api_key, status, last_error, verified_at) VALUES ('platform', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE api_key = VALUES(api_key), status = VALUES(status), last_error = VALUES(last_error), verified_at = VALUES(verified_at)`,
      [data.apiKey, status, lastError, status === "verified" ? sqlDateTime() : null],
    );
    return { status, lastError };
  });

/* ---- Workspace ---- */
export const getKirimdevManaged = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { platformKirimdevKey, loadWaSettings } = await import("@/lib/wa-send.server");
    const { templateStatus } = await import("@/lib/kirimdev-managed.server");
    const platformReady = Boolean(await platformKirimdevKey());
    const s = await loadWaSettings(data.workspaceId);
    const managed = Boolean(s?.managed);
    return {
      platformReady,
      managed,
      connected: managed && Boolean(s?.phone_number_id),
      number: s?.number_display ?? null,
      templateName: managed ? (s?.invoice_template ?? null) : null,
      templateStatus: managed && s?.phone_number_id ? await templateStatus(data.workspaceId) : null,
    };
  });

export const connectKirimdevManaged = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await assertWsAdmin(data.workspaceId, context.userId);
    const { createSetupLink } = await import("@/lib/kirimdev-managed.server");
    return createSetupLink(data.workspaceId);
  });

export const syncKirimdevManaged = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await assertWsAdmin(data.workspaceId, context.userId);
    const { syncManaged, ensureInvoiceTemplate } = await import("@/lib/kirimdev-managed.server");
    const r = await syncManaged(data.workspaceId);
    let template: string | null = null;
    if (r.connected) {
      try {
        template = (await ensureInvoiceTemplate(data.workspaceId)).status;
      } catch (e) {
        template = `error: ${(e as Error).message}`;
      }
    }
    return { connected: r.connected, template };
  });

export const disconnectKirimdevManaged = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await assertWsAdmin(data.workspaceId, context.userId);
    const { disconnectManaged } = await import("@/lib/kirimdev-managed.server");
    await disconnectManaged(data.workspaceId);
    return { ok: true };
  });

/** Beralih ke API key milik sendiri (lepas dari mode dikelola). */
export const switchToOwnKirimdevKey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await assertWsAdmin(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      "UPDATE crm_wa_settings SET managed = 0, phone_number_id = NULL, number_display = NULL, is_active = 0 WHERE workspace_id = ?",
      [data.workspaceId],
    );
    return { ok: true };
  });
