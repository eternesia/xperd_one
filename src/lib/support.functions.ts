/** Fitur sisi pengguna: testimoni publik, pengumuman di ikon notifikasi, dan tiket support ke Help Desk Super Admin. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/* ---------- Testimoni (publik) ---------- */
export const listPublicTestimonials = createServerFn({ method: "POST" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  try {
    return await execute<{
      id: string;
      name: string;
      role_id: string | null;
      role_en: string | null;
      quote_id: string;
      quote_en: string | null;
      rating: number | null;
    }>(
      "SELECT id, name, role_id, role_en, quote_id, quote_en, rating FROM testimonials WHERE is_published = 1 ORDER BY sort_order, created_at LIMIT 60",
    );
  } catch {
    return [];
  }
});

/* ---------- Pengumuman ---------- */
export const listMyAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ tenantId: z.string().uuid().nullable() }).parse(v))
  .handler(async ({ data, context }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    let status: string | null = null;
    if (data.tenantId) {
      const { userCanAccessTenant } = await import("@/lib/auth-context.server");
      if (await userCanAccessTenant(data.tenantId, context.userId)) {
        status =
          (
            await executeOne<{ status: string }>("SELECT status FROM tenants WHERE id = ?", [
              data.tenantId,
            ])
          )?.status ?? null;
      }
    }
    const audiences = ["all", ...(status ? [status] : [])];
    return execute<{
      id: string;
      title_en: string;
      title_id: string | null;
      body_en: string | null;
      body_id: string | null;
      severity: string;
      starts_at: string;
    }>(
      `SELECT id, title_en, title_id, body_en, body_id, severity, starts_at FROM announcements
        WHERE is_published = 1 AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
          AND audience IN (${audiences.map(() => "?").join(",")})
        ORDER BY starts_at DESC LIMIT 20`,
      audiences,
    );
  });

/* ---------- Tiket support ---------- */
async function myTicket(ticketId: string, userId: string) {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const t = await executeOne<{ id: string; tenant_id: string | null; created_by: string }>(
    "SELECT id, tenant_id, created_by FROM support_tickets WHERE id = ?",
    [ticketId],
  );
  if (!t) throw new Error("Tiket tidak ditemukan.");
  if (t.created_by !== userId) {
    const { userCanAccessTenant } = await import("@/lib/auth-context.server");
    if (!t.tenant_id || !(await userCanAccessTenant(t.tenant_id, userId)))
      throw new Error("Tiket tidak ditemukan.");
  }
  return t;
}

export const listMyTickets = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ tenantId: z.string().uuid().nullable() }).parse(v))
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    let tenant: string | null = null;
    if (data.tenantId) {
      const { userCanAccessTenant } = await import("@/lib/auth-context.server");
      if (await userCanAccessTenant(data.tenantId, context.userId)) tenant = data.tenantId;
    }
    return execute<{
      id: string;
      ticket_no: string;
      subject: string;
      category: string;
      priority: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, ticket_no, subject, category, priority, status, created_at, updated_at FROM support_tickets
        WHERE created_by = ? ${tenant ? "OR tenant_id = ?" : ""} ORDER BY updated_at DESC LIMIT 100`,
      tenant ? [context.userId, tenant] : [context.userId],
    );
  });

export const createMyTicket = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        tenantId: z.string().uuid().nullable(),
        workspaceId: z.string().uuid().nullable(),
        subject: z.string().trim().min(3).max(200),
        category: z.enum(["general", "billing", "technical", "account", "feature"]),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        description: z.string().trim().min(5).max(5000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const { userCanAccessTenant, isWorkspaceMember } = await import("@/lib/auth-context.server");
    const tenant =
      data.tenantId && (await userCanAccessTenant(data.tenantId, context.userId))
        ? data.tenantId
        : null;
    const ws =
      data.workspaceId && (await isWorkspaceMember(data.workspaceId, context.userId))
        ? data.workspaceId
        : null;
    const id = uuid();
    const d = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
    const no = `TKT-${d}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await execute(
      `INSERT INTO support_tickets (id, ticket_no, tenant_id, workspace_id, subject, category, priority, status, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        id,
        no,
        tenant,
        ws,
        `[Qalling] ${data.subject}`.slice(0, 255),
        data.category,
        data.priority,
        data.description,
        context.userId,
      ],
    );
    return { id, ticketNo: no };
  });

export const getMyTicket = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ ticketId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await myTicket(data.ticketId, context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const ticket = await executeOne<{
      id: string;
      ticket_no: string;
      subject: string;
      category: string;
      priority: string;
      status: string;
      description: string | null;
      created_by: string;
      created_at: string;
    }>(
      "SELECT id, ticket_no, subject, category, priority, status, description, created_by, created_at FROM support_tickets WHERE id = ?",
      [data.ticketId],
    );
    const messages = await execute<{
      id: string;
      author_id: string;
      body: string;
      created_at: string;
    }>(
      "SELECT id, author_id, body, created_at FROM support_ticket_messages WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at ASC",
      [data.ticketId],
    );
    return {
      ticket,
      messages: messages.map((m) => ({
        ...m,
        fromSupport: m.author_id !== ticket?.created_by && m.author_id !== context.userId,
      })),
    };
  });

export const replyMyTicket = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z.object({ ticketId: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await myTicket(data.ticketId, context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await execute(
      "INSERT INTO support_ticket_messages (id, ticket_id, author_id, body, is_internal) VALUES (?, ?, ?, ?, 0)",
      [uuid(), data.ticketId, context.userId, data.body],
    );
    // Balasan pengguna membuka kembali tiket yang sudah selesai agar terlihat di Help Desk.
    await execute(
      "UPDATE support_tickets SET status = IF(status IN ('resolved','closed'), 'open', status), updated_at = NOW(6) WHERE id = ?",
      [data.ticketId],
    );
    return { ok: true };
  });
