/**
 * Inti logika Inbox / Komentar / Automasi Qalling (tanpa autentikasi).
 * Dipakai bersama oleh server fn UI (social-interactions.functions.ts) dan tool MCP; pemanggil WAJIB
 * sudah memeriksa keanggotaan, izin tulis dan paket workspace sebelum memanggil fungsi-fungsi di sini.
 */
import { replyWindowOpen } from "./meta-inbox-rules";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
void isId;

export async function replyCommentCore(data: {
  workspaceId: string;
  commentId: string;
  body: string;
}) {
  const { executeOne, result, execute } = await import("@/integrations/mysql/pool");
  const { sendMetaInteraction } = await import("@/lib/social-interactions.server");
  const c = await executeOne<{
    id: string;
    account_id: string;
    provider_comment_id: string;
    status: string;
  }>(
    "SELECT id, account_id, provider_comment_id, status FROM crm_social_comments WHERE id = ? AND workspace_id = ?",
    [data.commentId, data.workspaceId],
  );
  if (!c || c.status !== "open") throw new Error("Komentar sudah ditangani atau tidak tersedia.");
  const claimed = await result(
    "UPDATE crm_social_comments SET status = 'sending', reply = ? WHERE id = ? AND status = 'open'",
    [data.body, c.id],
  );
  if (!claimed.affectedRows) throw new Error("Balasan sedang diproses.");
  const acct = await executeOne<{ source: string }>(
    "SELECT source FROM crm_social_accounts WHERE id = ?",
    [c.account_id],
  );
  let status: string;
  if (acct?.source === "tebar") {
    const { replyTebarComment } = await import("@/lib/tebar-interactions.server");
    status = await replyTebarComment(data.workspaceId, c.provider_comment_id, data.body);
    if (status === "failed") {
      await execute("UPDATE crm_social_comments SET status = 'open' WHERE id = ?", [c.id]);
      return { status };
    }
    if (status === "sent") status = "replied";
  } else {
    status = await sendMetaInteraction(
      data.workspaceId,
      c.account_id,
      "comment",
      c.provider_comment_id,
      data.body,
    );
  }
  await execute("UPDATE crm_social_comments SET status = ? WHERE id = ?", [status, c.id]);
  return { status };
}

export interface ManageInput {
  workspaceId: string;
  id?: string;
  remove?: boolean;
  accountId: string;
  name: string;
  trigger: "dm" | "comment";
  action?: "reply" | "comment_to_dm";
  keyword: string;
  reply: string;
  publicReply?: string | null;
  linkLabel?: string | null;
  linkUrl?: string | null;
  trackClicks?: boolean;
  followGate?: boolean;
  followAsk?: string | null;
  followButton?: string | null;
  followRetry?: string | null;
  autoLike?: boolean;
  enabled: boolean;
}

export type ManageData = Omit<
  ManageInput,
  | "action"
  | "publicReply"
  | "linkLabel"
  | "linkUrl"
  | "followAsk"
  | "followButton"
  | "followRetry"
  | "trackClicks"
  | "followGate"
  | "autoLike"
> & {
  action: "reply" | "comment_to_dm";
  publicReply: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  followAsk: string | null;
  followButton: string | null;
  followRetry: string | null;
  trackClicks: boolean;
  followGate: boolean;
  autoLike: boolean;
};

export async function manageAutomationCore(data: ManageData) {
  const { validateAutomation } = await import("@/lib/automation-payload");
  if (!data.remove) {
    const err = validateAutomation({
      name: data.name,
      trigger: data.trigger,
      action: data.trigger === "dm" ? "reply" : data.action,
      keyword: data.keyword,
      reply: data.reply,
      publicReply: data.publicReply,
      linkLabel: data.linkLabel,
      linkUrl: data.linkUrl,
      trackClicks: data.trackClicks,
      followGate: data.followGate,
      followAsk: data.followAsk,
      followButton: data.followButton,
      followRetry: data.followRetry,
      enabled: data.enabled,
    });
    if (err) throw new Error(err);
  }
  const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
  const account = await executeOne<{
    source: string;
    status: string;
    external_id: string | null;
  }>(
    "SELECT source, status, external_id FROM crm_social_accounts WHERE workspace_id = ? AND id = ?",
    [data.workspaceId, data.accountId],
  );
  if (!account || account.status !== "connected" || !["meta", "tebar"].includes(account.source))
    throw new Error("Otomatisasi memerlukan akun Meta atau Tebar yang terhubung.");

  const action = data.trigger === "dm" ? "reply" : data.action;
  let externalId: string | null = null;
  if (account.source === "tebar") {
    const prior = data.id
      ? await executeOne<{ external_id: string | null }>(
          "SELECT external_id FROM crm_automation_rules WHERE workspace_id = ? AND id = ?",
          [data.workspaceId, data.id],
        )
      : null;
    const { upsertTebarAutomation } = await import("@/lib/tebar-interactions.server");
    try {
      externalId = await upsertTebarAutomation(data.workspaceId, {
        name: data.name,
        trigger: data.trigger,
        action,
        keyword: data.keyword,
        reply: data.reply,
        publicReply: data.publicReply,
        linkLabel: data.linkLabel,
        linkUrl: data.linkUrl,
        trackClicks: data.trackClicks,
        followGate: data.followGate,
        followAsk: data.followAsk,
        followButton: data.followButton,
        followRetry: data.followRetry,
        enabled: data.enabled,
        externalId: prior?.external_id ?? null,
        accountExternalId: account.external_id ?? "",
        remove: data.remove,
      });
    } catch (e) {
      throw new Error(`Tebar menolak otomasi: ${(e as Error).message}`);
    }
  } else {
    const setting = await executeOne<{ native_social_enabled: number }>(
      "SELECT native_social_enabled FROM crm_meta_settings WHERE workspace_id = ?",
      [data.workspaceId],
    );
    if (data.enabled && !setting?.native_social_enabled)
      throw new Error("Meta native belum diaktifkan.");
  }
  const cols = [
    data.accountId,
    data.name,
    data.trigger,
    action,
    data.keyword,
    data.reply,
    data.publicReply,
    data.linkLabel,
    data.linkUrl,
    data.trackClicks ? 1 : 0,
    data.followGate ? 1 : 0,
    data.followAsk,
    data.followButton,
    data.followRetry,
    data.autoLike ? 1 : 0,
    externalId,
    data.enabled ? 1 : 0,
  ];
  try {
    if (data.remove && data.id) {
      await execute("DELETE FROM crm_automation_rules WHERE workspace_id = ? AND id = ?", [
        data.workspaceId,
        data.id,
      ]);
    } else if (data.id) {
      await execute(
        `UPDATE crm_automation_rules SET account_id = ?, name = ?, trigger_type = ?, action_kind = ?, keyword = ?, reply_body = ?,
                public_reply = ?, link_label = ?, link_url = ?, track_clicks = ?, follow_gate = ?, follow_ask = ?, follow_button = ?,
                follow_retry = ?, auto_like = ?, external_id = ?, enabled = ? WHERE workspace_id = ? AND id = ?`,
        [...cols, data.workspaceId, data.id],
      );
    } else {
      await execute(
        `INSERT INTO crm_automation_rules (account_id, name, trigger_type, action_kind, keyword, reply_body, public_reply, link_label,
                link_url, track_clicks, follow_gate, follow_ask, follow_button, follow_retry, auto_like, external_id, enabled, id, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...cols, uuid(), data.workspaceId],
      );
    }
  } catch {
    throw new Error("Aturan tidak dapat disimpan.");
  }
  return { ok: true };
}

export async function sendInboxMessageCore(
  userId: string,
  data: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    body: string;
    note: boolean;
  },
) {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const { GRAPH_BASE } = await import("@/lib/social-interactions.server");
  const c = await executeOne<{
    id: string;
    account_id: string;
    participant_id: string;
    reply_window_expires_at: string | null;
  }>(
    "SELECT id, account_id, participant_id, reply_window_expires_at FROM crm_conversations WHERE workspace_id = ? AND id = ?",
    [data.workspaceId, data.conversationId],
  );
  if (!c) throw new Error("Percakapan tidak ditemukan.");
  // Idempoten: messageId yang sama tidak mengirim ulang.
  const prior = await executeOne<{ status: string; conversation_id: string; body: string }>(
    "SELECT status, conversation_id, body FROM crm_messages WHERE id = ? AND workspace_id = ?",
    [data.messageId, data.workspaceId],
  );
  if (prior) {
    if (prior.conversation_id !== c.id || prior.body !== data.body)
      throw new Error("Konfirmasi pesan tidak cocok.");
    return { status: prior.status };
  }
  const src = await executeOne<{ source: string }>(
    "SELECT source FROM crm_social_accounts WHERE id = ? AND workspace_id = ?",
    [c.account_id, data.workspaceId],
  );
  if (!data.note && src?.source === "tebar") {
    if (!replyWindowOpen(iso(c.reply_window_expires_at)))
      throw new Error("Jendela balasan 24 jam sudah ditutup.");
    try {
      await execute(
        "INSERT INTO crm_messages (id, workspace_id, conversation_id, body, direction, status, created_by) VALUES (?, ?, ?, ?, 'outbound', 'sending', ?)",
        [data.messageId, data.workspaceId, c.id, data.body, userId],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY") return { status: "sending" };
      throw new Error("Pesan tidak dapat disimpan.");
    }
    const { sendTebarDm } = await import("@/lib/tebar-interactions.server");
    const r = await sendTebarDm(data.workspaceId, c.participant_id, data.messageId, data.body);
    await execute("UPDATE crm_messages SET status = ?, provider_message_id = ? WHERE id = ?", [
      r.status,
      r.providerId,
      data.messageId,
    ]);
    if (r.status === "sent")
      await execute(
        "UPDATE crm_conversations SET last_message = ?, last_message_at = NOW(6) WHERE id = ?",
        [data.body, c.id],
      );
    return { status: r.status };
  }
  let token: string | null = null;
  let externalId: string | null = null;
  if (!data.note) {
    if (!replyWindowOpen(iso(c.reply_window_expires_at)))
      throw new Error("Jendela balasan 24 jam sudah ditutup.");
    const a = await executeOne<{
      external_id: string | null;
      source: string;
      status: string;
      platform: string;
    }>(
      "SELECT external_id, source, status, platform FROM crm_social_accounts WHERE id = ? AND workspace_id = ?",
      [c.account_id, data.workspaceId],
    );
    const setting = await executeOne<{ native_social_enabled: number }>(
      "SELECT native_social_enabled FROM crm_meta_settings WHERE workspace_id = ?",
      [data.workspaceId],
    );
    if (
      a?.source !== "meta" ||
      a.status !== "connected" ||
      !a.external_id ||
      !setting?.native_social_enabled
    )
      throw new Error("Akun Meta belum siap.");
    const secret = await executeOne<{ access_token: string; page_id: string | null }>(
      "SELECT access_token, page_id FROM crm_social_tokens WHERE account_id = ? AND workspace_id = ?",
      [c.account_id, data.workspaceId],
    );
    if (!secret?.access_token) throw new Error("Hubungkan ulang akun Meta.");
    token = secret.access_token;
    externalId = a.platform === "instagram" ? a.external_id : (secret.page_id ?? a.external_id);
  }
  try {
    await execute(
      "INSERT INTO crm_messages (id, workspace_id, conversation_id, body, direction, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        data.messageId,
        data.workspaceId,
        c.id,
        data.body,
        data.note ? "note" : "outbound",
        data.note ? "note" : "sending",
        userId,
      ],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return { status: "sending" };
    throw new Error("Pesan tidak dapat disimpan.");
  }
  if (data.note) return { status: "note" };
  // Jangan pernah mengirim ulang otomatis setelah timeout: Meta mungkin sudah menerima pesannya.
  let status: "sent" | "failed" | "unknown" = "unknown";
  let providerId: string | null = null;
  try {
    const res = await fetch(`${GRAPH_BASE}/${externalId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipient: { id: c.participant_id },
        messaging_type: "RESPONSE",
        message: { text: data.body },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const out = (await res.json().catch(() => ({}))) as { message_id?: string };
    status = res.ok && out.message_id ? "sent" : res.status >= 500 || res.ok ? "unknown" : "failed";
    providerId = out.message_id ?? null;
  } catch {
    status = "unknown";
  }
  try {
    await execute(
      "UPDATE crm_messages SET status = ?, provider_message_id = ? WHERE id = ? AND workspace_id = ?",
      [status, providerId, data.messageId, data.workspaceId],
    );
  } catch {
    return { status: "unknown" };
  }
  if (status === "sent") {
    const { sqlDateTime } = await import("@/lib/datetime");
    await execute(
      "UPDATE crm_conversations SET last_message = ?, last_message_at = ? WHERE id = ?",
      [data.body, sqlDateTime(new Date()), c.id],
    );
  }
  return { status };
}
