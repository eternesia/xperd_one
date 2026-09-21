// Platform-level data access (MySQL). Replaces direct Supabase client queries
// in the billing route and the /app-admin pages.
//
// Gating model (reproduces the old RLS/supabase-auth behaviour):
//   * Admin-gated functions require role 'admin' (requireAdmin).
//   * Tenant-scoped reads require the caller to be a member of a workspace
//     that belongs to the tenant (userCanAccessTenant).
//   * Workspace-scoped reads reuse isWorkspaceMember.
// All table names and column names are whitelisted; all values parameterized.
// Server-only — MySQL imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

// Platform tables (no workspace_id) reachable by admin functions.
const ADMIN_TABLES = new Set([
  "tenants", "packages", "subscriptions", "invoices", "reminders", "registrations",
  "leads", "site_content", "announcements", "support_tickets", "support_ticket_messages",
  "payment_gateways", "upgrade_requests", "profiles", "user_roles", "app_users",
  "workspaces", "workspace_members",
  // Add-on catalog + tenant assignments (003_addons.sql)
  "addons", "tenant_addons",
]);

// Per-table column whitelist (mirrors 001-schema.sql).
const PCOLS: Record<string, string[]> = {
  tenants: ["id", "name", "subdomain", "package_id", "owner_id", "status", "industry", "pic_name", "pic_email", "pic_phone", "city", "user_count", "trial_ends_at", "started_at", "ends_at", "workspace_count", "notes", "created_at", "updated_at"],
  packages: ["id", "code", "name", "product_line", "tagline", "description", "monthly_price", "is_public_signup", "max_workspace", "max_company", "max_users", "features", "sort_order", "is_active", "created_at", "updated_at"],
  subscriptions: ["id", "tenant_id", "package_id", "status", "billing_cycle", "seats", "unit_price", "current_period_start", "current_period_end", "auto_renew", "cancelled_at", "created_at", "updated_at"],
  invoices: ["id", "invoice_number", "tenant_id", "subscription_id", "status", "issue_date", "due_date", "subtotal", "tax_amount", "total", "paid_at", "payment_method", "payment_url", "gateway_reference", "auto_reminder", "notes", "created_at", "updated_at"],
  reminders: ["id", "tenant_id", "invoice_id", "type", "status", "channel", "scheduled_at", "sent_at", "message", "created_at", "updated_at"],
  registrations: ["id", "company_name", "subdomain", "contact_name", "email", "phone", "city", "industry", "package_code", "billing_cycle", "status", "tenant_id", "notes", "created_at", "updated_at"],
  leads: ["id", "company_name", "contact_name", "email", "phone", "job_title", "industry", "employee_range", "interested_product", "message", "status", "source", "created_at", "updated_at"],
  site_content: ["id", "section", "key", "title_en", "title_id", "body_en", "body_id", "image_url", "link_url", "sort_order", "is_published", "created_at", "updated_at"],
  announcements: ["id", "title_en", "title_id", "body_en", "body_id", "severity", "audience", "starts_at", "ends_at", "is_published", "created_at", "updated_at"],
  support_tickets: ["id", "ticket_no", "tenant_id", "workspace_id", "subject", "category", "priority", "status", "description", "created_by", "assigned_to", "resolved_at", "created_at", "updated_at"],
  support_ticket_messages: ["id", "ticket_id", "author_id", "body", "is_internal", "created_at", "updated_at"],
  payment_gateways: ["id", "provider", "display_name", "mode", "is_active", "merchant_id", "client_key", "server_key_secret_name", "callback_url", "instructions", "sort_order", "created_at", "updated_at"],
  upgrade_requests: ["id", "tenant_id", "workspace_id", "requested_package_id", "requested_by", "notes", "status", "created_at", "updated_at"],
  profiles: ["id", "full_name", "email", "company_name", "phone", "created_at", "updated_at"],
  user_roles: ["id", "user_id", "role", "created_at"],
  app_users: ["id", "email", "full_name", "password_hash", "is_active", "auth_user_id", "last_login_at", "created_at", "updated_at"],
  workspaces: ["id", "tenant_id", "name", "legal_name", "slug", "currency", "timezone", "fiscal_year_start_month", "default_costing_method", "address", "tax_id", "doc_template", "bank_info", "doc_footer_note", "status", "created_by", "created_at", "updated_at"],
  workspace_members: ["id", "workspace_id", "user_id", "role", "created_at", "updated_at"],
  addons: ["id", "code", "name", "tagline", "description", "monthly_price", "module_id", "is_active", "sort_order", "created_at", "updated_at"],
  tenant_addons: ["id", "tenant_id", "addon_id", "status", "starts_at", "ends_at", "monthly_price", "notes", "created_at", "updated_at"],
};

function assertAdminTable(table: string): string {
  if (!ADMIN_TABLES.has(table)) throw new Error(`Table "${table}" is not allowed`);
  return table;
}

function clean(table: string, keys: string[], omit = new Set<string>()): string[] {
  const allowed = PCOLS[table];
  const out: string[] = [];
  for (const k of keys) {
    if (allowed.includes(k) && !omit.has(k)) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Admin-gated generic CRUD
// ---------------------------------------------------------------------------

export interface AdminListInput {
  table: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export const adminList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as AdminListInput)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const table = assertAdminTable(data.table);

    const where: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(data.filters ?? {})) {
      if (PCOLS[table].includes(key)) {
        where.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }
    const wsql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const orderBy = data.orderBy && PCOLS[table].includes(data.orderBy) ? `\`${data.orderBy}\`` : "`created_at`";
    const orderDir = data.orderDir === "asc" ? "ASC" : "DESC";
    const limit = Math.min(Math.max(Number(data.limit) || 200, 1), 5000);
    const offset = Math.max(Number(data.offset) || 0, 0);

    const row = await executeOne<{ c: number }>(`SELECT COUNT(*) AS c FROM \`${table}\`${wsql}`, params);
    const rows = await execute(
      `SELECT * FROM \`${table}\`${wsql} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)],
    );
    return { rows: rows as Record<string, any>[], count: Number(row?.c ?? 0) };
  });

export interface AdminSaveInput {
  table: string;
  id?: string;
  data: Record<string, unknown>;
}

export const adminSave = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as AdminSaveInput)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const table = assertAdminTable(data.table);
    const omit = new Set(["id", "created_at", "updated_at"]);

    if (data.id) {
      const cols = clean(table, Object.keys(data.data ?? {}), omit);
      if (!cols.length) throw new Error("No valid columns to update");
      await execute(
        `UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE \`id\` = ?`,
        [...cols.map((c) => data.data[c]), data.id],
      );
      return { id: data.id };
    }

    const payload: Record<string, unknown> = { id: uuid() };
    for (const c of clean(table, Object.keys(data.data ?? {}), omit)) payload[c] = data.data[c];
    const cols = Object.keys(payload);
    await execute(
      `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => payload[c]),
    );
    return { id: payload.id as string };
  });

export interface AdminDeleteInput {
  table: string;
  id: string;
}

export const adminDelete = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as AdminDeleteInput)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const table = assertAdminTable(data.table);
    await execute(`DELETE FROM \`${table}\` WHERE \`id\` = ?`, [data.id]);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

export const getAdminDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as {})
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const [tenants, subs, invoices, leads, recent] = await Promise.all([
      execute("SELECT id, status FROM tenants"),
      executeOne<{ c: number }>("SELECT COUNT(*) AS c FROM subscriptions"),
      execute("SELECT total, status FROM invoices"),
      executeOne<{ c: number }>("SELECT COUNT(*) AS c FROM leads"),
      execute("SELECT id, name, subdomain, status, created_at FROM tenants ORDER BY created_at DESC LIMIT 6"),
    ]);
    const inv = (invoices ?? []) as { total?: unknown; status?: string }[];
    return {
      tenantCount: (tenants ?? []).length,
      activeTenants: (tenants ?? []).filter((t) => t.status === "active").length,
      subCount: Number(subs?.c ?? 0),
      leadCount: Number(leads?.c ?? 0),
      outstanding: inv.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total ?? 0), 0),
      recent: recent ?? [],
    };
  });

// Tenants joined with package name (tenancy page).
export const adminListTenantsWithPackages = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as {})
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const rows = await execute<Record<string, any>>(
      "SELECT t.*, p.name AS package_name FROM tenants t LEFT JOIN packages p ON p.id = t.package_id ORDER BY t.created_at DESC",
    );
    // Mimic the Business Suite supabase join `select("*, packages(name)")` so
    // the tenancy UI can keep reading `tenant.packages?.name`.
    return (rows ?? []).map((r) => ({
      ...r,
      packages: r.package_name ? { name: r.package_name as string } : null,
    }));
  });

// ---------------------------------------------------------------------------
// Tenant-scoped billing reads (billing page)
// ---------------------------------------------------------------------------

async function tenantGate(tenantId: string, userId: string): Promise<void> {
  const { userCanAccessTenant } = await import("@/lib/auth-context.server");
  if (!(await userCanAccessTenant(tenantId, userId))) throw new Error("Forbidden");
}

export const getTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { tenantId: string })
  .handler(async ({ data, context }) => {
    await tenantGate(data.tenantId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    return executeOne(
      "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
      [data.tenantId],
    );
  });

export const listTenantInvoices = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { tenantId: string })
  .handler(async ({ data, context }) => {
    await tenantGate(data.tenantId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute("SELECT * FROM invoices WHERE tenant_id = ? ORDER BY issue_date DESC", [data.tenantId]);
  });

export const listTenantUpgradeRequests = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { tenantId: string })
  .handler(async ({ data, context }) => {
    await tenantGate(data.tenantId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute("SELECT * FROM upgrade_requests WHERE tenant_id = ? ORDER BY created_at DESC", [data.tenantId]);
  });

export interface CreateUpgradeRequestInput {
  tenantId: string;
  workspaceId: string;
  requestedPackageId: string;
  notes?: string | null;
}

export const createUpgradeRequest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as CreateUpgradeRequestInput)
  .handler(async ({ data, context }) => {
    await tenantGate(data.tenantId, context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await execute(
      `INSERT INTO upgrade_requests (id, tenant_id, workspace_id, requested_package_id, requested_by, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [uuid(), data.tenantId, data.workspaceId, data.requestedPackageId, context.userId, data.notes ?? null],
    );
    return { ok: true };
  });

// Public package list for the upgrade picker (billing page).
export const listPublicPackages = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as {})
  .handler(async () => {
    const { execute } = await import("@/integrations/mysql/pool");
    return execute(
      "SELECT id, code, name, monthly_price, max_users, max_workspace, product_line FROM packages WHERE is_active = 1 ORDER BY sort_order ASC",
    );
  });

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Workspace-scoped workspace settings update (settings page)
// ---------------------------------------------------------------------------

export interface UpdateWorkspaceInput {
  workspaceId: string;
  data: Record<string, unknown>;
}

export const updateWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as UpdateWorkspaceInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const cols = clean(
      "workspaces",
      Object.keys(data.data ?? {}),
      new Set(["id", "tenant_id", "slug", "created_by", "created_at", "updated_at"]),
    );
    if (!cols.length) throw new Error("No valid columns to update");
    await execute(
      `UPDATE workspaces SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`,
      [...cols.map((c) => data.data[c]), data.workspaceId],
    );
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Workspace-scoped profiles (team page)
// ---------------------------------------------------------------------------

export interface ListProfilesByIdsInput {
  workspaceId: string;
  ids: string[];
}

export const listProfilesByIds = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as ListProfilesByIdsInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    if (!data.ids?.length) return [];
    const ph = data.ids.map(() => "?").join(", ");
    return execute(`SELECT id, full_name, email FROM profiles WHERE id IN (${ph})`, data.ids);
  });
