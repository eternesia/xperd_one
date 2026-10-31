/**
 * Mesin sosial hibrid (BS New 12 `tebar-interactions.server.ts`): akun `source=tebar` menjalankan komentar, DM dan
 * automasi lewat API Tebar (header profil = id workspace; sinkron tarik saat halaman dibuka). Kode Tebar disalin dari
 * New 12; akses data Supabase diganti MySQL.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { execute, executeOne } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { getTebarKey, tebarFetch } from "./tebar.server";
import { canLikeOn, toTebarAutomation, type AutomationInput } from "./automation-payload";

/** Sumber waktu Tebar → string DATETIME UTC. */
const ts = (v: any) => sqlDateTime(v ? new Date(v) : new Date());
const prof = (workspaceId: string) => ({ "Tebar-Profile": workspaceId });
const rows = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);

export async function tebarKeyOrThrow() {
  const key = await getTebarKey();
  if (!key) throw new Error("Koneksi Tebar belum dikonfigurasi Super Admin.");
  return key;
}

/** Like komentar baru (≤7 hari) bila akun punya aturan komentar `auto_like` aktif. */
async function autoLikeNew(key: string, workspaceId: string, accountId: string) {
  const rule = await executeOne(
    `SELECT id FROM crm_automation_rules WHERE workspace_id = ? AND account_id = ? AND trigger_type = 'comment'
        AND enabled = 1 AND auto_like = 1 LIMIT 1`,
    [workspaceId, accountId],
  );
  if (!rule) return;
  const since = sqlDateTime(new Date(Date.now() - 7 * 864e5));
  const list = await execute<{ id: string; provider_comment_id: string }>(
    `SELECT id, provider_comment_id FROM crm_social_comments
      WHERE account_id = ? AND liked_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 30`,
    [accountId, since],
  );
  for (const c of list) {
    try {
      await tebarFetch(key, `/comments/${encodeURIComponent(c.provider_comment_id)}/like`, {
        method: "POST",
        headers: prof(workspaceId),
        body: JSON.stringify({ liked: true }),
        signal: AbortSignal.timeout(10000),
      });
      await execute("UPDATE crm_social_comments SET liked_at = NOW(6) WHERE id = ?", [c.id]);
    } catch {
      /* tidak didukung atau terkena rate limit: biarkan untuk sinkron berikutnya */
    }
  }
}

/** Tarik komentar & percakapan DM dari Tebar ke tabel CRM bersama. Idempoten lewat kunci unik. */
export async function syncTebarInteractions(workspaceId: string) {
  const key = await getTebarKey();
  if (!key) return { accounts: 0, comments: 0, conversations: 0, skipped: true };
  const accounts = await execute<{ id: string; external_id: string | null; platform: string }>(
    `SELECT id, external_id, platform FROM crm_social_accounts
      WHERE workspace_id = ? AND source = 'tebar' AND status = 'connected'`,
    [workspaceId],
  );
  let comments = 0;
  let conversations = 0;
  for (const a of accounts) {
    if (!a.external_id) continue;
    const acc = encodeURIComponent(a.external_id);
    try {
      const j = await tebarFetch(key, `/comments?account_id=${acc}&limit=100`, {
        headers: prof(workspaceId),
      });
      for (const c of rows(j)) {
        const status =
          c.reply_status === "replied" || c.reply_status === "done" ? "replied" : "open";
        const res = await execute(
          `INSERT IGNORE INTO crm_social_comments (id, workspace_id, account_id, provider_comment_id, post_id, author_name, body, status, created_at)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            workspaceId,
            a.id,
            String(c.id),
            String(c.post_id ?? c.platform_post_id ?? c.media_id ?? "-"),
            String(c.author_username ?? c.author_name ?? c.username ?? "Pengguna"),
            String(c.text ?? c.message ?? ""),
            status,
            ts(c.commented_at ?? c.created_at),
          ],
        );
        if ((res as unknown as { affectedRows?: number }).affectedRows) comments++;
      }
      if (canLikeOn(a.platform)) await autoLikeNew(key, workspaceId, a.id);
    } catch (e) {
      console.error("tebar comments sync", (e as Error).message);
    }
    if (a.platform !== "instagram") continue;
    try {
      const j = await tebarFetch(key, `/inbox/conversations?account_id=${acc}&limit=50`, {
        headers: prof(workspaceId),
      });
      for (const c of rows(j)) {
        const convId = String(c.id);
        await execute(
          `INSERT INTO crm_conversations (id, workspace_id, account_id, participant_id, participant_name, last_message, last_message_at,
                                          reply_window_expires_at, unread_count, status)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE participant_name = VALUES(participant_name), last_message = VALUES(last_message),
             last_message_at = VALUES(last_message_at), reply_window_expires_at = VALUES(reply_window_expires_at),
             unread_count = VALUES(unread_count), status = VALUES(status)`,
          [
            workspaceId,
            a.id,
            convId,
            String(
              c.participant_username ?? c.participant_name ?? c.username ?? c.name ?? "Pelanggan",
            ),
            String(c.last_message?.text ?? c.last_message_text ?? c.snippet ?? ""),
            ts(c.last_message_at ?? c.updated_at),
            c.window_expires_at ? ts(c.window_expires_at) : null,
            Number(c.unread_count ?? 0),
            c.status === "done" ? "resolved" : "open",
          ],
        );
        const conv = await executeOne<{ id: string }>(
          "SELECT id FROM crm_conversations WHERE account_id = ? AND participant_id = ?",
          [a.id, convId],
        );
        if (!conv) continue;
        conversations++;
        try {
          const m = await tebarFetch(
            key,
            `/inbox/conversations/${encodeURIComponent(convId)}/messages?limit=30`,
            {
              headers: prof(workspaceId),
            },
          );
          for (const x of rows(m)) {
            const out = x.direction === "outbound" || x.from_me === true || x.is_echo === true;
            const st = String(x.status ?? "");
            await execute(
              `INSERT IGNORE INTO crm_messages (id, workspace_id, conversation_id, provider_message_id, direction, body, status, created_at)
               VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
              [
                workspaceId,
                conv.id,
                String(x.id),
                out ? "outbound" : "inbound",
                String(x.text ?? x.postback?.title ?? ""),
                out
                  ? ["sent", "failed", "unknown"].includes(st)
                    ? st
                    : st === "pending"
                      ? "sending"
                      : "sent"
                  : "received",
                ts(x.sent_at ?? x.created_at),
              ],
            );
          }
        } catch (e) {
          console.error("tebar messages sync", (e as Error).message);
        }
      }
    } catch (e) {
      console.error("tebar inbox sync", (e as Error).message);
    }
  }
  return { accounts: accounts.length, comments, conversations, skipped: false };
}

export async function replyTebarComment(
  workspaceId: string,
  commentId: string,
  text: string,
): Promise<"sent" | "failed" | "unknown"> {
  const key = await tebarKeyOrThrow();
  try {
    await tebarFetch(key, `/comments/${encodeURIComponent(commentId)}/reply`, {
      method: "POST",
      headers: prof(workspaceId),
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    return "sent";
  } catch (e) {
    return (e as Error).name === "TimeoutError" ? "unknown" : "failed";
  }
}

/** Idempotency-Key = id pesan kita, sehingga percobaan ulang yang ambigu tak menggandakan DM. */
export async function sendTebarDm(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  text: string,
) {
  const key = await tebarKeyOrThrow();
  try {
    const r = await tebarFetch(
      key,
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: { ...prof(workspaceId), "Idempotency-Key": messageId },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const m = r.data ?? r;
    return {
      status: (m?.status === "failed" ? "failed" : "sent") as "sent" | "failed" | "unknown",
      providerId: m?.id ? String(m.id) : null,
    };
  } catch (e) {
    return {
      status: ((e as Error).name === "TimeoutError" ? "unknown" : "failed") as
        "sent" | "failed" | "unknown",
      providerId: null,
    };
  }
}

/** Cerminkan aturan CRM menjadi automasi Tebar; Tebar menjalankannya di sisinya. */
export async function upsertTebarAutomation(
  workspaceId: string,
  opts: AutomationInput & {
    externalId: string | null;
    accountExternalId: string;
    remove?: boolean;
  },
) {
  const key = await tebarKeyOrThrow();
  const h = prof(workspaceId);
  if (opts.remove) {
    if (opts.externalId)
      await tebarFetch(key, `/automations/${encodeURIComponent(opts.externalId)}`, {
        method: "DELETE",
        headers: h,
      }).catch(() => null);
    return null;
  }
  const body = toTebarAutomation(opts.accountExternalId, opts);
  const r = opts.externalId
    ? await tebarFetch(key, `/automations/${encodeURIComponent(opts.externalId)}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify(body),
      })
    : await tebarFetch(key, "/automations", {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
  const a = r.data ?? r;
  return a?.id ? String(a.id) : opts.externalId;
}

/** Like komentar sebagai akun (Tebar mendukung Halaman Facebook dan TikTok). */
export async function likeTebarComment(workspaceId: string, commentId: string) {
  const key = await tebarKeyOrThrow();
  try {
    await tebarFetch(key, `/comments/${encodeURIComponent(commentId)}/like`, {
      method: "POST",
      headers: prof(workspaceId),
      body: JSON.stringify({ liked: true }),
      signal: AbortSignal.timeout(15000),
    });
    return true;
  } catch {
    return false;
  }
}
