/**
 * Inti kontak sosial terpadu (tanpa autentikasi). Dipakai server fn UI dan tool MCP; pemanggil WAJIB sudah
 * memeriksa fitur `crm` serta hak baca/tulis workspace.
 */
import { nextLeadCode } from "./crm";

export interface ContactInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  tags?: string[];
  notes?: string | null;
}

const clean = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
export const normalizeTags = (tags: string[] | undefined) =>
  [...new Set((tags ?? []).map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(
    0,
    20,
  );

/** Membuat kontak untuk percakapan yang belum punya (idempoten; maks 200 per panggilan). */
export async function syncContactsFromConversations(workspaceId: string, userId: string | null) {
  const { transaction, uuid } = await import("@/integrations/mysql/pool");
  return transaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, participant_name FROM crm_conversations
        WHERE workspace_id = ? AND contact_id IS NULL ORDER BY last_message_at DESC LIMIT 200 FOR UPDATE`,
      [workspaceId],
    );
    let created = 0;
    for (const c of rows as { id: string; participant_name: string | null }[]) {
      const id = uuid();
      await conn.execute(
        "INSERT INTO crm_contacts (id, workspace_id, name, source, created_by) VALUES (?, ?, ?, 'dm', ?)",
        [id, workspaceId, (c.participant_name || "Tanpa nama").slice(0, 255), userId],
      );
      await conn.execute("UPDATE crm_conversations SET contact_id = ? WHERE id = ?", [id, c.id]);
      created++;
    }
    return created;
  });
}

export async function listContactsCore(
  workspaceId: string,
  o: { query?: string; tag?: string; limit?: number; offset?: number },
) {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const where = ["k.workspace_id = ?"];
  const params: unknown[] = [workspaceId];
  const term = (o.query ?? "").replace(/[%,()]/g, " ").trim();
  if (term) {
    where.push("(k.name LIKE ? OR k.phone LIKE ? OR k.email LIKE ? OR k.company_name LIKE ?)");
    params.push(...Array(4).fill(`%${term}%`));
  }
  if (o.tag) {
    where.push("JSON_CONTAINS(COALESCE(k.tags, JSON_ARRAY()), JSON_QUOTE(?))");
    params.push(o.tag.toLowerCase());
  }
  const limit = Math.min(Math.max(o.limit ?? 25, 1), 100);
  const offset = Math.max(o.offset ?? 0, 0);
  const rows = await execute<Record<string, unknown>>(
    `SELECT k.id, k.name, k.phone, k.email, k.company_name, k.tags, k.source, k.created_at,
            (SELECT MAX(c.last_message_at) FROM crm_conversations c WHERE c.contact_id = k.id) AS last_interaction_at,
            (SELECT GROUP_CONCAT(DISTINCT a.platform) FROM crm_conversations c
               JOIN crm_social_accounts a ON a.id = c.account_id WHERE c.contact_id = k.id) AS platforms,
            (SELECT COUNT(*) FROM crm_leads l WHERE l.contact_id = k.id) AS lead_count
       FROM crm_contacts k WHERE ${where.join(" AND ")}
      ORDER BY COALESCE((SELECT MAX(c.last_message_at) FROM crm_conversations c WHERE c.contact_id = k.id), k.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const total = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM crm_contacts k WHERE ${where.join(" AND ")}`,
    params,
  );
  return {
    total: Number(total?.n ?? 0),
    rows: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      company_name: (r.company_name as string | null) ?? null,
      tags: parseTags(r.tags),
      source: String(r.source),
      platforms: r.platforms ? String(r.platforms).split(",") : [],
      lead_count: Number(r.lead_count ?? 0),
      last_interaction_at: r.last_interaction_at
        ? new Date(String(r.last_interaction_at).replace(" ", "T") + "Z").toISOString()
        : null,
    })),
  };
}

function parseTags(v: unknown): string[] {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

export type TimelineItem = {
  at: string;
  kind: "message" | "lead" | "activity";
  title: string;
  detail?: string;
  platform?: string;
  direction?: string;
};

export async function getContactCore(workspaceId: string, contactId: string) {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const k = await executeOne<Record<string, unknown>>(
    "SELECT * FROM crm_contacts WHERE workspace_id = ? AND id = ?",
    [workspaceId, contactId],
  );
  if (!k) throw new Error("Kontak tidak ditemukan.");
  const [convs, leads] = await Promise.all([
    execute<Record<string, unknown>>(
      `SELECT c.id, c.status, c.unread_count, a.platform, a.account_name
         FROM crm_conversations c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? AND c.contact_id = ? LIMIT 20`,
      [workspaceId, contactId],
    ),
    execute<Record<string, unknown>>(
      `SELECT id, code, name, stage, status, estimated_value, created_at FROM crm_leads
        WHERE workspace_id = ? AND contact_id = ? ORDER BY created_at DESC LIMIT 20`,
      [workspaceId, contactId],
    ),
  ]);
  const convIds = convs.map((c) => String(c.id));
  const leadIds = leads.map((l) => String(l.id));
  const [messages, activities] = await Promise.all([
    convIds.length
      ? execute<Record<string, unknown>>(
          `SELECT m.direction, m.body, m.created_at, a.platform
             FROM crm_messages m JOIN crm_conversations c ON c.id = m.conversation_id
             LEFT JOIN crm_social_accounts a ON a.id = c.account_id
            WHERE m.workspace_id = ? AND m.conversation_id IN (${convIds.map(() => "?").join(",")})
            ORDER BY m.created_at DESC LIMIT 40`,
          [workspaceId, ...convIds],
        )
      : Promise.resolve([]),
    leadIds.length
      ? execute<Record<string, unknown>>(
          `SELECT activity_type, subject, body, due_at, done_at, created_at FROM crm_activities
            WHERE workspace_id = ? AND lead_id IN (${leadIds.map(() => "?").join(",")})
            ORDER BY created_at DESC LIMIT 30`,
          [workspaceId, ...leadIds],
        )
      : Promise.resolve([]),
  ]);
  const t = (v: unknown) => new Date(String(v).replace(" ", "T") + "Z").toISOString();
  const timeline: TimelineItem[] = [
    ...messages.map((m) => ({
      at: t(m.created_at),
      kind: "message" as const,
      title:
        m.direction === "inbound"
          ? "Pesan masuk"
          : m.direction === "note"
            ? "Catatan"
            : "Pesan keluar",
      detail: String(m.body ?? "").slice(0, 300),
      platform: (m.platform as string | null) ?? undefined,
      direction: String(m.direction),
    })),
    ...leads.map((l) => ({
      at: t(l.created_at),
      kind: "lead" as const,
      title: `Prospek ${l.code} · ${l.stage}`,
      detail: String(l.name),
    })),
    ...activities.map((a) => ({
      at: t(a.created_at),
      kind: "activity" as const,
      title: `${a.activity_type}: ${a.subject}${a.done_at ? " ✓" : ""}`,
      detail: a.body ? String(a.body).slice(0, 300) : undefined,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
  return {
    contact: {
      id: String(k.id),
      name: String(k.name),
      phone: (k.phone as string | null) ?? null,
      email: (k.email as string | null) ?? null,
      company_name: (k.company_name as string | null) ?? null,
      tags: parseTags(k.tags),
      notes: (k.notes as string | null) ?? null,
      source: String(k.source),
    },
    conversations: convs.map((c) => ({
      id: String(c.id),
      platform: (c.platform as string | null) ?? "",
      account_name: (c.account_name as string | null) ?? "",
      status: String(c.status),
      unread_count: Number(c.unread_count ?? 0),
    })),
    leads: leads.map((l) => ({
      id: String(l.id),
      code: String(l.code),
      name: String(l.name),
      stage: String(l.stage),
      status: String(l.status),
      estimated_value: Number(l.estimated_value),
    })),
    timeline,
  };
}

export async function createContactCore(workspaceId: string, userId: string, d: ContactInput) {
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const name = clean(d.name, 255);
  if (!name) throw new Error("Nama kontak wajib diisi.");
  const id = uuid();
  await execute(
    `INSERT INTO crm_contacts (id, workspace_id, name, phone, email, company_name, tags, notes, source, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
    [
      id,
      workspaceId,
      name,
      clean(d.phone, 50),
      clean(d.email, 255),
      clean(d.company_name, 255),
      JSON.stringify(normalizeTags(d.tags)),
      clean(d.notes, 5000),
      userId,
    ],
  );
  return { id };
}

export async function updateContactCore(workspaceId: string, contactId: string, d: ContactInput) {
  const { result } = await import("@/integrations/mysql/pool");
  const sets: string[] = [];
  const params: unknown[] = [];
  if (d.name !== undefined) {
    const name = clean(d.name, 255);
    if (!name) throw new Error("Nama kontak wajib diisi.");
    sets.push("name = ?");
    params.push(name);
  }
  for (const [k, max] of [
    ["phone", 50],
    ["email", 255],
    ["company_name", 255],
    ["notes", 5000],
  ] as const) {
    if (d[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(clean(d[k], max));
    }
  }
  if (d.tags !== undefined) {
    sets.push("tags = ?");
    params.push(JSON.stringify(normalizeTags(d.tags)));
  }
  if (!sets.length) throw new Error("Tidak ada yang diubah.");
  const r = await result(
    `UPDATE crm_contacts SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
    [...params, workspaceId, contactId],
  );
  if (!r.affectedRows) throw new Error("Kontak tidak ditemukan.");
  return { ok: true as const };
}

export async function deleteContactCore(workspaceId: string, contactId: string) {
  const { result } = await import("@/integrations/mysql/pool");
  const r = await result("DELETE FROM crm_contacts WHERE workspace_id = ? AND id = ?", [
    workspaceId,
    contactId,
  ]);
  if (!r.affectedRows) throw new Error("Kontak tidak ditemukan.");
  return { ok: true as const };
}

/** Membuat prospek dari kontak (satu prospek terbuka per kontak; bila sudah ada, mengembalikannya). */
export async function createLeadFromContactCore(
  userId: string,
  workspaceId: string,
  contactId: string,
) {
  const { transaction, uuid } = await import("@/integrations/mysql/pool");
  return transaction(async (conn) => {
    const [krows] = await conn.execute(
      "SELECT id, name, phone, email, company_name, notes FROM crm_contacts WHERE workspace_id = ? AND id = ? FOR UPDATE",
      [workspaceId, contactId],
    );
    const k = (krows as Record<string, string | null>[])[0];
    if (!k) throw new Error("Kontak tidak ditemukan.");
    const [open] = await conn.execute(
      "SELECT id FROM crm_leads WHERE workspace_id = ? AND contact_id = ? AND status = 'open' LIMIT 1",
      [workspaceId, contactId],
    );
    const existing = (open as { id: string }[])[0];
    if (existing) return { leadId: existing.id, existing: true };
    await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [workspaceId]);
    const [codes] = await conn.execute("SELECT code FROM crm_leads WHERE workspace_id = ?", [
      workspaceId,
    ]);
    const leadId = uuid();
    await conn.execute(
      `INSERT INTO crm_leads (id, workspace_id, code, name, company_name, email, phone, source, notes, contact_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Kontak', ?, ?, ?)`,
      [
        leadId,
        workspaceId,
        nextLeadCode((codes as { code: string }[]).map((c) => c.code)),
        k.name,
        k.company_name,
        k.email,
        k.phone,
        k.notes,
        contactId,
        userId,
      ],
    );
    return { leadId, existing: false };
  });
}
