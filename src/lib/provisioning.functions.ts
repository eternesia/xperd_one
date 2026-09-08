import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const TRIAL_DAYS = 30;

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface RegistrationRow {
  id: string;
  company_name: string;
  subdomain: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string | null;
  industry: string | null;
  package_code: string;
  billing_cycle: string;
  status: string;
  tenant_id: string | null;
  notes: string | null;
}

interface PackageRow {
  id: string;
  code: string;
  name: string | null;
  monthly_price: number | null;
}

export const provisionRegistration = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { registrationId: string }) => {
    if (!data?.registrationId) throw new Error("Registration is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin"))) throw new Error("Forbidden");

    const { execute, executeOne, transaction, uuid } = await import("@/integrations/mysql/pool");
    const { seedWorkspaceDefaults, randomPassword } = await import("@/lib/provisioning.server");
    const { hashPassword } = await import("@/lib/auth-jwt.server");

    const reg = await executeOne<RegistrationRow>("SELECT * FROM registrations WHERE id = ? LIMIT 1", [
      data.registrationId,
    ]);
    if (!reg) throw new Error("Registration not found");
    if (reg.status === "provisioned" && reg.tenant_id) throw new Error("This registration is already provisioned");

    const email = reg.email.trim().toLowerCase();
    const subdomain = reg.subdomain.trim().toLowerCase();

    const dupe = await executeOne<{ id: string }>("SELECT id FROM tenants WHERE subdomain = ? LIMIT 1", [subdomain]);
    if (dupe) throw new Error(`Subdomain "${subdomain}" is already used by another tenant`);

    const pkg = await executeOne<PackageRow>(
      "SELECT id, code, name, monthly_price FROM packages WHERE code = ? LIMIT 1",
      [reg.package_code],
    );

    const generatedPassword = randomPassword();
    const ownerId = uuid();
    const tenantId = uuid();
    const subId = uuid();
    const wsId = uuid();

    const today = new Date().toISOString().slice(0, 10);
    const trialEnds = addDays(TRIAL_DAYS);
    const monthly = Number(pkg?.monthly_price ?? 0);
    const yearly = reg.billing_cycle === "yearly";
    const unitPrice = yearly ? monthly * 12 : monthly;
    const periodEnd = yearly ? addDays(365) : addDays(30);

    const stamp = new Date();
    const invoiceNumber = `INV/${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}/${subdomain
      .slice(0, 6)
      .toUpperCase()}-${String(stamp.getTime()).slice(-4)}`;

    await transaction(async (conn) => {
      await conn.execute(
        "INSERT INTO app_users (id, email, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)",
        [ownerId, email, reg.contact_name, await hashPassword(generatedPassword)],
      );
      await conn.execute(
        "INSERT INTO profiles (id, email, full_name, company_name, phone) VALUES (?, ?, ?, ?, ?)",
        [ownerId, email, reg.contact_name, reg.company_name, reg.phone],
      );
      await conn.execute(
        "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer') ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [uuid(), ownerId],
      );
      await conn.execute(
        `INSERT INTO tenants
           (id, name, subdomain, owner_id, package_id, status, industry, city, pic_name, pic_email, pic_phone, user_count, workspace_count, started_at, trial_ends_at, notes)
         VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
        [tenantId, reg.company_name, subdomain, ownerId, pkg?.id ?? null, reg.industry, reg.city, reg.contact_name, email, reg.phone, today, trialEnds, reg.notes],
      );
      await conn.execute(
        `INSERT INTO subscriptions
           (id, tenant_id, package_id, status, billing_cycle, seats, unit_price, current_period_start, current_period_end, auto_renew)
         VALUES (?, ?, ?, 'trialing', ?, 1, ?, ?, ?, 1)`,
        [subId, tenantId, pkg?.id ?? null, reg.billing_cycle, unitPrice, today, periodEnd],
      );
      await conn.execute(
        `INSERT INTO workspaces
           (id, tenant_id, name, legal_name, slug, currency, timezone, fiscal_year_start_month, default_costing_method, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'IDR', 'Asia/Jakarta', 1, 'AVERAGE', 'active', ?)`,
        [wsId, tenantId, reg.company_name, reg.company_name, subdomain, ownerId],
      );
      await conn.execute(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, 'owner') ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [uuid(), wsId, ownerId],
      );
      await conn.execute(
        `INSERT INTO invoices
           (id, invoice_number, tenant_id, subscription_id, status, issue_date, due_date, subtotal, tax_amount, total, auto_reminder, notes)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, 1, ?)`,
        [uuid(), invoiceNumber, tenantId, subId, today, trialEnds, unitPrice, unitPrice, `First subscription invoice for ${pkg?.name ?? reg.package_code}`],
      );
      await conn.execute("UPDATE registrations SET status = 'provisioned', tenant_id = ? WHERE id = ?", [
        tenantId,
        reg.id,
      ]);
    });

    // Seed default master data (best-effort; separate from the transaction above).
    await seedWorkspaceDefaults(wsId);

    return {
      tenantId,
      workspaceId: wsId,
      email,
      password: generatedPassword,
      invoiceNumber,
      trialEndsAt: trialEnds,
    };
  });

export const resetRegistrationOwnerPassword = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { email: string }) => {
    if (!data?.email?.includes("@")) throw new Error("Valid email is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin"))) throw new Error("Forbidden");

    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { randomPassword } = await import("@/lib/provisioning.server");
    const { hashPassword } = await import("@/lib/auth-jwt.server");

    const email = data.email.trim().toLowerCase();
    const user = await executeOne<{ id: string }>("SELECT id FROM app_users WHERE email = ? LIMIT 1", [email]);
    if (!user) throw new Error("No account with that email");

    const password = randomPassword();
    await execute("UPDATE app_users SET password_hash = ? WHERE id = ?", [await hashPassword(password), user.id]);
    return { email, password };
  });

/** Seed a freshly created workspace with default Indonesian master data. */
export const seedWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const { seedWorkspaceDefaults } = await import("@/lib/provisioning.server");
    await seedWorkspaceDefaults(data.workspaceId);
    return { ok: true };
  });
