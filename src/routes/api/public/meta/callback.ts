/**
 * #55 (BS New 3): callback Facebook Login untuk workspace.
 * Menyimpan Facebook Page (+ akun Instagram Business yang tertaut) beserta
 * access token-nya. Token hanya hidup di tabel server (`crm_social_tokens`) dan
 * tidak pernah dikirim ke browser.
 *
 * Catatan porting: Supabase Admin → server fn MySQL (`@/integrations/mysql/pool`),
 * upsert `onConflict` → `INSERT ... ON DUPLICATE KEY UPDATE`.
 */
import { createFileRoute } from "@tanstack/react-router";

const GRAPH = "https://graph.facebook.com/v21.0";

interface GraphError {
  error?: { message?: string };
}
interface TokenResponse extends GraphError {
  access_token?: string;
}
interface PagesResponse extends GraphError {
  data?: {
    id: string;
    name: string;
    access_token: string;
    link?: string;
    instagram_business_account?: { id: string; username?: string };
  }[];
}

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
        if (!workspaceId || !nonce || !/^[0-9a-f-]{36}$/.test(workspaceId)) {
          return new Response("Bad state", { status: 400 });
        }

        const { execute, executeOne } = await import("@/integrations/mysql/pool");
        const { sqlDateTime } = await import("@/lib/datetime");

        const settings = await executeOne<{
          id: string;
          app_id: string;
          app_secret: string;
          oauth_state: string | null;
          redirect_uri: string | null;
        }>(
          "SELECT id, app_id, app_secret, oauth_state, redirect_uri FROM crm_meta_settings WHERE workspace_id = ? LIMIT 1",
          [workspaceId],
        );
        if (!settings || !settings.oauth_state || settings.oauth_state !== nonce) {
          return new Response("Invalid state", { status: 400 });
        }
        await execute("UPDATE crm_meta_settings SET oauth_state = NULL WHERE id = ?", [settings.id]);
        if (!code) return back("cancelled");

        const graph = async (path: string, params: Record<string, string>) => {
          const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params).toString()}`);
          return (await res.json()) as Record<string, unknown>;
        };

        try {
          const short = (await graph("/oauth/access_token", {
            client_id: settings.app_id,
            client_secret: settings.app_secret,
            redirect_uri: settings.redirect_uri ?? "",
            code,
          })) as TokenResponse;
          if (!short.access_token) throw new Error(short.error?.message ?? "Gagal menukar kode OAuth");

          const long = (await graph("/oauth/access_token", {
            grant_type: "fb_exchange_token",
            client_id: settings.app_id,
            client_secret: settings.app_secret,
            fb_exchange_token: short.access_token,
          })) as TokenResponse;
          const userToken = long.access_token ?? short.access_token;

          const pages = (await graph("/me/accounts", {
            fields: "id,name,access_token,link,instagram_business_account{id,username}",
            access_token: userToken,
            limit: "100",
          })) as PagesResponse;
          if (pages.error?.message) throw new Error(pages.error.message);

          const saveAccount = async (
            platform: string,
            externalId: string,
            name: string,
            handle: string | null,
            link: string | null,
            token: string,
          ) => {
            const { uuid } = await import("@/integrations/mysql/pool");
            await execute(
              `INSERT INTO crm_social_accounts
                 (id, workspace_id, platform, external_id, account_name, handle, profile_url, source, status, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'meta', 'connected', ?)
               ON DUPLICATE KEY UPDATE account_name = VALUES(account_name), handle = VALUES(handle),
                 profile_url = VALUES(profile_url), source = 'meta', status = 'connected'`,
              [uuid(), workspaceId, platform, externalId, name, handle, link, sqlDateTime()],
            );
            const account = await executeOne<{ id: string }>(
              "SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND platform = ? AND external_id = ? LIMIT 1",
              [workspaceId, platform, externalId],
            );
            if (!account) return;
            await execute(
              `INSERT INTO crm_social_tokens (account_id, workspace_id, access_token, updated_at)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), updated_at = VALUES(updated_at)`,
              [account.id, workspaceId, token, sqlDateTime()],
            );
          };

          let count = 0;
          for (const page of pages.data ?? []) {
            await saveAccount("facebook", page.id, page.name, null, page.link ?? `https://facebook.com/${page.id}`, page.access_token);
            count += 1;
            const ig = page.instagram_business_account;
            if (ig?.id) {
              await saveAccount(
                "instagram",
                ig.id,
                ig.username ?? page.name,
                ig.username ?? null,
                ig.username ? `https://instagram.com/${ig.username}` : null,
                page.access_token,
              );
              count += 1;
            }
          }

          await execute(
            "UPDATE crm_meta_settings SET status = ?, connected_at = ?, last_error = ? WHERE id = ?",
            [
              count ? "connected" : "verified",
              count ? sqlDateTime() : null,
              count ? null : "No Facebook Page found",
              settings.id,
            ],
          );
          return back(count ? "ok" : "nopage");
        } catch (err) {
          await execute("UPDATE crm_meta_settings SET last_error = ? WHERE id = ?", [
            err instanceof Error ? err.message : "Meta callback failed",
            settings.id,
          ]);
          return back("error");
        }
      },
    },
  },
});
