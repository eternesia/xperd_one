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
  if (
    !(await isWorkspaceMember(workspaceId, userId)) ||
    !(await workspaceHasQalling(workspaceId, feature))
  )
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
  if (
    !(await canWriteWorkspace(workspaceId, userId)) ||
    !(await workspaceHasQalling(workspaceId, feature))
  )
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
      `SELECT c.id, c.account_id, c.post_id, c.author_name, c.body, c.reply, c.status, c.created_at, c.liked_at,
              a.account_name, a.platform, a.source
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
      liked_at: iso(r.liked_at),
      crm_social_accounts: {
        account_name: String(r.account_name ?? ""),
        platform: String(r.platform ?? ""),
        source: String(r.source ?? ""),
      },
    }));
  });

/** Like komentar (Tebar: Facebook/TikTok; Meta native: Halaman Facebook) — platform lain dilewati. */
export const likeSocialComments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; commentIds: string[] }) => {
    if (
      !isId(d?.workspaceId) ||
      !Array.isArray(d.commentIds) ||
      d.commentIds.length < 1 ||
      d.commentIds.length > 50 ||
      !d.commentIds.every(isId)
    )
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId, undefined, "comments");
    const { likeCommentsCore } = await import("@/lib/social-interactions.server");
    return likeCommentsCore(data.workspaceId, data.commentIds);
  });

/** Tarik komentar & DM dari Tebar saat halaman dibuka (tanpa webhook push). */
export const syncTebarSocial = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Tidak memiliki akses.");
    const { syncTebarInteractions } = await import("@/lib/tebar-interactions.server");
    return syncTebarInteractions(data.workspaceId);
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
    const { replyCommentCore } = await import("@/lib/social-interactions.core.server");
    return replyCommentCore(data);
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
        "SELECT id, account_name, platform, source FROM crm_social_accounts WHERE workspace_id = ? AND source IN ('meta','tebar') AND status = 'connected'",
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
        action_kind: String(r.action_kind ?? "reply"),
        public_reply: (r.public_reply as string | null) ?? null,
        link_label: (r.link_label as string | null) ?? null,
        link_url: (r.link_url as string | null) ?? null,
        track_clicks: bool(r.track_clicks),
        follow_gate: bool(r.follow_gate),
        follow_ask: (r.follow_ask as string | null) ?? null,
        follow_button: (r.follow_button as string | null) ?? null,
        follow_retry: (r.follow_retry as string | null) ?? null,
        auto_like: bool(r.auto_like),
        click_count: Number(r.click_count) || 0,
      })),
      accounts: accounts.map((a) => ({
        id: String(a.id),
        account_name: String(a.account_name),
        platform: String(a.platform),
        source: String(a.source),
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
    const t = (v: unknown, max: number) => {
      const x = String(v ?? "").trim();
      if (x.length > max) throw new Error("Input tidak valid");
      return x || null;
    };
    return {
      ...d,
      name,
      reply,
      keyword,
      action: d.action === "comment_to_dm" ? ("comment_to_dm" as const) : ("reply" as const),
      publicReply: t(d.publicReply, 2200),
      linkLabel: t(d.linkLabel, 20),
      linkUrl: t(d.linkUrl, 2000),
      followAsk: t(d.followAsk, 1000),
      followButton: t(d.followButton, 20),
      followRetry: t(d.followRetry, 1000),
      trackClicks: d.trackClicks !== false,
      followGate: Boolean(d.followGate),
      autoLike: Boolean(d.autoLike),
      enabled: Boolean(d.enabled),
    };
  })
  .handler(async ({ data, context }) => {
    await assertWriter(data.workspaceId, context.userId, undefined, "automations");
    const { manageAutomationCore } = await import("@/lib/social-interactions.core.server");
    return manageAutomationCore(data);
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
      lead_id: (r.lead_id as string | null) ?? null,
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
    const { sendInboxMessageCore } = await import("@/lib/social-interactions.core.server");
    return sendInboxMessageCore(context.userId, data);
  });
