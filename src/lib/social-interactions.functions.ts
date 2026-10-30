/**
 * Qalling — Inbox (DM Meta), Comments dan Automations (BS New 11).
 * Server fn MySQL Old: otorisasi = anggota workspace (baca) / `canWriteWorkspace` (tulis) +
 * add-on `qalling` aktif. Semua timestamp dikirim sebagai ISO UTC (pool memakai `dateStrings`).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { replyWindowOpen } from "./meta-inbox-rules";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
const bool = (v: unknown) => v === 1 || v === true || v === "1";

async function assertMember(workspaceId: string, userId: string, feature = "inbox_dm") {
  const { isWorkspaceMember } = await import("@/lib/auth-context.server");
  const { workspaceHasQalling } = await import("@/lib/social-interactions.server");
  if (!(await isWorkspaceMember(workspaceId, userId)) || !(await workspaceHasQalling(workspaceId, feature)))
    throw new Error("Forbidden");
}
async function assertWriter(
  workspaceId: string,
  userId: string,
  message = "Paket atau izin Anda tidak mengizinkan tindakan ini.",
  feature = "inbox_dm",
) {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasQalling } = await import("@/lib/social-interactions.server");
  if (!(await canWriteWorkspace(workspaceId, userId)) || !(await workspaceHasQalling(workspaceId, feature)))
    throw new Error(message);
}

/* ------------------------------- Comments -------------------------------- */

export const listCrmComments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertMember(data.workspaceId, context.userId, "comments");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT c.id, c.account_id, c.post_id, c.author_name, c.body, c.reply, c.status, c.created_at,
              a.account_name, a.platform
         FROM crm_social_comments c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? ORDER BY c.created_at DESC LIMIT 1000`,
      [data.workspaceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      account_id: String(r.account_id),
      post_id: String(r.post_id),
      author_name: String(r.author_name ?? ""),
      body: String(r.body ?? ""),
      reply: (r.reply as string | null) ?? null,
      status: String(r.status),
      created_at: iso(r.created_at) ?? "",
      crm_social_accounts: {
        account_name: String(r.account_name ?? ""),
        platform: String(r.platform ?? ""),
      },
    }));
  });

export const replySocialComment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; commentId: string; body: string }) => {
    const body = String(d?.body ?? "").trim();
    if (!isId(d?.workspaceId) || !isId(d?.commentId) || body.length < 1 || body.length > 2000)
      throw new Error("Input tidak valid");
    return { ...d, body };
  })
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId, undefined, "comments");
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
    const status = await sendMetaInteraction(
      data.workspaceId,
      c.account_id,
      "comment",
      c.provider_comment_id,
      data.body,
    );
    await execute("UPDATE crm_social_comments SET status = ? WHERE id = ?", [status, c.id]);
    return { status };
  });

/* ------------------------------ Automations ------------------------------ */

export const getAutomationBoard = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertMember(data.workspaceId, context.userId, "automations");
    const { execute } = await import("@/integrations/mysql/pool");
    const [rules, accounts, runs] = await Promise.all([
      execute<Record<string, unknown>>(
        "SELECT * FROM crm_automation_rules WHERE workspace_id = ? ORDER BY created_at",
        [data.workspaceId],
      ),
      execute<Record<string, unknown>>(
        "SELECT id, account_name, platform FROM crm_social_accounts WHERE workspace_id = ? AND source = 'meta' AND status = 'connected'",
        [data.workspaceId],
      ),
      execute<Record<string, unknown>>(
        `SELECT r.id, r.status, r.created_at, ru.name AS rule_name
           FROM crm_automation_runs r LEFT JOIN crm_automation_rules ru ON ru.id = r.rule_id
          WHERE r.workspace_id = ? ORDER BY r.created_at DESC LIMIT 1000`,
        [data.workspaceId],
      ),
    ]);
    return {
      rules: rules.map((r) => ({
        id: String(r.id),
        account_id: String(r.account_id),
        name: String(r.name),
        trigger_type: String(r.trigger_type),
        keyword: String(r.keyword ?? ""),
        reply_body: String(r.reply_body ?? ""),
        enabled: bool(r.enabled),
      })),
      accounts: accounts.map((a) => ({
        id: String(a.id),
        account_name: String(a.account_name),
        platform: String(a.platform),
      })),
      runs: runs.map((r) => ({
        id: String(r.id),
        status: String(r.status),
        created_at: iso(r.created_at) ?? "",
        crm_automation_rules: { name: String(r.rule_name ?? "") },
      })),
    };
  });

interface ManageInput {
  workspaceId: string;
  id?: string;
  remove?: boolean;
  accountId: string;
  name: string;
  trigger: "dm" | "comment";
  keyword: string;
  reply: string;
  enabled: boolean;
}

export const manageAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: ManageInput) => {
    const name = String(d?.name ?? "").trim();
    const reply = String(d?.reply ?? "").trim();
    const keyword = String(d?.keyword ?? "").trim();
    if (!isId(d?.workspaceId) || !isId(d?.accountId) || (d.id && !isId(d.id)))
      throw new Error("Input tidak valid");
    if (
      name.length < 1 ||
      name.length > 100 ||
      reply.length < 1 ||
      reply.length > 2000 ||
      keyword.length > 100
    )
      throw new Error("Input tidak valid");
    if (d.trigger !== "dm" && d.trigger !== "comment") throw new Error("Input tidak valid");
    return { ...d, name, reply, keyword, enabled: Boolean(d.enabled) };
  })
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId, undefined, "automations");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const account = await executeOne<{ source: string; status: string }>(
      "SELECT source, status FROM crm_social_accounts WHERE workspace_id = ? AND id = ?",
      [data.workspaceId, data.accountId],
    );
    if (!account || account.source !== "meta" || account.status !== "connected") {
      throw new Error("Otomatisasi memerlukan akun Meta native yang terhubung.");
    }
    const setting = await executeOne<{ native_social_enabled: number }>(
      "SELECT native_social_enabled FROM crm_meta_settings WHERE workspace_id = ?",
      [data.workspaceId],
    );
    if (data.enabled && !setting?.native_social_enabled)
      throw new Error("Meta native belum diaktifkan.");
    try {
      if (data.remove && data.id) {
        await execute("DELETE FROM crm_automation_rules WHERE workspace_id = ? AND id = ?", [
          data.workspaceId,
          data.id,
        ]);
      } else if (data.id) {
        await execute(
          "UPDATE crm_automation_rules SET account_id = ?, name = ?, trigger_type = ?, keyword = ?, reply_body = ?, enabled = ? WHERE workspace_id = ? AND id = ?",
          [
            data.accountId,
            data.name,
            data.trigger,
            data.keyword,
            data.reply,
            data.enabled ? 1 : 0,
            data.workspaceId,
            data.id,
          ],
        );
      } else {
        await execute(
          "INSERT INTO crm_automation_rules (id, workspace_id, account_id, name, trigger_type, keyword, reply_body, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            uuid(),
            data.workspaceId,
            data.accountId,
            data.name,
            data.trigger,
            data.keyword,
            data.reply,
            data.enabled ? 1 : 0,
          ],
        );
      }
    } catch {
      throw new Error("Aturan tidak dapat disimpan.");
    }
    return { ok: true };
  });

/* --------------------------------- Inbox --------------------------------- */

export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertMember(data.workspaceId, context.userId, "inbox_dm");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT c.*, a.account_name, a.platform, a.status AS account_status
         FROM crm_conversations c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? ORDER BY c.last_message_at DESC LIMIT 100`,
      [data.workspaceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      account_id: String(r.account_id),
      participant_id: String(r.participant_id),
      participant_name: String(r.participant_name),
      status: String(r.status),
      last_message: String(r.last_message ?? ""),
      last_message_at: iso(r.last_message_at),
      reply_window_expires_at: iso(r.reply_window_expires_at),
      unread_count: Number(r.unread_count) || 0,
      crm_social_accounts: {
        account_name: String(r.account_name ?? ""),
        platform: String(r.platform ?? ""),
        status: String(r.account_status ?? ""),
      },
    }));
  });

export const listThread = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; conversationId: string }) => {
    if (!isId(d?.workspaceId) || !isId(d?.conversationId)) throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertMember(data.workspaceId, context.userId, "inbox_dm");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      "SELECT id, direction, body, attachments, status, created_at FROM crm_messages WHERE workspace_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 200",
      [data.workspaceId, data.conversationId],
    );
    return rows
      .map((m) => {
        let attachments: string[] = [];
        try {
          const parsed =
            typeof m.attachments === "string"
              ? JSON.parse(m.attachments || "[]")
              : (m.attachments ?? []);
          // Hanya jumlah/ringkasan yang dipakai UI ("Attachment received"); isi mentah tidak diserialisasi.
          attachments = Array.isArray(parsed) ? parsed.map((x) => JSON.stringify(x)) : [];
        } catch {
          attachments = [];
        }
        return {
          id: String(m.id),
          direction: String(m.direction),
          body: String(m.body ?? ""),
          attachments,
          status: String(m.status),
          created_at: iso(m.created_at) ?? "",
        };
      })
      .reverse();
  });

export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      workspaceId: string;
      conversationId: string;
      status?: "open" | "resolved";
      read?: boolean;
    }) => {
      if (
        !isId(d?.workspaceId) ||
        !isId(d?.conversationId) ||
        (d.status && d.status !== "open" && d.status !== "resolved")
      )
        throw new Error("Input tidak valid");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    await assertWriter(
      data.workspaceId,
      context.userId,
      "Tidak memiliki akses untuk mengelola Inbox.",
    );
    const { execute } = await import("@/integrations/mysql/pool");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (data.status) {
      sets.push("status = ?");
      params.push(data.status);
    }
    if (data.read) sets.push("unread_count = 0");
    if (sets.length) {
      await execute(
        `UPDATE crm_conversations SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
        [...params, data.workspaceId, data.conversationId],
      );
    }
    return { ok: true };
  });

export const sendInboxMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      workspaceId: string;
      conversationId: string;
      messageId: string;
      body: string;
      note: boolean;
    }) => {
      const body = String(d?.body ?? "").trim();
      if (
        !isId(d?.workspaceId) ||
        !isId(d?.conversationId) ||
        !isId(d?.messageId) ||
        body.length < 1 ||
        body.length > 2000
      )
        throw new Error("Input tidak valid");
      return { ...d, body, note: Boolean(d.note) };
    },
  )
  .handler(async ({ data, context }) => {
    await assertWriter(
      data.workspaceId,
      context.userId,
      "Tidak memiliki akses untuk mengelola Inbox.",
    );
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
          context.userId,
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
      status =
        res.ok && out.message_id ? "sent" : res.status >= 500 || res.ok ? "unknown" : "failed";
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
  });
