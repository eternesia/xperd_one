/**
 * Provisioning inti (BS New 11 `provisioning-core.server.ts`): pendaftaran → akun pemilik, tenant (trial),
 * langganan, workspace + master data, dan invoice pertama / add-on Qalling trial. Dipakai provisioning admin,
 * pendaftaran mandiri (OTP) dan pendaftaran Qalling tanpa kata sandi.
 */
import { executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import { hashPassword } from "@/lib/auth-jwt.server";
import { randomPassword, seedWorkspaceDefaults } from "@/lib/provisioning.server";

const DEFAULT_TRIAL_DAYS = 14;
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

import { registrationSource, type TenantSource } from "./tenant-source";

export interface ProvisionOptions {
  /** Situs pendaftaran asal (qalling|xperd|admin); bila kosong diturunkan dari catatan pendaftaran. */
  signupSource?: TenantSource;
  /** Pengguna yang sudah ada (mis. login Google) — tidak membuat akun baru. */
  ownerId?: string;
  /** Pendaftaran khusus Qalling: beri tier ini sebagai add-on trial dan lewati invoice ERP. */
  qallingTierCode?: string;
}

export async function loadTrialDays(): Promise<number> {
  const r = await executeOne<{ trial_days: number }>(
    "SELECT trial_days FROM platform_auth_settings WHERE singleton = 1",
  );
  const n = Number(r?.trial_days);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TRIAL_DAYS;
}

interface Reg {
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

export async function provisionRegistrationCore(
  registrationId: string,
  chosenPassword?: string,
  opts: ProvisionOptions = {},
) {
  const TRIAL_DAYS = await loadTrialDays();
  const reg = await executeOne<Reg>("SELECT * FROM registrations WHERE id = ? LIMIT 1", [
    registrationId,
  ]);
  if (!reg) throw new Error("Registration not found");
  if (reg.status === "provisioned" && reg.tenant_id)
    throw new Error("This registration is already provisioned");

  const email = reg.email.trim().toLowerCase();
  const subdomain = reg.subdomain.trim().toLowerCase();
  if (await executeOne("SELECT id FROM tenants WHERE subdomain = ? LIMIT 1", [subdomain]))
    throw new Error(`Subdomain "${subdomain}" is already used by another tenant`);

  const pkg = await executeOne<{
    id: string;
    code: string;
    name: string | null;
    monthly_price: number | null;
  }>("SELECT id, code, name, monthly_price FROM packages WHERE code = ? LIMIT 1", [
    reg.package_code,
  ]);
  const existing = opts.ownerId
    ? null
    : await executeOne<{ id: string }>("SELECT id FROM app_users WHERE email = ? LIMIT 1", [email]);
  const ownerId = opts.ownerId ?? existing?.id ?? uuid();
  const generatedPassword = opts.ownerId || existing ? null : (chosenPassword ?? randomPassword());
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
    if (generatedPassword) {
      await conn.execute(
        "INSERT INTO app_users (id, email, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)",
        [ownerId, email, reg.contact_name, await hashPassword(generatedPassword)],
      );
    }
    await conn.execute(
      `INSERT INTO profiles (id, email, full_name, company_name, phone) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), full_name = VALUES(full_name), company_name = VALUES(company_name), phone = VALUES(phone)`,
      [ownerId, email, reg.contact_name, reg.company_name, reg.phone],
    );
    await conn.execute(
      "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer') ON DUPLICATE KEY UPDATE role = VALUES(role)",
      [uuid(), ownerId],
    );
    await conn.execute(
      `INSERT INTO tenants
         (id, name, subdomain, owner_id, package_id, status, industry, city, pic_name, pic_email, pic_phone, user_count, workspace_count, started_at, trial_ends_at, notes, signup_source)
       VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
      [
        tenantId,
        reg.company_name,
        subdomain,
        ownerId,
        pkg?.id ?? null,
        reg.industry,
        reg.city,
        reg.contact_name,
        email,
        reg.phone,
        today,
        trialEnds,
        reg.notes,
        registrationSource(opts.signupSource, reg.notes),
      ],
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
    if (opts.qallingTierCode) {
      const [rows] = await conn.execute(
        "SELECT id, addon_id, monthly_price FROM addon_tiers WHERE code = ? AND is_active = 1",
        [opts.qallingTierCode],
      );
      const tier = (rows as { id: string; addon_id: string; monthly_price: number }[])[0];
      if (!tier) throw new Error("Paket Qalling tidak ditemukan");
      await conn.execute(
        `INSERT INTO tenant_addons (id, tenant_id, addon_id, tier_id, status, starts_at, ends_at, monthly_price, notes)
         VALUES (?, ?, ?, ?, 'trial', ?, ?, ?, ?)`,
        [
          uuid(),
          tenantId,
          tier.addon_id,
          tier.id,
          today,
          trialEnds,
          Number(tier.monthly_price),
          `Trial ${TRIAL_DAYS} hari dari pendaftaran`,
        ],
      );
    } else {
      await conn.execute(
        `INSERT INTO invoices
           (id, invoice_number, tenant_id, subscription_id, status, issue_date, due_date, subtotal, tax_amount, total, auto_reminder, notes)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, 1, ?)`,
        [
          uuid(),
          invoiceNumber,
          tenantId,
          subId,
          today,
          trialEnds,
          unitPrice,
          unitPrice,
          `First subscription invoice for ${pkg?.name ?? reg.package_code}`,
        ],
      );
    }
    await conn.execute(
      "UPDATE registrations SET status = 'provisioned', tenant_id = ? WHERE id = ?",
      [tenantId, reg.id],
    );
  });

  await seedWorkspaceDefaults(wsId);
  return {
    tenantId,
    workspaceId: wsId,
    ownerId,
    email,
    password: generatedPassword,
    invoiceNumber,
    trialEndsAt: trialEnds,
  };
}
