/**
 * Callback Facebook Login (BS New 11): menyimpan Facebook Page + akun Instagram Business tertaut
 * beserta token-nya (hanya tabel server `crm_social_tokens`) dan berlangganan webhook Page.
 *
 * - State OAuth `workspaceId.nonce` sekali pakai dan kedaluwarsa (`oauth_expires_at`); hanya berlaku
 *   bila Super Admin mengaktifkan Meta native untuk workspace itu (padanan `crm_consume_meta_state`).
 * - Tidak ada cutover otomatis dari Tebar: bila akun Facebook/Instagram Tebar masih aktif, koneksi
 *   ditolak sampai migrasi diverifikasi (ID penyedia berbeda).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const [workspaceId, nonce] = (url.searchParams.get("state") ?? "").split(".");
        const code = url.searchParams.get("code");
        const back = (q: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `/app/w/${workspaceId}/crm/social-accounts?meta=${q}` },
          });
        if (!workspaceId || !nonce || !/^[0-9a-f-]{36}$/.test(workspaceId))
          return new Response("Bad state", { status: 400 });

        const { execute, executeOne, result, uuid } = await import("@/integrations/mysql/pool");
        const { sqlDateTime } = await import("@/lib/datetime");
        const { metaGraph } = await import("@/lib/meta-publish.server");

        // Konsumsi state: atomik (UPDATE … WHERE state cocok & belum kedaluwarsa) → sekali pakai.
        const s = await executeOne<{
          app_id: string;
          app_secret: string;
          redirect_uri: string | null;
        }>(
          `SELECT app_id, app_secret, redirect_uri FROM crm_meta_settings
            WHERE workspace_id = ? AND oauth_state = ? AND oauth_expires_at > NOW() AND native_social_enabled = 1`,
          [workspaceId, nonce],
        );
        if (!s) return new Response("Invalid or expired state", { status: 400 });
        const consumed = await result(
          "UPDATE crm_meta_settings SET oauth_state = NULL, oauth_expires_at = NULL WHERE workspace_id = ? AND oauth_state = ?",
          [workspaceId, nonce],
        );
        if (!consumed.affectedRows)
          return new Response("Invalid or expired state", { status: 400 });
        if (!code) return back("cancelled");

        try {
          const short = await metaGraph("/oauth/access_token", {
            client_id: s.app_id,
            client_secret: s.app_secret,
            redirect_uri: s.redirect_uri ?? "",
            code,
          });
          const long = await metaGraph("/oauth/access_token", {
            grant_type: "fb_exchange_token",
            client_id: s.app_id,
            client_secret: s.app_secret,
            fb_exchange_token: short.access_token,
          });
          const pages = await metaGraph("/me/accounts", {
            fields: "id,name,access_token,link,instagram_business_account{id,username}",
            access_token: long.access_token,
            limit: "100",
          });

          const legacy = await execute(
            "SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND source = 'tebar' AND platform IN ('facebook', 'instagram') LIMIT 1",
            [workspaceId],
          );
          if (legacy.length)
            throw new Error(
              "Akun Facebook/Instagram Tebar masih aktif. Migrasi native perlu diverifikasi terlebih dahulu.",
            );

          const save = async (
            platform: string,
            externalId: string,
            name: string,
            handle: string | null,
            link: string | null,
            token: string,
            pageId: string,
          ) => {
            const known = await executeOne(
              "SELECT 1 AS ok FROM crm_social_accounts WHERE workspace_id = ? AND platform = ? AND external_id = ?",
              [workspaceId, platform, externalId],
            );
            if (!known) {
              const { assertAccountQuota } = await import("@/lib/qalling-quota.server");
              await assertAccountQuota(workspaceId);
            }
            await execute(
              `INSERT INTO crm_social_accounts (id, workspace_id, platform, external_id, account_name, handle, profile_url, source, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'meta', 'connected')
               ON DUPLICATE KEY UPDATE account_name = VALUES(account_name), handle = VALUES(handle), profile_url = VALUES(profile_url), source = 'meta', status = 'connected'`,
              [uuid(), workspaceId, platform, externalId, name, handle, link],
            );
            const acc = await executeOne<{ id: string }>(
              "SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND platform = ? AND external_id = ?",
              [workspaceId, platform, externalId],
            );
            if (!acc) throw new Error("Kredensial akun tidak dapat disimpan.");
            await execute(
              `INSERT INTO crm_social_tokens (account_id, workspace_id, access_token, page_id) VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), page_id = VALUES(page_id)`,
              [acc.id, workspaceId, token, pageId],
            );
          };

          let count = 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of (pages.data ?? []) as any[]) {
            await metaGraph(
              `/${p.id}/subscribed_apps`,
              {
                access_token: p.access_token,
                subscribed_fields: "messages,messaging_postbacks,feed",
              },
              "POST",
            );
            await save(
              "facebook",
              p.id,
              p.name,
              null,
              p.link ?? `https://facebook.com/${p.id}`,
              p.access_token,
              p.id,
            );
            count++;
            const ig = p.instagram_business_account;
            if (ig?.id) {
              await metaGraph(
                `/${ig.id}/subscribed_apps`,
                { access_token: p.access_token, subscribed_fields: "messages,comments" },
                "POST",
              );
              await save(
                "instagram",
                ig.id,
                ig.username ?? p.name,
                ig.username ?? null,
                ig.username ? `https://instagram.com/${ig.username}` : null,
                p.access_token,
                p.id,
              );
              count++;
            }
          }
          await execute(
            "UPDATE crm_meta_settings SET status = ?, connected_at = ?, last_error = ? WHERE workspace_id = ?",
            [
              count ? "connected" : "verified",
              count ? sqlDateTime() : null,
              count ? null : "No Facebook Page found",
              workspaceId,
            ],
          );
          return back(count ? "ok" : "nopage");
        } catch (e) {
          await execute("UPDATE crm_meta_settings SET last_error = ? WHERE workspace_id = ?", [
            (e as Error).message,
            workspaceId,
          ]);
          return back("error");
        }
      },
    },
  },
});
