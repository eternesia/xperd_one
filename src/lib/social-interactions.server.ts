/**
 * Qalling — pengiriman balasan Meta (DM/komentar), automasi, dan ingest pesan masuk.
 * Diporting dari BS New 11 (`social-interactions.server.ts` + fungsi SQL `crm_ingest_meta_message`).
 * Di Old tidak ada trigger/fungsi MySQL: ingest dilakukan di transaksi aplikasi
 * (`SELECT … FOR UPDATE`), klaim automasi memakai kunci unik `(rule_id, event_id)`.
 */
import { execute, executeOne, result, transaction, uuid } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { automationMatches } from "./social-interaction-rules";
import { canLikeOn, dmTextWithLink } from "./automation-payload";

/** Basis Graph API; bisa ditimpa (`META_GRAPH_BASE`) untuk server tiruan saat uji. */
export const GRAPH_BASE = (
  process.env.META_GRAPH_BASE ?? "https://graph.facebook.com/v21.0"
).replace(/\/$/, "");

/**
 * Fitur Qalling aktif untuk workspace (entitlement tier + opsi; add-on lama tanpa tier = semua fitur).
 * `feature` default `publishing`; inbox → `inbox_dm`, komentar → `comments`, automasi → `automations`.
 */
export async function workspaceHasQalling(
  workspaceId: string,
  feature = "publishing",
): Promise<boolean> {
  const { workspaceHasFeature } = await import("./entitlements.server");
  return workspaceHasFeature(workspaceId, feature);
}

export type SendStatus = "sent" | "failed" | "unknown";

export async function sendMetaInteraction(
  workspaceId: string,
  accountId: string,
  kind: "dm" | "comment",
  target: string,
  body: string,
): Promise<SendStatus> {
  const [a, s, secret] = await Promise.all([
    executeOne<{ platform: string; external_id: string | null; source: string; status: string }>(
      "SELECT platform, external_id, source, status FROM crm_social_accounts WHERE workspace_id = ? AND id = ?",
      [workspaceId, accountId],
    ),
    executeOne<{ native_social_enabled: number }>(
      "SELECT native_social_enabled FROM crm_meta_settings WHERE workspace_id = ?",
      [workspaceId],
    ),
    executeOne<{ access_token: string; page_id: string | null }>(
      "SELECT access_token, page_id FROM crm_social_tokens WHERE workspace_id = ? AND account_id = ?",
      [workspaceId, accountId],
    ),
  ]);
  if (
    a?.source !== "meta" ||
    a.status !== "connected" ||
    !s?.native_social_enabled ||
    !secret?.access_token
  )
    return "failed";
  const path =
    kind === "dm"
      ? `${a.platform === "instagram" ? a.external_id : (secret.page_id ?? a.external_id)}/messages`
      : `${target}/${a.platform === "instagram" ? "replies" : "comments"}`;
  const payload =
    kind === "comment"
      ? { message: body }
      : {
          recipient: { id: target },
          message: { text: body },
          ...(a.platform === "facebook" ? { messaging_type: "RESPONSE" } : {}),
        };
  try {
    const res = await fetch(`${GRAPH_BASE}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return res.status >= 500 ? "unknown" : "failed";
    const out = (await res.json()) as { id?: string; message_id?: string };
    return out.id || out.message_id ? "sent" : "unknown";
  } catch {
    return "unknown";
  }
}

export interface AutomationEvent {
  workspaceId: string;
  accountId: string;
  kind: "dm" | "comment";
  eventId: string;
  target: string;
  body: string;
  at?: string;
  conversationId?: string;
}

interface RuleRow {
  id: string;
  keyword: string;
  reply_body: string;
  action_kind: string;
  public_reply: string | null;
  link_label: string | null;
  link_url: string | null;
  track_clicks: number;
  follow_gate: number;
  follow_ask: string | null;
  follow_retry: string | null;
  auto_like: number;
}

async function metaCreds(workspaceId: string, accountId: string) {
  const [a, t] = await Promise.all([
    executeOne<{ platform: string; external_id: string | null }>(
      "SELECT platform, external_id FROM crm_social_accounts WHERE workspace_id = ? AND id = ?",
      [workspaceId, accountId],
    ),
    executeOne<{ access_token: string; page_id: string | null }>(
      "SELECT access_token, page_id FROM crm_social_tokens WHERE workspace_id = ? AND account_id = ?",
      [workspaceId, accountId],
    ),
  ]);
  return a && t?.access_token ? { a, t } : null;
}

/** Balasan privat atas komentar (satu DM per komentar — aturan Meta). */
export async function sendMetaPrivateReply(
  workspaceId: string,
  accountId: string,
  commentId: string,
  text: string,
): Promise<SendStatus> {
  const c = await metaCreds(workspaceId, accountId);
  if (!c) return "failed";
  const sender = c.a.platform === "instagram" ? c.a.external_id : (c.t.page_id ?? c.a.external_id);
  try {
    const res = await fetch(`${GRAPH_BASE}/${sender}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.t.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return res.status >= 500 ? "unknown" : "failed";
    return "sent";
  } catch {
    return "unknown";
  }
}

/** Instagram: `is_user_follow_business` untuk pengguna yang pernah mengirim pesan; tidak diketahui = belum follow. */
export async function metaUserFollows(workspaceId: string, accountId: string, userId: string) {
  const c = await metaCreds(workspaceId, accountId);
  if (!c) return false;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(userId)}?fields=is_user_follow_business`,
      {
        headers: { Authorization: `Bearer ${c.t.access_token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return false;
    return (
      ((await res.json()) as { is_user_follow_business?: boolean }).is_user_follow_business === true
    );
  } catch {
    return false;
  }
}

/** Like komentar sebagai akun. Tebar: Facebook/TikTok; Meta native: Halaman Facebook. */
export async function likeCommentsCore(workspaceId: string, commentIds: string[]) {
  const out = { liked: 0, skipped: 0, failed: 0 };
  if (!commentIds.length) return out;
  const rows = await execute<{
    id: string;
    provider_comment_id: string;
    account_id: string;
    liked_at: string | null;
    platform: string | null;
    source: string | null;
  }>(
    `SELECT c.id, c.provider_comment_id, c.account_id, c.liked_at, a.platform, a.source
       FROM crm_social_comments c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
      WHERE c.workspace_id = ? AND c.id IN (${commentIds.map(() => "?").join(",")})`,
    [workspaceId, ...commentIds],
  );
  for (const c of rows) {
    if (c.liked_at) {
      out.skipped++;
      continue;
    }
    if (!canLikeOn(c.platform) || (c.source === "meta" && c.platform !== "facebook")) {
      out.skipped++;
      continue;
    }
    let ok = false;
    if (c.source === "tebar") {
      const { likeTebarComment } = await import("./tebar-interactions.server");
      ok = await likeTebarComment(workspaceId, c.provider_comment_id);
    } else if (c.source === "meta") {
      const t = await executeOne<{ access_token: string }>(
        "SELECT access_token FROM crm_social_tokens WHERE workspace_id = ? AND account_id = ?",
        [workspaceId, c.account_id],
      );
      if (t?.access_token) {
        try {
          const r = await fetch(`${GRAPH_BASE}/${c.provider_comment_id}/likes`, {
            method: "POST",
            headers: { Authorization: `Bearer ${t.access_token}` },
            signal: AbortSignal.timeout(10000),
          });
          ok = r.ok;
        } catch {
          ok = false;
        }
      }
    }
    if (ok) {
      out.liked++;
      await execute("UPDATE crm_social_comments SET liked_at = NOW(6) WHERE id = ?", [c.id]);
    } else out.failed++;
  }
  return out;
}

export async function dispatchSocialAutomation(event: AutomationEvent) {
  // Pesan lama tidak boleh membuka ulang kebijakan 24 jam atau memicu balasan otomatis historis.
  if (event.kind === "dm" && (!event.at || Date.parse(event.at) < Date.now() - 24 * 3600000))
    return;
  if (!(await workspaceHasQalling(event.workspaceId, "automations"))) return;
  const rules = await execute<RuleRow>(
    `SELECT * FROM crm_automation_rules
      WHERE workspace_id = ? AND account_id = ? AND trigger_type = ? AND enabled = 1
      ORDER BY created_at LIMIT 100`,
    [event.workspaceId, event.accountId, event.kind],
  );
  const rule = rules.find((r) => automationMatches(r.keyword, event.body));
  if (!rule) return;
  let claimedId: string | null = null;
  if (event.kind === "comment") {
    const claimed = await result(
      "UPDATE crm_social_comments SET status = 'sending', reply = ? WHERE account_id = ? AND provider_comment_id = ? AND status = 'open'",
      [rule.reply_body, event.accountId, event.eventId],
    );
    if (!claimed.affectedRows) return;
    claimedId =
      (
        await executeOne<{ id: string }>(
          "SELECT id FROM crm_social_comments WHERE account_id = ? AND provider_comment_id = ?",
          [event.accountId, event.eventId],
        )
      )?.id ?? null;
  }
  // Klaim durable: kunci unik (rule_id, event_id) mencegah balasan ganda setelah hasil ambigu.
  const runId = uuid();
  try {
    await execute(
      "INSERT INTO crm_automation_runs (id, workspace_id, rule_id, event_id) VALUES (?, ?, ?, ?)",
      [runId, event.workspaceId, rule.id, event.eventId],
    );
  } catch {
    return;
  }
  if (event.kind === "comment" && rule.auto_like && claimedId)
    await likeCommentsCore(event.workspaceId, [claimedId]).catch(() => null);
  const origin = process.env.PUBLIC_APP_ORIGIN || "https://qalling.id";
  const dmText = dmTextWithLink(
    {
      reply: rule.reply_body,
      linkLabel: rule.link_label,
      linkUrl: rule.link_url,
      trackClicks: Boolean(rule.track_clicks),
    },
    rule.id,
    origin,
  );
  let status: SendStatus;
  if (event.kind === "comment" && rule.action_kind === "comment_to_dm") {
    // Instagram: satu balasan privat per komentar; dengan follow gate yang dikirim lebih dulu adalah ajakan follow.
    status = await sendMetaPrivateReply(
      event.workspaceId,
      event.accountId,
      event.target,
      rule.follow_gate ? rule.follow_ask || dmText : dmText,
    );
    if (rule.public_reply)
      await sendMetaInteraction(
        event.workspaceId,
        event.accountId,
        "comment",
        event.target,
        rule.public_reply,
      );
  } else if (event.kind === "dm" && rule.follow_gate) {
    const follows = await metaUserFollows(event.workspaceId, event.accountId, event.target);
    status = await sendMetaInteraction(
      event.workspaceId,
      event.accountId,
      "dm",
      event.target,
      follows ? dmText : rule.follow_retry || rule.follow_ask || dmText,
    );
  } else {
    status = await sendMetaInteraction(
      event.workspaceId,
      event.accountId,
      event.kind,
      event.target,
      event.kind === "dm" ? dmText : rule.reply_body,
    );
  }
  await execute("UPDATE crm_automation_runs SET status = ?, error = ? WHERE id = ?", [
    status,
    status === "sent"
      ? null
      : "Periksa koneksi dan izin Meta; jangan kirim ulang bila status unknown.",
    runId,
  ]);
  if (event.kind === "comment") {
    await execute(
      "UPDATE crm_social_comments SET status = ?, reply = ? WHERE account_id = ? AND provider_comment_id = ?",
      [status, rule.reply_body, event.accountId, event.eventId],
    );
  }
  if (event.kind === "dm" && event.conversationId) {
    await execute(
      "INSERT INTO crm_messages (id, workspace_id, conversation_id, direction, body, status) VALUES (?, ?, ?, 'outbound', ?, ?)",
      [uuid(), event.workspaceId, event.conversationId, rule.reply_body, status],
    );
    if (status === "sent") {
      await execute(
        "UPDATE crm_conversations SET last_message = ?, last_message_at = ? WHERE id = ? AND workspace_id = ?",
        [rule.reply_body, sqlDateTime(new Date()), event.conversationId, event.workspaceId],
      );
    }
  }
}

export interface IngestInput {
  accountId: string;
  participant: string;
  mid: string;
  body: string;
  at: string;
  echo: boolean;
  attachments: unknown[];
}

/** Padanan `crm_ingest_meta_message`: upsert percakapan + pesan idempoten + hitung ulang ringkasan. */
export async function ingestMetaMessage(input: IngestInput): Promise<string | null> {
  const at = new Date(input.at);
  const atSql = sqlDateTime(at).concat(`.${String(at.getUTCMilliseconds()).padStart(3, "0")}`);
  return transaction(async (conn) => {
    const [accounts] = await conn.execute(
      "SELECT id, workspace_id FROM crm_social_accounts WHERE id = ? AND source = 'meta' AND status = 'connected'",
      [input.accountId],
    );
    const account = (accounts as { id: string; workspace_id: string }[])[0];
    if (!account) return null;
    const [settings] = await conn.execute(
      "SELECT 1 AS ok FROM crm_meta_settings WHERE workspace_id = ? AND native_social_enabled = 1",
      [account.workspace_id],
    );
    if (
      !(settings as unknown[]).length ||
      !(await workspaceHasQalling(account.workspace_id, "inbox_dm"))
    )
      return null;

    await conn.execute(
      // last_message_at awal = waktu pesan pertama (bukan "sekarang"): kalau tidak, event Meta yang
      // lebih awal dari waktu insert tak akan pernah mengisi last_message (deviasi kecil dari New 11).
      `INSERT INTO crm_conversations (id, workspace_id, account_id, participant_id, participant_name, last_message, last_message_at)
       VALUES (?, ?, ?, ?, ?, '', ?) ON DUPLICATE KEY UPDATE id = id`,
      [uuid(), account.workspace_id, account.id, input.participant, input.participant, atSql],
    );
    const [convs] = await conn.execute(
      "SELECT id FROM crm_conversations WHERE account_id = ? AND participant_id = ? FOR UPDATE",
      [account.id, input.participant],
    );
    const conversationId = (convs as { id: string }[])[0].id;
    const inserted = await conn.execute(
      `INSERT IGNORE INTO crm_messages (id, workspace_id, conversation_id, provider_message_id, direction, body, attachments, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        account.workspace_id,
        conversationId,
        input.mid,
        input.echo ? "outbound" : "inbound",
        input.body,
        JSON.stringify(input.attachments ?? []),
        input.echo ? "sent" : "received",
        atSql,
      ],
    );
    // Pesan yang sama (mid) sudah pernah masuk: tidak mengubah ringkasan percakapan.
    if (!(inserted[0] as { affectedRows: number }).affectedRows) return conversationId;
    await conn.execute(
      `UPDATE crm_conversations SET
         last_message = IF(? >= last_message_at, ?, last_message),
         last_message_at = GREATEST(last_message_at, ?),
         last_inbound_at = IF(?, last_inbound_at, GREATEST(COALESCE(last_inbound_at, ?), ?)),
         reply_window_expires_at = IF(?, reply_window_expires_at, GREATEST(COALESCE(reply_window_expires_at, ?), DATE_ADD(?, INTERVAL 24 HOUR))),
         unread_count = unread_count + IF(?, 0, 1),
         status = IF(?, status, 'open')
       WHERE id = ?`,
      [
        atSql,
        input.body,
        atSql,
        input.echo ? 1 : 0,
        atSql,
        atSql,
        input.echo ? 1 : 0,
        atSql,
        atSql,
        input.echo ? 1 : 0,
        input.echo ? 1 : 0,
        conversationId,
      ],
    );
    return conversationId;
  });
}
