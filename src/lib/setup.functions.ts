// Self-service setup server functions (MySQL-backed): public signup, onboarding
// (organisation + workspace creation), and registration submission.
// NOTE: server-only — import server modules via dynamic `await import()`.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const organisationSchema = z.object({
  name: z.string().trim().min(2).max(150),
  subdomain: z.string().trim().min(3).max(30),
  industry: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  packageCode: z.string().min(1),
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  legalName: z.string().trim().max(255).optional(),
  currency: z.string().max(10).default("IDR"),
  timezone: z.string().max(50).default("Asia/Jakarta"),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  costing: z.enum(["FIFO", "LIFO", "AVERAGE"]).default("AVERAGE"),
});

const registrationSchema = z.object({
  company_name: z.string().trim().min(2).max(150),
  contact_name: z.string().trim().min(2).max(100),
  email: z.string().email().max(255),
  phone: z.string().trim().min(6).max(30),
  subdomain: z.string().trim().min(3).max(30),
  city: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  package_code: z.enum(["one-starter", "one-professional"]),
  billing_cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "ws"
  );
}

export const getPublicSignupPackages = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  return execute(
    "SELECT id, code, name, tagline, monthly_price, features, max_workspace, max_users FROM packages WHERE is_public_signup = 1 AND is_active = 1 ORDER BY sort_order ASC",
  );
});

export const createOrganisation = createServerFn({ method: "POST" })
  .validator((input: unknown) => organisationSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const user = await requireUser();
    const { assertPublicSignupAllowed } = await import("@/lib/instance.server");
    assertPublicSignupAllowed();

    const slug = data.subdomain.trim().toLowerCase();
    const dupe = await executeOne<{ id: string }>(
      "SELECT id FROM tenants WHERE subdomain = ? LIMIT 1",
      [slug],
    );
    if (dupe) throw new Error("That subdomain is already taken. Please choose another one.");

    const pkg = await executeOne<{ id: string }>("SELECT id FROM packages WHERE code = ? LIMIT 1", [
      data.packageCode,
    ]);
    const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    await execute(
      `INSERT INTO tenants
         (id, name, subdomain, owner_id, package_id, status, industry, city, user_count, workspace_count, trial_ends_at, signup_source)
       VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, 1, 0, ?, 'admin')`,
      [
        uuid(),
        data.name,
        slug,
        user.id,
        pkg?.id ?? null,
        data.industry ?? null,
        data.city ?? null,
        trialEnds,
      ],
    );

    return { ok: true as const };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .validator((input: unknown) => workspaceSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth-context.server");
    const { execute, executeOne, transaction, uuid } = await import("@/integrations/mysql/pool");
    const { seedWorkspaceDefaults } = await import("@/lib/provisioning.server");
    const user = await requireUser();

    const tenant = await executeOne<{ id: string; package_id: string | null }>(
      "SELECT id, package_id FROM tenants WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1",
      [user.id],
    );
    if (!tenant) throw new Error("No organisation found. Create your organisation first.");

    // Enforce package workspace quota.
    const pkg = tenant.package_id
      ? await executeOne<{ max_workspace: number | null }>(
          "SELECT max_workspace FROM packages WHERE id = ? LIMIT 1",
          [tenant.package_id],
        )
      : null;
    if (pkg?.max_workspace != null) {
      const used = await executeOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM workspaces WHERE tenant_id = ?",
        [tenant.id],
      );
      if (Number(used?.c ?? 0) >= pkg.max_workspace) {
        throw new Error(`Workspace quota reached for this package (max ${pkg.max_workspace}).`);
      }
    }

    const wsId = uuid();
    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO workspaces
           (id, tenant_id, name, legal_name, slug, currency, timezone, fiscal_year_start_month, default_costing_method, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          wsId,
          tenant.id,
          data.name,
          data.legalName ?? null,
          slugify(data.name),
          data.currency,
          data.timezone,
          data.fiscalYearStartMonth,
          data.costing,
          user.id,
        ],
      );
      await conn.execute(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, 'owner')",
        [uuid(), wsId, user.id],
      );
      await conn.execute("UPDATE tenants SET workspace_count = workspace_count + 1 WHERE id = ?", [
        tenant.id,
      ]);
    });

    await seedWorkspaceDefaults(wsId);
    return { workspaceId: wsId };
  });

export const submitRegistration = createServerFn({ method: "POST" })
  .validator((input: unknown) => registrationSchema.parse(input))
  .handler(async ({ data }) => {
    const { assertPublicSignupAllowed } = await import("@/lib/instance.server");
    assertPublicSignupAllowed();
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");

    const email = data.email.trim().toLowerCase();
    const subdomain = data.subdomain.trim().toLowerCase();
    const dupe = await executeOne<{ id: string }>(
      "SELECT id FROM registrations WHERE subdomain = ? LIMIT 1",
      [subdomain],
    );
    if (dupe) throw new Error("duplicate");

    await execute(
      `INSERT INTO registrations
         (id, company_name, subdomain, contact_name, email, phone, city, industry, package_code, billing_cycle, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        uuid(),
        data.company_name,
        subdomain,
        data.contact_name,
        email,
        data.phone,
        data.city ?? null,
        data.industry ?? null,
        data.package_code,
        data.billing_cycle,
        data.notes ?? null,
      ],
    );
    return { ok: true as const };
  });

export const getPublicPackages = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  return execute(
    "SELECT code, name, tagline, monthly_price, description, is_public_signup, features FROM packages WHERE is_active = 1 ORDER BY sort_order ASC",
  );
});

/** Token form kontak (dibuat saat halaman dibuka) + site key Turnstile bila aktif. */
export const getContactFormGuard = createServerFn({ method: "POST" }).handler(async () => {
  const { issueFormToken } = await import("@/lib/form-guard.server");
  return issueFormToken("contact");
});

export const submitLead = createServerFn({ method: "POST" })
  .validator(
    (input: unknown) =>
      input as {
        company_name: string;
        contact_name: string;
        job_title?: string;
        email: string;
        phone?: string;
        industry?: string;
        employee_range?: string;
        message?: string;
        interested_product?: string;
        guard?: { token?: string; website?: string; turnstile?: string };
      },
  )
  .handler(async ({ data: raw }) => {
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    // Validasi server (form publik): wajib & batas panjang sesuai kolom.
    const clip = (v: unknown, n: number) => {
      const t = String(v ?? "").trim();
      return t ? t.slice(0, n) : null;
    };
    const data = {
      company_name: clip(raw.company_name, 255),
      contact_name: clip(raw.contact_name, 255),
      job_title: clip(raw.job_title, 255),
      email: clip(raw.email, 255),
      phone: clip(raw.phone, 50),
      industry: clip(raw.industry, 100),
      employee_range: clip(raw.employee_range, 50),
      message: clip(raw.message, 5000),
      interested_product: raw.interested_product === "enterprise" ? "enterprise" : "business",
    };
    if (
      !data.company_name ||
      !data.contact_name ||
      !data.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    )
      throw new Error("Data tidak lengkap.");
    // Anti-spam: token sekali pakai, honeypot, batas per IP/email, cek tautan, Turnstile (bila aktif).
    const { checkFormSubmission, clientIp, FormRejected } = await import("@/lib/form-guard.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    let verdict: "ok" | "drop";
    try {
      verdict = await checkFormSubmission({
        form: "contact",
        token: raw.guard?.token,
        honeypot: raw.guard?.website,
        turnstile: raw.guard?.turnstile,
        email: data.email,
        ip: clientIp(getRequest()),
        names: [data.company_name, data.contact_name, data.job_title],
        message: data.message,
      });
    } catch (e) {
      if (e instanceof FormRejected) return { ok: false as const, error: e.message };
      throw e;
    }
    if (verdict === "drop") return { ok: true as const };
    const leadId = uuid();
    await execute(
      `INSERT INTO leads
         (id, company_name, contact_name, job_title, email, phone, industry, employee_range, message, interested_product, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website')`,
      [
        leadId,
        data.company_name,
        data.contact_name,
        data.job_title ?? null,
        data.email,
        data.phone ?? null,
        data.industry ?? null,
        data.employee_range ?? null,
        data.message ?? null,
        data.interested_product,
      ],
    );
    // Beri tahu superadmin lewat email (bila gateway platform aktif). Gagal kirim tidak menggagalkan form.
    try {
      const { loadGateway, PLATFORM_SCOPE } = await import("@/lib/email-gateway.server");
      const g = await loadGateway(PLATFORM_SCOPE);
      if (g?.enabled) {
        const { deliver } = await import("@/lib/billing-notifications.server");
        const { newLeadAdminEmail } = await import("@/lib/billing-email-templates");
        const admins = await execute<{ email: string }>(
          `SELECT DISTINCT u.email FROM user_roles r JOIN app_users u ON u.id = r.user_id
            WHERE r.role = 'admin' AND u.is_active = 1 LIMIT 10`,
        );
        const origin = (process.env.XPERD_PUBLIC_URL || "https://xperd.id").replace(/\/$/, "");
        for (const a of admins) {
          await deliver(g, {
            tenantId: null,
            kind: "admin_new_lead",
            dedupe: `lead:${leadId}:${a.email}`,
            to: a.email,
            mail: newLeadAdminEmail({
              company: data.company_name,
              contact: data.contact_name,
              email: data.email,
              phone: data.phone,
              product: data.interested_product === "enterprise" ? "Enterprise" : "Business",
              industry: data.industry,
              employees: data.employee_range,
              message: data.message,
              url: `${origin}/app-admin/leads`,
            }),
          });
        }
      }
    } catch (e) {
      console.error("[leads] admin notification failed", e);
    }
    return { ok: true as const };
  });
