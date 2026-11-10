/**
 * Superadmin: prospek dari form kontak publik (xperd.id/contact → tabel leads).
 * Daftar + filter, ubah status, catatan, jadwal follow-up berikutnya.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface AdminLead {
  id: string;
  company_name: string;
  contact_name: string;
  job_title: string | null;
  email: string;
  phone: string | null;
  industry: string | null;
  employee_range: string | null;
  interested_product: string;
  message: string | null;
  notes: string | null;
  next_follow_up: string | null;
  last_contacted_at: string | null;
  handled_by_email: string | null;
  status: string;
  source: string | null;
  created_at: string;
}

async function guard(userId: string) {
  const { requireAdmin } = await import("@/lib/auth-context.server");
  await requireAdmin(userId);
}

export const adminListLeads = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => (input ?? {}) as { status?: string; q?: string })
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const where: string[] = [];
    const params: unknown[] = [];
    if (data.status === "followup") {
      where.push(
        "l.next_follow_up IS NOT NULL AND l.next_follow_up <= DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) AND l.status NOT IN ('won','lost','spam')",
      );
    } else if (data.status && data.status !== "all") {
      where.push("l.status = ?");
      params.push(data.status);
    }
    const q = (data.q ?? "").trim();
    if (q) {
      where.push(
        "(l.company_name LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?)",
      );
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const rows = await execute<AdminLead>(
      `SELECT l.*, u.email AS handled_by_email
         FROM leads l LEFT JOIN app_users u ON u.id = l.handled_by
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY (l.status = 'new') DESC, l.created_at DESC
        LIMIT 500`,
      params,
    );
    const counts = await execute<{ status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM leads GROUP BY status",
    );
    const due = await execute<{ n: number }>(
      `SELECT COUNT(*) AS n FROM leads WHERE next_follow_up IS NOT NULL AND next_follow_up <= DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)
         AND status NOT IN ('won','lost','spam')`,
    );
    return {
      rows: rows.map((r) => ({
        ...r,
        next_follow_up: r.next_follow_up ? String(r.next_follow_up).slice(0, 10) : null,
        last_contacted_at: r.last_contacted_at ? String(r.last_contacted_at) : null,
        created_at: String(r.created_at),
      })),
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<
        string,
        number
      >,
      followupDue: Number(due[0]?.n ?? 0),
    };
  });

/** Jumlah prospek baru (untuk badge menu superadmin). */
export const adminLeadsBadge = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await guard(context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const r = await executeOne<{ n: number; due: number }>(
      `SELECT SUM(status = 'new') AS n,
              SUM(next_follow_up IS NOT NULL AND next_follow_up <= DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)
                  AND status NOT IN ('won','lost','spam')) AS due
         FROM leads`,
    );
    return { new: Number(r?.n ?? 0), due: Number(r?.due ?? 0) };
  });

export const adminUpdateLead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as {
        id: string;
        status?: string;
        notes?: string | null;
        next_follow_up?: string | null;
        markContacted?: boolean;
      },
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const sets: string[] = ["handled_by = ?"];
    const params: unknown[] = [context.userId];
    if (data.status !== undefined) {
      if (!(LEAD_STATUSES as readonly string[]).includes(data.status))
        throw new Error("Status tidak valid.");
      sets.push("status = ?");
      params.push(data.status);
      if (data.status === "contacted")
        sets.push("last_contacted_at = COALESCE(last_contacted_at, UTC_TIMESTAMP(6))");
    }
    if (data.notes !== undefined) {
      sets.push("notes = ?");
      params.push(data.notes ? String(data.notes).slice(0, 20000) : null);
    }
    if (data.next_follow_up !== undefined) {
      const d = data.next_follow_up || null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Format tanggal tidak valid.");
      sets.push("next_follow_up = ?");
      params.push(d);
    }
    if (data.markContacted) {
      sets.push("last_contacted_at = UTC_TIMESTAMP(6)");
      sets.push("status = IF(status = 'new', 'contacted', status)");
    }
    await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, [...params, data.id]);
    return { ok: true };
  });

export const adminDeleteLead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { id: string })
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    await execute("DELETE FROM leads WHERE id = ?", [data.id]);
    return { ok: true };
  });
