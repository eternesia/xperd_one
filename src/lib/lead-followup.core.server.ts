/** Pengingat follow-up: kesehatan prospek (diam / terlambat), detail + linimasa, dan bahan email harian. */
import { randomUUID } from "node:crypto";
import { execute, executeOne } from "@/integrations/mysql/pool";
import { jakartaToday } from "./billing-wallet.server";

/** Prospek terbuka tanpa aktivitas selama ini dianggap diam. */
export const STALE_DAYS = 7;

const TOUCH_SQL = `GREATEST(
    l.created_at,
    COALESCE(l.stage_changed_at, l.created_at),
    COALESCE(l.last_activity_at, l.created_at),
    COALESCE((SELECT MAX(a.created_at) FROM crm_activities a WHERE a.lead_id = l.id), l.created_at)
  )`;

export type LeadHealth = {
  leadId: string;
  idleDays: number;
  stale: boolean;
  followUpOverdueDays: number | null;
  overdueTasks: number;
  openTasks: number;
};

const num = (v: unknown) => Number(v ?? 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

export async function leadHealthCore(workspaceId: string): Promise<LeadHealth[]> {
  const today = jakartaToday();
  const rows = await execute<Record<string, unknown>>(
    `SELECT l.id, l.next_follow_up_at,
            TIMESTAMPDIFF(DAY, ${TOUCH_SQL}, UTC_TIMESTAMP(6)) AS idle_days,
            (SELECT COUNT(*) FROM crm_activities a WHERE a.lead_id = l.id AND a.done_at IS NULL AND a.due_at IS NOT NULL) AS open_tasks,
            (SELECT COUNT(*) FROM crm_activities a WHERE a.lead_id = l.id AND a.done_at IS NULL AND a.due_at IS NOT NULL AND a.due_at < UTC_TIMESTAMP(6)) AS overdue_tasks
       FROM crm_leads l
      WHERE l.workspace_id = ? AND l.status = 'open'
      LIMIT 2000`,
    [workspaceId],
  );
  return rows.map((r) => {
    const fu = d10(r.next_follow_up_at);
    const idle = Math.max(0, num(r.idle_days));
    return {
      leadId: String(r.id),
      idleDays: idle,
      stale: idle >= STALE_DAYS,
      followUpOverdueDays: fu && fu < today ? dayDiff(today, fu) : null,
      overdueTasks: num(r.overdue_tasks),
      openTasks: num(r.open_tasks),
    };
  });
}

export type TimelineItem = {
  kind: "created" | "stage" | "activity" | "message";
  at: string;
  title: string;
  body?: string | null;
  done?: boolean;
  dueAt?: string | null;
  activityId?: string;
};

export async function leadDetailCore(workspaceId: string, leadId: string) {
  const lead = await executeOne<Record<string, unknown>>(
    `SELECT l.id, l.code, l.name, l.company_name, l.email, l.phone, l.source, l.stage, l.status, l.estimated_value,
            l.owner_name, l.next_follow_up_at, l.notes, l.created_at, l.source_post_id, l.source_campaign_id,
            p.title AS source_post_title, c.name AS source_campaign_name
       FROM crm_leads l
       LEFT JOIN crm_scheduled_posts p ON p.id = l.source_post_id AND p.workspace_id = l.workspace_id
       LEFT JOIN crm_campaigns c ON c.id = l.source_campaign_id AND c.workspace_id = l.workspace_id
      WHERE l.workspace_id = ? AND l.id = ?`,
    [workspaceId, leadId],
  );
  if (!lead) throw new Error("Prospek tidak ditemukan.");
  const [acts, msgs, stages] = await Promise.all([
    execute<Record<string, unknown>>(
      `SELECT id, activity_type, subject, body, due_at, done_at, created_at FROM crm_activities
        WHERE workspace_id = ? AND lead_id = ? ORDER BY created_at DESC LIMIT 100`,
      [workspaceId, leadId],
    ),
    execute<Record<string, unknown>>(
      `SELECT m.direction, m.body, m.created_at FROM crm_messages m
         JOIN crm_conversations c ON c.id = m.conversation_id
        WHERE c.workspace_id = ? AND c.lead_id = ? AND m.direction IN ('inbound','outbound')
        ORDER BY m.created_at DESC LIMIT 15`,
      [workspaceId, leadId],
    ),
    execute<Record<string, unknown>>(
      `SELECT old_data, new_data, created_at FROM audit_logs
        WHERE workspace_id = ? AND table_name = 'crm_leads' AND record_id = ? AND action = 'UPDATE'
          AND JSON_SEARCH(COALESCE(changed_fields, JSON_ARRAY()), 'one', 'stage') IS NOT NULL
        ORDER BY created_at DESC LIMIT 30`,
      [workspaceId, leadId],
    ),
  ]);
  const pj = (v: unknown): Record<string, unknown> => {
    try {
      return (typeof v === "string" ? JSON.parse(v) : (v ?? {})) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const timeline: TimelineItem[] = [
    { kind: "created", at: String(lead.created_at), title: "Prospek dibuat" } as TimelineItem,
    ...acts.map((a): TimelineItem => ({
      kind: "activity",
      at: String(a.created_at),
      title: `${a.activity_type}: ${a.subject}`,
      body: a.body ? String(a.body) : null,
      done: Boolean(a.done_at),
      dueAt: a.due_at ? String(a.due_at) : null,
      activityId: String(a.id),
    })),
    ...msgs.map((m): TimelineItem => ({
      kind: "message",
      at: String(m.created_at),
      title: m.direction === "inbound" ? "Pesan masuk" : "Balasan keluar",
      body: String(m.body ?? "").slice(0, 280),
    })),
    ...stages.map((s): TimelineItem => ({
      kind: "stage",
      at: String(s.created_at),
      title: `Tahap: ${pj(s.old_data).stage ?? "?"} → ${pj(s.new_data).stage ?? "?"}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    lead: {
      id: String(lead.id),
      code: String(lead.code),
      name: String(lead.name),
      company: lead.company_name ? String(lead.company_name) : null,
      email: lead.email ? String(lead.email) : null,
      phone: lead.phone ? String(lead.phone) : null,
      stage: String(lead.stage),
      status: String(lead.status),
      value: num(lead.estimated_value),
      owner: lead.owner_name ? String(lead.owner_name) : null,
      nextFollowUp: d10(lead.next_follow_up_at),
      notes: lead.notes ? String(lead.notes) : null,
      source: lead.source ? String(lead.source) : null,
      sourcePost: lead.source_post_title ? String(lead.source_post_title) : null,
      sourceCampaign: lead.source_campaign_name ? String(lead.source_campaign_name) : null,
    },
    timeline,
  };
}

export async function logLeadActivityCore(
  workspaceId: string,
  v: {
    leadId: string;
    type: string;
    subject: string;
    body?: string | null;
    dueAt?: string | null;
    followUpDate?: string | null;
  },
  actor: { id: string },
) {
  const lead = await executeOne("SELECT 1 AS ok FROM crm_leads WHERE id = ? AND workspace_id = ?", [
    v.leadId,
    workspaceId,
  ]);
  if (!lead) throw new Error("Prospek tidak ditemukan.");
  const id = randomUUID();
  await execute(
    `INSERT INTO crm_activities (id, workspace_id, lead_id, activity_type, subject, body, due_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      v.leadId,
      v.type,
      v.subject.slice(0, 255),
      v.body?.slice(0, 5000) ?? null,
      v.dueAt ?? null,
      actor.id,
    ],
  );
  await execute(
    `UPDATE crm_leads SET last_activity_at = UTC_TIMESTAMP(6)${v.followUpDate !== undefined ? ", next_follow_up_at = ?" : ""}
      WHERE id = ? AND workspace_id = ?`,
    v.followUpDate !== undefined
      ? [v.followUpDate || null, v.leadId, workspaceId]
      : [v.leadId, workspaceId],
  );
  return { id };
}

export async function completeTaskCore(workspaceId: string, activityId: string) {
  await execute(
    "UPDATE crm_activities SET done_at = UTC_TIMESTAMP(6) WHERE id = ? AND workspace_id = ? AND done_at IS NULL",
    [activityId, workspaceId],
  );
  await execute(
    `UPDATE crm_leads l JOIN crm_activities a ON a.lead_id = l.id SET l.last_activity_at = UTC_TIMESTAMP(6)
      WHERE a.id = ? AND l.workspace_id = ?`,
    [activityId, workspaceId],
  );
}

export async function setFollowUpCore(workspaceId: string, leadId: string, date: string | null) {
  await execute("UPDATE crm_leads SET next_follow_up_at = ? WHERE id = ? AND workspace_id = ?", [
    date,
    leadId,
    workspaceId,
  ]);
}

/* ------------------------- bahan email harian ------------------------- */

export type DigestLead = { id: string; name: string; stage: string; detail: string };
export type OwnerDigest = {
  email: string | null;
  ownerName: string | null;
  overdueFollowUps: DigestLead[];
  overdueTasks: DigestLead[];
  dueToday: DigestLead[];
  stale: DigestLead[];
};

/** Pengelompokan per penanggung jawab. email null = pemilik akun (penerima cadangan). */
export async function followUpDigestCore(workspaceId: string): Promise<OwnerDigest[]> {
  const today = jakartaToday();
  const leads = await execute<Record<string, unknown>>(
    `SELECT l.id, l.name, l.stage, l.owner_name, l.next_follow_up_at,
            owner.email AS owner_email,
            TIMESTAMPDIFF(DAY, ${TOUCH_SQL}, UTC_TIMESTAMP(6)) AS idle_days
       FROM crm_leads l
       LEFT JOIN profiles owner ON owner.id = l.owner_user_id
      WHERE l.workspace_id = ? AND l.status = 'open' LIMIT 2000`,
    [workspaceId],
  );
  const members = await execute<{ email: string | null; full_name: string | null }>(
    `SELECT p.email, p.full_name FROM workspace_members m JOIN profiles p ON p.id = m.user_id WHERE m.workspace_id = ?`,
    [workspaceId],
  );
  const byName = new Map(
    members
      .filter((m) => m.email && m.full_name)
      .map((m) => [m.full_name!.trim().toLowerCase(), m.email!]),
  );
  const tasks = await execute<Record<string, unknown>>(
    `SELECT a.lead_id, a.subject, a.due_at,
            (a.due_at < UTC_TIMESTAMP(6)) AS overdue,
            DATE(CONVERT_TZ(a.due_at, '+00:00', '+07:00')) AS due_day
       FROM crm_activities a JOIN crm_leads l ON l.id = a.lead_id
      WHERE a.workspace_id = ? AND a.done_at IS NULL AND a.due_at IS NOT NULL AND l.status = 'open'
        AND DATE(CONVERT_TZ(a.due_at, '+00:00', '+07:00')) <= ?
      LIMIT 500`,
    [workspaceId, today],
  );
  const groups = new Map<string, OwnerDigest>();
  const group = (email: string | null, ownerName: string | null) => {
    const k = email ?? "__owner__";
    if (!groups.has(k))
      groups.set(k, {
        email,
        ownerName,
        overdueFollowUps: [],
        overdueTasks: [],
        dueToday: [],
        stale: [],
      });
    return groups.get(k)!;
  };
  const info = new Map<
    string,
    { name: string; stage: string; email: string | null; owner: string | null }
  >();
  for (const l of leads) {
    const email =
      (l.owner_email ? String(l.owner_email) : null) ??
      (l.owner_name ? (byName.get(String(l.owner_name).trim().toLowerCase()) ?? null) : null);
    info.set(String(l.id), {
      name: String(l.name),
      stage: String(l.stage),
      email,
      owner: l.owner_name ? String(l.owner_name) : null,
    });
    const fu = d10(l.next_follow_up_at);
    const base = { id: String(l.id), name: String(l.name), stage: String(l.stage) };
    if (fu && fu < today)
      group(email, info.get(base.id)!.owner).overdueFollowUps.push({
        ...base,
        detail: `terlambat ${dayDiff(today, fu)} hari`,
      });
    else if (fu === today)
      group(email, info.get(base.id)!.owner).dueToday.push({
        ...base,
        detail: "follow-up hari ini",
      });
    else if (num(l.idle_days) >= STALE_DAYS && !(fu && fu > today))
      group(email, info.get(base.id)!.owner).stale.push({
        ...base,
        detail: `tanpa aktivitas ${num(l.idle_days)} hari`,
      });
  }
  for (const t of tasks) {
    const i = info.get(String(t.lead_id));
    if (!i) continue;
    const g = group(i.email, i.owner);
    const row = { id: String(t.lead_id), name: i.name, stage: i.stage, detail: String(t.subject) };
    if (num(t.overdue)) g.overdueTasks.push(row);
    else g.dueToday.push(row);
  }
  return [...groups.values()].filter(
    (g) =>
      g.overdueFollowUps.length + g.overdueTasks.length + g.dueToday.length + g.stale.length > 0,
  );
}
