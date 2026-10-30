/** Super Admin: aktivasi Meta native per workspace (BS New 11 `meta-inbox.functions.ts`). */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function assertSuperAdmin(userId: string) {
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await hasRole(userId, "admin"))) throw new Error("Hanya Super Admin.");
}

export const getNativeMetaAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const [ws, settings] = await Promise.all([
      execute<{ id: string; name: string }>("SELECT id, name FROM workspaces ORDER BY name"),
      execute<Record<string, unknown>>(
        "SELECT workspace_id, app_id, status, native_social_enabled FROM crm_meta_settings",
      ),
    ]);
    return {
      workspaces: ws.map((w) => ({ id: String(w.id), name: String(w.name) })),
      settings: settings.map((s) => ({
        workspace_id: String(s.workspace_id),
        app_id: String(s.app_id ?? ""),
        status: String(s.status),
        native_social_enabled: s.native_social_enabled === 1 || s.native_social_enabled === true,
      })),
    };
  });

export const configureNativeMeta = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      workspaceId: string;
      enabled: boolean;
      appId: string;
      appSecret?: string;
      verifyToken?: string;
    }) => {
      const appId = String(d?.appId ?? "").trim();
      const appSecret = d?.appSecret?.trim();
      const verifyToken = d?.verifyToken?.trim();
      if (!isId(d?.workspaceId) || !/^\d{5,25}$/.test(appId)) throw new Error("Input tidak valid");
      if (appSecret !== undefined && (appSecret.length < 10 || appSecret.length > 200))
        throw new Error("Input tidak valid");
      if (verifyToken !== undefined && (verifyToken.length < 16 || verifyToken.length > 200))
        throw new Error("Input tidak valid");
      return {
        workspaceId: d.workspaceId,
        enabled: Boolean(d.enabled),
        appId,
        appSecret,
        verifyToken,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const prior = await executeOne<{
      app_id: string;
      app_secret: string;
      webhook_verify_token: string | null;
    }>(
      "SELECT app_id, app_secret, webhook_verify_token FROM crm_meta_settings WHERE workspace_id = ?",
      [data.workspaceId],
    );
    const secret = data.appSecret ?? (prior?.app_id === data.appId ? prior.app_secret : null);
    const verify = data.verifyToken ?? prior?.webhook_verify_token;
    if (!secret || !verify) throw new Error("App Secret dan Verify Token wajib diisi.");
    const { verifyMetaApp } = await import("@/lib/meta-publish.server");
    try {
      await verifyMetaApp(data.appId, secret);
    } catch {
      throw new Error("App ID atau App Secret Meta tidak valid.");
    }
    await execute(
      `INSERT INTO crm_meta_settings (id, workspace_id, app_id, app_secret, webhook_verify_token, native_social_enabled, status, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, 'verified', ?)
       ON DUPLICATE KEY UPDATE app_id = VALUES(app_id), app_secret = VALUES(app_secret), webhook_verify_token = VALUES(webhook_verify_token),
         native_social_enabled = VALUES(native_social_enabled), status = 'verified', verified_at = VALUES(verified_at)`,
      [uuid(), data.workspaceId, data.appId, secret, verify, data.enabled ? 1 : 0, sqlDateTime()],
    );
    return { ok: true };
  });
