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

    const { provisionRegistrationCore } = await import("@/lib/provisioning-core.server");
    const r = await provisionRegistrationCore(data.registrationId);
    return {
      tenantId: r.tenantId,
      workspaceId: r.workspaceId,
      email: r.email,
      password: r.password,
      invoiceNumber: r.invoiceNumber,
      trialEndsAt: r.trialEndsAt,
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
