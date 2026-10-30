/**
 * Webhook Meta native (DM + komentar) — diporting dari BS New 11.
 * GET  : handshake `hub.verify_token` (hanya workspace dengan native_social_enabled).
 * POST : wajib bertanda tangan `x-hub-signature-256` (HMAC-SHA256 dengan App Secret workspace);
 *        pesan masuk di-ingest idempoten, lalu automasi dijalankan. Tanpa tanda tangan valid → 401.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeMetaMessages } from "@/lib/meta-inbox-rules";
import { normalizeMetaComments } from "@/lib/social-interaction-rules";

function validSignature(raw: string, secret: string, signature: string | null) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

function parsePayload(
  raw: string,
): { object: "page" | "instagram"; entry: { id: string; messaging?: unknown[] }[] } | null {
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      (p.object !== "page" && p.object !== "instagram") ||
      !Array.isArray(p.entry) ||
      p.entry.length > 100
    )
      return null;
    for (const e of p.entry) {
      if (!e || typeof e.id !== "string" || !e.id || e.id.length > 200) return null;
      if (e.messaging !== undefined && (!Array.isArray(e.messaging) || e.messaging.length > 100))
        return null;
    }
    return p;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/meta/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const token = u.searchParams.get("hub.verify_token");
        const challenge = u.searchParams.get("hub.challenge");
        if (
          u.searchParams.get("hub.mode") !== "subscribe" ||
          !token ||
          !challenge ||
          challenge.length > 200
        ) {
          return new Response("Invalid verification", { status: 403 });
        }
        const { executeOne } = await import("@/integrations/mysql/pool");
        const row = await executeOne(
          "SELECT id FROM crm_meta_settings WHERE native_social_enabled = 1 AND webhook_verify_token = ? LIMIT 1",
          [token],
        );
        return row
          ? new Response(challenge)
          : new Response("Invalid verification", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 1_000_000) return new Response("Payload too large", { status: 413 });
        const payload = parsePayload(raw);
        if (!payload) return new Response("Invalid payload", { status: 400 });

        const { execute, query, result, uuid } = await import("@/integrations/mysql/pool");
        let settings: { workspace_id: string; app_secret: string }[];
        try {
          settings = await execute(
            "SELECT workspace_id, app_secret FROM crm_meta_settings WHERE native_social_enabled = 1",
          );
        } catch {
          return new Response("Unavailable", { status: 503 });
        }
        const sig = request.headers.get("x-hub-signature-256");
        const authorized = settings
          .filter((s) => validSignature(raw, s.app_secret, sig))
          .map((s) => s.workspace_id);
        if (!authorized.length) return new Response("Invalid signature", { status: 401 });

        const { ingestMetaMessage, dispatchSocialAutomation, workspaceHasQalling } =
          await import("@/lib/social-interactions.server");
        const accountsFor = (externalId: string) =>
          query<{ id: string; workspace_id: string }>(
            "SELECT id, workspace_id FROM crm_social_accounts WHERE workspace_id IN (?) AND source = 'meta' AND status = 'connected' AND external_id = ?",
            [authorized, externalId],
          );
        try {
          for (const m of normalizeMetaMessages(payload)) {
            if (Date.parse(m.at) > Date.now() + 60_000) continue;
            for (const a of await accountsFor(m.accountExternalId)) {
              const conversationId = await ingestMetaMessage({
                accountId: a.id,
                participant: m.participant,
                mid: m.mid,
                body: m.body.slice(0, 10000),
                at: m.at,
                echo: m.echo,
                attachments: m.attachments,
              });
              if (!m.echo && conversationId) {
                await dispatchSocialAutomation({
                  workspaceId: a.workspace_id,
                  accountId: a.id,
                  kind: "dm",
                  eventId: m.mid,
                  target: m.participant,
                  body: m.body,
                  at: m.at,
                  conversationId,
                });
              }
            }
          }
          for (const c of normalizeMetaComments(payload)) {
            for (const a of await accountsFor(c.accountExternalId)) {
              if (!(await workspaceHasQalling(a.workspace_id, "comments"))) continue;
              if (c.removed) {
                await result(
                  "UPDATE crm_social_comments SET status = 'removed' WHERE account_id = ? AND provider_comment_id = ?",
                  [a.id, c.commentId],
                );
                continue;
              }
              await execute(
                `INSERT IGNORE INTO crm_social_comments (id, workspace_id, account_id, provider_comment_id, post_id, author_name, body)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [uuid(), a.workspace_id, a.id, c.commentId, c.postId, c.author, c.body],
              );
              await dispatchSocialAutomation({
                workspaceId: a.workspace_id,
                accountId: a.id,
                kind: "comment",
                eventId: c.commentId,
                target: c.commentId,
                body: c.body,
              });
            }
          }
        } catch {
          return new Response("Retry later", { status: 503 });
        }
        return new Response("EVENT_RECEIVED");
      },
    },
  },
});
