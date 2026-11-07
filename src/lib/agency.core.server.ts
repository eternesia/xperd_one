/** Paket Agency: persetujuan konten klien (link publik) dan laporan klien white-label. */
import { randomBytes, randomUUID } from "node:crypto";
import { execute, executeOne, result } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { signMediaUrl } from "./crm-media.server";

const newToken = () => randomBytes(24).toString("hex");
const plusDays = (d: number) => sqlDateTime(new Date(Date.now() + d * 86400000));

export type ApprovalStatus = "pending" | "approved" | "changes_requested" | "cancelled";

type PostRow = {
  id: string;
  workspace_id: string;
  title: string;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  account_ids: unknown;
  media_paths: unknown;
  media_url: string | null;
};

const asArray = (v: unknown): string[] => {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

async function audit(
  workspaceId: string,
  table: string,
  recordId: string,
  action: "INSERT" | "UPDATE",
  ref: string,
  data: Record<string, unknown>,
  actor?: { id?: string | null; email?: string | null },
) {
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, table_name, record_id, action, doc_ref, new_data, actor_id, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      workspaceId,
      table,
      recordId,
      action,
      ref.slice(0, 255),
      JSON.stringify(data),
      actor?.id ?? null,
      actor?.email ?? null,
    ],
  );
}

/** Buat permintaan persetujuan; post dikembalikan ke draft sampai klien menyetujui. */
export async function requestApprovalCore(
  workspaceId: string,
  postId: string,
  opts: { clientLabel?: string; message?: string; days?: number },
  actor: { id: string; email?: string | null },
) {
  const post = await executeOne<PostRow>(
    "SELECT id, workspace_id, title, status, scheduled_at, source, external_id FROM crm_scheduled_posts WHERE id = ? AND workspace_id = ?",
    [postId, workspaceId],
  );
  if (!post) throw new Error("Postingan tidak ditemukan.");
  const owned = post as PostRow & { source?: string | null; external_id?: string | null };
  if (
    !["draft", "scheduled"].includes(post.status) ||
    owned.source === "tebar" ||
    owned.external_id
  )
    throw new Error(
      "Hanya draft atau postingan terjadwal yang belum diserahkan ke penyedia yang bisa dikirim untuk persetujuan.",
    );
  await execute(
    "UPDATE crm_post_approvals SET status = 'cancelled' WHERE post_id = ? AND status = 'pending'",
    [postId],
  );
  const id = randomUUID();
  const token = newToken();
  const days = Math.min(Math.max(opts.days ?? 14, 1), 60);
  await execute(
    `INSERT INTO crm_post_approvals (id, workspace_id, post_id, token, client_label, message_to_client, prev_status, prev_scheduled_at, requested_by, requested_by_email, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      postId,
      token,
      opts.clientLabel?.slice(0, 120) || null,
      opts.message?.slice(0, 2000) || null,
      post.status,
      post.scheduled_at,
      actor.id,
      actor.email ?? null,
      plusDays(days),
    ],
  );
  // Tahan penerbitan sampai disetujui.
  await execute(
    "UPDATE crm_scheduled_posts SET status = 'draft' WHERE id = ? AND workspace_id = ? AND status IN ('draft','scheduled')",
    [postId, workspaceId],
  );
  await audit(
    workspaceId,
    "crm_post_approvals",
    id,
    "INSERT",
    post.title,
    { status: "pending" },
    actor,
  );
  return { id, token };
}

export async function listApprovalsCore(workspaceId: string, postId?: string) {
  return execute<{
    id: string;
    post_id: string;
    token: string;
    status: ApprovalStatus;
    client_label: string | null;
    client_name: string | null;
    client_comment: string | null;
    decided_at: string | null;
    expires_at: string;
    created_at: string;
    post_title: string;
  }>(
    `SELECT a.id, a.post_id, a.token, a.status, a.client_label, a.client_name, a.client_comment, a.decided_at, a.expires_at, a.created_at, p.title AS post_title
       FROM crm_post_approvals a JOIN crm_scheduled_posts p ON p.id = a.post_id
      WHERE a.workspace_id = ? ${postId ? "AND a.post_id = ?" : ""}
      ORDER BY a.created_at DESC LIMIT 100`,
    postId ? [workspaceId, postId] : [workspaceId],
  );
}

export async function cancelApprovalCore(
  workspaceId: string,
  approvalId: string,
  actor: { id: string; email?: string | null },
) {
  const a = await executeOne<{ post_id: string }>(
    "SELECT post_id FROM crm_post_approvals WHERE id = ? AND workspace_id = ? AND status = 'pending'",
    [approvalId, workspaceId],
  );
  if (!a) throw new Error("Permintaan tidak ditemukan atau sudah diputuskan.");
  await execute("UPDATE crm_post_approvals SET status = 'cancelled' WHERE id = ?", [approvalId]);
  await audit(
    workspaceId,
    "crm_post_approvals",
    approvalId,
    "UPDATE",
    "dibatalkan",
    { status: "cancelled" },
    actor,
  );
}

/** Data pratinjau publik (tanpa login). Hanya field yang aman ditampilkan ke klien. */
export async function getPublicApproval(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const a = await executeOne<{
    id: string;
    workspace_id: string;
    post_id: string;
    status: ApprovalStatus;
    client_label: string | null;
    message_to_client: string | null;
    client_name: string | null;
    client_comment: string | null;
    decided_at: string | null;
    expires_at: string;
  }>("SELECT * FROM crm_post_approvals WHERE token = ?", [token]);
  if (!a) return null;
  const post = await executeOne<PostRow>(
    "SELECT id, workspace_id, title, caption, status, scheduled_at, account_ids, media_paths, media_url FROM crm_scheduled_posts WHERE id = ?",
    [a.post_id],
  );
  if (!post) return null;
  const ws = await executeOne<{ name: string }>("SELECT name FROM workspaces WHERE id = ?", [
    a.workspace_id,
  ]);
  const ids = asArray(post.account_ids);
  const accounts = ids.length
    ? await execute<{ platform: string; account_name: string }>(
        `SELECT platform, account_name FROM crm_social_accounts WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
        [a.workspace_id, ...ids],
      )
    : [];
  const paths = asArray(post.media_paths);
  const expired = new Date(`${String(a.expires_at).replace(" ", "T")}Z`).getTime() < Date.now();
  return {
    status: a.status,
    expired: expired && a.status === "pending",
    brand: ws?.name ?? "",
    clientLabel: a.client_label,
    message: a.message_to_client,
    decidedBy: a.client_name,
    decidedComment: a.client_comment,
    decidedAt: a.decided_at,
    title: post.title,
    caption: post.caption ?? "",
    scheduledAt: a.status === "approved" ? post.scheduled_at : null,
    accounts,
    mediaCount: paths.length || (post.media_url ? 1 : 0),
    mediaUrls:
      a.status === "cancelled" ? [] : paths.slice(0, 10).map((m) => signMediaUrl("", m, 3600)),
  };
}

export async function decideApproval(
  token: string,
  decision: "approved" | "changes_requested",
  name: string,
  comment: string,
) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new Error("Link tidak valid.");
  const a = await executeOne<{
    id: string;
    workspace_id: string;
    post_id: string;
    prev_status: string | null;
    prev_scheduled_at: string | null;
    requested_by_email: string | null;
  }>(
    "SELECT id, workspace_id, post_id, prev_status, prev_scheduled_at, requested_by_email FROM crm_post_approvals WHERE token = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP()",
    [token],
  );
  if (!a) throw new Error("Permintaan ini sudah diputuskan, dibatalkan, atau kedaluwarsa.");
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) throw new Error("Nama wajib diisi.");
  if (decision === "changes_requested" && !comment.trim())
    throw new Error("Tuliskan catatan revisi agar tim tahu apa yang perlu diubah.");
  const claimed = await result(
    "UPDATE crm_post_approvals SET status = ?, client_name = ?, client_comment = ?, decided_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'pending'",
    [decision, cleanName, comment.trim().slice(0, 2000) || null, a.id],
  );
  if (!claimed.affectedRows) throw new Error("Permintaan ini sudah diputuskan.");
  let note = "";
  if (decision === "approved") {
    const when = a.prev_scheduled_at
      ? new Date(`${String(a.prev_scheduled_at).replace(" ", "T")}Z`)
      : null;
    if (a.prev_status === "scheduled" && when && when.getTime() > Date.now()) {
      await execute(
        "UPDATE crm_scheduled_posts SET status = 'scheduled' WHERE id = ? AND status = 'draft'",
        [a.post_id],
      );
      note = "dijadwalkan kembali";
    } else {
      note = "disetujui; jadwal sudah lewat, tim perlu menjadwalkan ulang";
    }
  }
  await audit(
    a.workspace_id,
    "crm_post_approvals",
    a.id,
    "UPDATE",
    `${decision === "approved" ? "Disetujui" : "Revisi"} oleh ${cleanName}`,
    { status: decision, comment: comment.trim().slice(0, 500), note },
  );
  void notifyDecision(a.requested_by_email, a.post_id, decision, cleanName, comment).catch(
    () => {},
  );
  return { ok: true, note };
}

async function notifyDecision(
  to: string | null,
  postId: string,
  decision: string,
  who: string,
  comment: string,
) {
  if (!to) return;
  const { loadGateway, sendViaGateway, PLATFORM_SCOPE } = await import("./email-gateway.server");
  const g = await loadGateway(PLATFORM_SCOPE);
  if (!g?.enabled) return;
  const post = await executeOne<{ title: string }>(
    "SELECT title FROM crm_scheduled_posts WHERE id = ?",
    [postId],
  );
  const ok = decision === "approved";
  const subject = `${ok ? "Disetujui" : "Perlu revisi"}: ${post?.title ?? "Postingan"}`;
  const text = `${who} ${ok ? "menyetujui" : "meminta revisi untuk"} postingan "${post?.title ?? ""}".${comment ? `\n\nCatatan: ${comment}` : ""}\n\nBuka Qalling untuk melanjutkan.`;
  const esc = (v: string) =>
    v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  await sendViaGateway(g, {
    to,
    subject,
    text,
    html: `<p>${esc(text).replace(/\n/g, "<br>")}</p>`,
  });
}

/* ------------------------- Laporan white-label ------------------------- */

export async function createReportLinkCore(
  workspaceId: string,
  v: {
    title: string;
    brandName: string;
    brandColor?: string;
    logoUrl?: string | null;
    clientGroupId?: string | null;
    periodDays?: number;
  },
  actor: { id: string; email?: string | null },
) {
  if (v.clientGroupId) {
    const g = await executeOne(
      "SELECT 1 AS ok FROM crm_client_groups WHERE id = ? AND workspace_id = ?",
      [v.clientGroupId, workspaceId],
    );
    if (!g) throw new Error("Klien tidak ditemukan.");
  }
  const color = /^#[0-9a-fA-F]{6}$/.test(v.brandColor ?? "") ? v.brandColor! : "#2563eb";
  const logo = v.logoUrl && /^https:\/\/\S+$/.test(v.logoUrl) ? v.logoUrl.slice(0, 500) : null;
  const id = randomUUID();
  const token = newToken();
  await execute(
    `INSERT INTO crm_report_links (id, workspace_id, token, title, brand_name, brand_color, logo_url, client_group_id, period_days, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      token,
      v.title.slice(0, 150),
      v.brandName.slice(0, 120),
      color,
      logo,
      v.clientGroupId || null,
      Math.min(Math.max(v.periodDays ?? 30, 7), 365),
      actor.id,
    ],
  );
  await audit(
    workspaceId,
    "crm_report_links",
    id,
    "INSERT",
    v.title,
    { brand: v.brandName },
    actor,
  );
  return { id, token };
}

export async function listReportLinksCore(workspaceId: string) {
  return execute<{
    id: string;
    token: string;
    title: string;
    brand_name: string;
    period_days: number;
    created_at: string;
    revoked_at: string | null;
  }>(
    "SELECT id, token, title, brand_name, period_days, created_at, revoked_at FROM crm_report_links WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100",
    [workspaceId],
  );
}

export async function revokeReportLinkCore(
  workspaceId: string,
  id: string,
  actor: { id: string; email?: string | null },
) {
  await execute(
    "UPDATE crm_report_links SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL",
    [id, workspaceId],
  );
  await audit(
    workspaceId,
    "crm_report_links",
    id,
    "UPDATE",
    "link dicabut",
    { revoked: true },
    actor,
  );
}

/** Data laporan publik: dihitung langsung dari data, tanpa menampilkan isi privat selain angka dan judul post. */
export async function getPublicReport(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const l = await executeOne<{
    workspace_id: string;
    title: string;
    brand_name: string;
    brand_color: string;
    logo_url: string | null;
    client_group_id: string | null;
    period_days: number;
    revoked_at: string | null;
  }>("SELECT * FROM crm_report_links WHERE token = ?", [token]);
  if (!l || l.revoked_at) return null;
  const since = sqlDateTime(new Date(Date.now() - l.period_days * 86400000));
  const accounts = await execute<{ id: string; platform: string; account_name: string }>(
    `SELECT id, platform, account_name FROM crm_social_accounts WHERE workspace_id = ? ${l.client_group_id ? "AND client_group_id = ?" : ""}`,
    l.client_group_id ? [l.workspace_id, l.client_group_id] : [l.workspace_id],
  );
  const ids = new Set(accounts.map((a) => a.id));
  const posts = (
    await execute<{
      title: string;
      status: string;
      scheduled_at: string;
      published_at: string | null;
      account_ids: unknown;
      permalinks: unknown;
    }>(
      "SELECT title, status, scheduled_at, published_at, account_ids, permalinks FROM crm_scheduled_posts WHERE workspace_id = ? AND scheduled_at >= ? ORDER BY scheduled_at DESC LIMIT 2000",
      [l.workspace_id, since],
    )
  ).filter((p) => asArray(p.account_ids).some((i) => ids.has(i)));
  const byAccount = accounts.map((a) => {
    const mine = posts.filter((p) => asArray(p.account_ids).includes(a.id));
    return {
      account: a.account_name,
      platform: a.platform,
      published: mine.filter((p) => p.status === "published").length,
      scheduled: mine.filter((p) => p.status === "scheduled").length,
    };
  });
  const comments = accounts.length
    ? ((
        await executeOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM crm_social_comments WHERE workspace_id = ? AND created_at >= ? AND account_id IN (${accounts.map(() => "?").join(",")})`,
          [l.workspace_id, since, ...accounts.map((a) => a.id)],
        )
      )?.c ?? 0)
    : 0;
  // Prospek hanya dihitung untuk laporan seluruh akun (prospek belum terikat ke klien).
  const leads = l.client_group_id
    ? null
    : await executeOne<{ total: number; won: number; won_value: number }>(
        `SELECT COUNT(*) AS total, SUM(status = 'won') AS won, COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value END), 0) AS won_value
           FROM crm_leads WHERE workspace_id = ? AND created_at >= ?`,
        [l.workspace_id, since],
      );
  const attribution = l.client_group_id
    ? null
    : await (
        await import("./attribution.core.server")
      ).contentAttributionCore(l.workspace_id, l.period_days);
  return {
    topContent:
      attribution?.posts
        .slice(0, 5)
        .map((p) => ({ title: p.title, leads: p.leads, won: p.won, wonValue: p.wonValue })) ?? [],
    title: l.title,
    brand: l.brand_name,
    color: l.brand_color,
    logoUrl: l.logo_url,
    periodDays: l.period_days,
    generatedAt: new Date().toISOString(),
    totals: {
      published: posts.filter((p) => p.status === "published").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      comments: Number(comments),
      leads: leads ? Number(leads.total) : null,
      won: leads ? Number(leads.won ?? 0) : null,
      wonValue: leads ? Number(leads.won_value ?? 0) : null,
    },
    byAccount,
    recent: posts
      .filter((p) => p.status === "published")
      .slice(0, 10)
      .map((p) => ({
        title: p.title,
        at: p.published_at ?? p.scheduled_at,
        link: asArray(p.permalinks)[0] ?? null,
      })),
  };
}
