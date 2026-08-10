// App shell data server functions (MySQL-backed).
// Returns the current user's tenant, package, and workspaces — replicating the
// old Supabase RLS scoping (tenant owner OR member) in the query layer.
// NOTE: server-only — import via dynamic `await import()` inside handlers.

import { createServerFn } from "@tanstack/react-start";

export interface ShellTenant {
  id: string;
  name: string;
  subdomain: string;
  package_id: string | null;
  status: string;
  trial_ends_at: string | null;
  workspace_count: number;
  user_count: number;
}

export interface ShellPackage {
  id: string;
  code: string;
  name: string;
  max_workspace: number | null;
  max_users: number | null;
  monthly_price: number | null;
}

export interface ShellWorkspace {
  id: string;
  tenant_id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  currency: string;
  timezone: string;
  fiscal_year_start_month: number;
  default_costing_method: "FIFO" | "LIFO" | "AVERAGE";
  status: "setup" | "active" | "suspended";
}

export const getAppShellData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("@/lib/auth-context.server");
  const { executeOne, execute } = await import("@/integrations/mysql/pool");

  const user = await requireUser();

  // Resolve the user's tenant: one they own, else one they belong to as a member.
  const tenant = await executeOne<ShellTenant>(
    `SELECT t.id, t.name, t.subdomain, t.package_id, t.status, t.trial_ends_at,
            t.workspace_count, t.user_count
       FROM tenants t
      WHERE t.owner_id = ?
         OR EXISTS (
               SELECT 1
                 FROM workspaces w
                 JOIN workspace_members m ON m.workspace_id = w.id
                WHERE w.tenant_id = t.id AND m.user_id = ?
             )
      ORDER BY t.created_at ASC
      LIMIT 1`,
    [user.id, user.id],
  );

  const pkg = tenant?.package_id
    ? await executeOne<ShellPackage>(
        "SELECT id, code, name, max_workspace, max_users, monthly_price FROM packages WHERE id = ? LIMIT 1",
        [tenant.package_id],
      )
    : null;

  const workspaces = tenant
    ? await execute<ShellWorkspace>(
        `SELECT w.id, w.tenant_id, w.name, w.legal_name, w.slug, w.currency, w.timezone,
                w.fiscal_year_start_month, w.default_costing_method, w.status
           FROM workspaces w
          WHERE w.tenant_id = ?
          ORDER BY w.created_at ASC`,
        [tenant.id],
      )
    : [];

  return { tenant: tenant ?? null, pkg: pkg ?? null, workspaces };
});
