/**
 * Integrasi Meta (Facebook Page & Instagram) — BS New 11.
 *
 * - App ID/Secret **hanya** diatur Super Admin (`saveMetaApp` / `configureNativeMeta`); tenant tidak
 *   melihat App ID/Secret. Tenant hanya menekan "Hubungkan native" setelah Super Admin mengaktifkannya.
 * - Access token dan App Secret hanya dibaca server (padanan `service_role` Supabase).
 * - State OAuth sekali pakai, kedaluwarsa 10 menit (dikonsumsi di `routes/api/public/meta/callback.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export interface MetaSettingsView {
  app_id: string | null;
  app_name: string | null;
  status: string;
  last_error: string | null;
  connected_at: string | null;
  native_social_enabled: boolean;
}

export interface SaveMetaResult {
  status: string;
  appName: string | null;
  lastError: string | null;
}

async function assertPublisher(workspaceId: string, userId: string) {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasQalling } = await import("@/lib/social-interactions.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Forbidden");
  if (!(await workspaceHasQalling(workspaceId)))
    throw new Error("Paket Qalling tidak mengizinkan publikasi sosial");
}

/** Status Meta untuk anggota workspace (tanpa App Secret). */
export const getMetaSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }): Promise<MetaSettingsView | null> => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<Record<string, unknown>>(
      "SELECT app_id, app_name, status, last_error, connected_at, native_social_enabled FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!row) return null;
    return {
      app_id: (row.app_id as string) ?? null,
      app_name: (row.app_name as string) ?? null,
      status: String(row.status),
      last_error: (row.last_error as string) ?? null,
      connected_at: row.connected_at ? String(row.connected_at) : null,
      native_social_enabled: row.native_social_enabled === 1 || row.native_social_enabled === true,
    };
  });

/** Super Admin: simpan App ID/Secret lalu verifikasi ke Graph API. */
export const saveMetaApp = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; appId: string; appSecret: string }) => {
    const appId = String(d?.appId ?? "").trim();
    const appSecret = String(d?.appSecret ?? "").trim();
    if (
      !isId(d?.workspaceId) ||
      !/^\d{5,25}$/.test(appId) ||
      appSecret.length < 10 ||
      appSecret.length > 200
    )
      throw new Error("Input tidak valid");
    return { workspaceId: d.workspaceId, appId, appSecret };
  })
  .handler(async ({ data, context }): Promise<SaveMetaResult> => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin")))
      throw new Error("Konfigurasi Meta hanya untuk Super Admin.");
    const { verifyMetaApp } = await import("@/lib/meta-publish.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    let appName: string | null = null;
    let status = "verified";
    let lastError: string | null = null;
    try {
      appName = (await verifyMetaApp(data.appId, data.appSecret)).appName;
    } catch (e) {
      status = "invalid";
      lastError = (e as Error).message;
    }
    await execute(
      `INSERT INTO crm_meta_settings (id, workspace_id, app_id, app_secret, app_name, status, last_error, verified_at, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE app_id = VALUES(app_id), app_secret = VALUES(app_secret), app_name = VALUES(app_name),
         status = VALUES(status), last_error = VALUES(last_error), verified_at = VALUES(verified_at), connected_at = NULL`,
      [
        uuid(),
        data.workspaceId,
        data.appId,
        data.appSecret,
        appName,
        status,
        lastError,
        status === "verified" ? sqlDateTime() : null,
      ],
    );
    return { status, appName, lastError };
  });

/** Owner/Admin workspace: URL OAuth Facebook Login (state sekali pakai, 10 menit). */
export const startMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; origin: string }) => {
    if (!isId(d?.workspaceId) || !d.origin) throw new Error("Missing workspace or origin");
    try {
      new URL(d.origin);
    } catch {
      throw new Error("Origin tidak valid.");
    }
    return d;
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertPublisher(data.workspaceId, context.userId);
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) {
      throw new Error("Koneksi Meta hanya untuk Owner/Admin workspace.");
    }
    const { executeOne, execute } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const s = await executeOne<{ app_id: string; status: string; native_social_enabled: number }>(
      "SELECT app_id, status, native_social_enabled FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!s || s.status === "invalid" || s.status === "unverified")
      throw new Error("Verify the Meta App first");
    if (!s.native_social_enabled) throw new Error("Meta native belum diaktifkan oleh Super Admin.");
    const { getRequest } = await import("@tanstack/react-start/server");
    if (new URL(data.origin).origin !== new URL(getRequest().url).origin)
      throw new Error("Origin tidak valid.");
    const nonce = crypto.randomUUID();
    const redirectUri = `${new URL(data.origin).origin}/api/public/meta/callback`;
    await execute(
      "UPDATE crm_meta_settings SET oauth_state = ?, redirect_uri = ?, oauth_expires_at = ? WHERE workspace_id = ?",
      [nonce, redirectUri, sqlDateTime(new Date(Date.now() + 10 * 60 * 1000)), data.workspaceId],
    );
    const params = new URLSearchParams({
      client_id: s.app_id,
      redirect_uri: redirectUri,
      state: `${data.workspaceId}.${nonce}`,
      scope:
        "pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_engagement,pages_manage_posts,pages_manage_metadata,pages_messaging,instagram_basic,instagram_content_publish,instagram_manage_messages,instagram_manage_comments,business_management",
      response_type: "code",
    });
    return { url: `https://www.facebook.com/v21.0/dialog/oauth?${params}` };
  });

/** Memutuskan koneksi Meta: hapus akun `meta` (token ikut terhapus) dan turunkan status ke `verified`. */
export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPublisher(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    await execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND source = 'meta'", [
      data.workspaceId,
    ]);
    await execute(
      "UPDATE crm_meta_settings SET status = 'verified', connected_at = NULL, oauth_state = NULL WHERE workspace_id = ?",
      [data.workspaceId],
    );
    return { ok: true };
  });

export interface PublishResult {
  ok: boolean;
  results: { account_id: string; ok: boolean; error?: string | null }[];
}

/** "Posting sekarang": workspace diturunkan dari postingan (seperti New 11). */
export const publishPostNow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { postId: string }) => {
    if (!isId(d?.postId)) throw new Error("Missing post");
    return d;
  })
  .handler(async ({ data, context }): Promise<PublishResult> => {
    const { executeOne } = await import("@/integrations/mysql/pool");
    const post = await executeOne<{ workspace_id: string }>(
      "SELECT workspace_id FROM crm_scheduled_posts WHERE id = ?",
      [data.postId],
    );
    if (!post) throw new Error("Post not found");
    await assertPublisher(post.workspace_id, context.userId);
    const { publishPost } = await import("@/lib/meta-publish.server");
    const { publicOrigin } = await import("@/lib/crm-media.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const outcome = await publishPost(
      post.workspace_id,
      data.postId,
      publicOrigin(getRequest().url),
    );
    return {
      ok: outcome.ok,
      results: outcome.results.map((r) => ({
        account_id: r.account_id,
        ok: r.ok,
        error: r.error ?? null,
      })),
    };
  });
