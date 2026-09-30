/**
 * #55 (BS New 3): integrasi Meta App (Facebook Page & Instagram).
 *
 * Catatan porting ke Old:
 * - App Secret dan access token **hanya** dibaca/ditulis di server (padanan
 *   `service_role` di Supabase); client hanya melihat App ID, nama app, status,
 *   dan pesan kesalahan terakhir.
 * - Verifikasi App ID/Secret memakai Graph API (client_credentials) sehingga
 *   perlu App milik user; tanpa itu statusnya `invalid` + pesan dari Meta.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Versi Graph API yang dipakai (boleh dinaikkan kapan saja). */
const GRAPH = "https://graph.facebook.com/v21.0";
/** Scope minimum: kelola Halaman + publikasi Instagram. */
const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export interface MetaSettingsView {
  app_id: string | null;
  app_name: string | null;
  status: string;
  last_error: string | null;
  connected_at: string | null;
}

export interface SaveMetaResult {
  status: string;
  appName: string | null;
  lastError: string | null;
}

async function assertWriter(workspaceId: string, userId: string) {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Forbidden");
}

/** Pengaturan Meta untuk ditampilkan di browser (tanpa App Secret). */
export const getMetaSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<MetaSettingsView | null> => {
    await assertWriter(data.workspaceId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{
      app_id: string;
      app_name: string | null;
      status: string;
      last_error: string | null;
      connected_at: string | null;
    }>(
      "SELECT app_id, app_name, status, last_error, connected_at FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
      [data.workspaceId],
    );
    return row ?? null;
  });

/**
 * Menyimpan App ID & App Secret lalu memverifikasinya ke Graph API.
 * `appSecret` kosong = pertahankan secret yang tersimpan.
 */
export const saveMetaApp = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; appId: string; appSecret?: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data.appId?.trim()) throw new Error("App ID is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<SaveMetaResult> => {
    await assertWriter(data.workspaceId, context.userId);
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");

    const existing = await executeOne<{ id: string; app_secret: string }>(
      "SELECT id, app_secret FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
      [data.workspaceId],
    );
    const secret = data.appSecret?.trim() || existing?.app_secret || "";
    if (!secret) throw new Error("App Secret is required");

    let status = "invalid";
    let appName: string | null = null;
    let lastError: string | null = null;

    try {
      const tokenRes = await fetch(
        `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(data.appId.trim())}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
      );
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } };
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        lastError = tokenJson.error?.message ?? "App ID/Secret ditolak Meta";
      } else {
        const infoRes = await fetch(
          `${GRAPH}/${encodeURIComponent(data.appId.trim())}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
        );
        const infoJson = (await infoRes.json()) as { name?: string; error?: { message?: string } };
        if (infoJson.name) {
          status = "verified";
          appName = infoJson.name;
        } else {
          lastError = infoJson.error?.message ?? "Tidak dapat membaca nama App";
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Gagal menghubungi Meta";
    }

    const payload = {
      app_id: data.appId.trim(),
      app_secret: secret,
      app_name: appName,
      status,
      last_error: lastError,
      verified_at: status === "verified" ? sqlDateTime() : null,
    };

    if (existing) {
      const cols = Object.keys(payload);
      await execute(
        `UPDATE crm_meta_settings SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`,
        [...cols.map((c) => (payload as Record<string, unknown>)[c]), existing.id],
      );
    } else {
      const cols = ["id", "workspace_id", ...Object.keys(payload)];
      const values = [uuid(), data.workspaceId, ...Object.values(payload)];
      await execute(
        `INSERT INTO crm_meta_settings (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
        values,
      );
    }

    return { status, appName, lastError };
  });

/** Membuat URL OAuth Facebook Login (state nonce disimpan di server). */
export const startMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; origin: string }) => {
    if (!data?.workspaceId || !data.origin) throw new Error("Missing workspace or origin");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertWriter(data.workspaceId, context.userId);
    const { executeOne, execute } = await import("@/integrations/mysql/pool");

    const row = await executeOne<{ id: string; app_id: string; status: string }>(
      "SELECT id, app_id, status FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!row) throw new Error("Simpan App ID & App Secret terlebih dahulu");
    if (row.status === "invalid") throw new Error("App ID/Secret belum valid — verifikasi ulang");

    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/meta/callback`;
    const state = `${data.workspaceId}.${crypto.randomUUID()}`;
    await execute(
      "UPDATE crm_meta_settings SET oauth_state = ?, redirect_uri = ? WHERE id = ?",
      [state, redirectUri, row.id],
    );

    const url =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(row.app_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(SCOPES)}&response_type=code`;
    return { url };
  });

/** Memutuskan koneksi: hapus semua token akun & turunkan status ke `verified`. */
export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertWriter(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    await execute("DELETE FROM crm_social_tokens WHERE workspace_id = ?", [data.workspaceId]);
    await execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND source = 'meta'", [data.workspaceId]);
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

/**
 * #54/#55: publikasi sebuah postingan ke akun Meta yang dipilih.
 * Logika intinya ada di `lib/meta-publish.server.ts` supaya bisa dipakai juga
 * oleh hook cron (`/api/public/hooks/social-publish`).
 */
export const publishPostNow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; postId: string }) => {
    if (!data?.workspaceId || !data.postId) throw new Error("Missing post");
    return data;
  })
  .handler(async ({ data, context }): Promise<PublishResult> => {
    await assertWriter(data.workspaceId, context.userId);
    const { publishPost } = await import("@/lib/meta-publish.server");
    const outcome = await publishPost(data.workspaceId, data.postId);
    return { ok: outcome.ok, results: outcome.results };
  });
