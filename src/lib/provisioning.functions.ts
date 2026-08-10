import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TRIAL_DAYS = 30;

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const provisionRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { registrationId: string }) => {
    if (!data?.registrationId) throw new Error("Registration is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { seedWorkspaceDefaults, randomPassword } = await import("@/lib/provisioning.server");
    const { hashPassword } = await import("@/lib/auth-jwt.server");


    const { data: reg, error: regErr } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .eq("id", data.registrationId)
      .maybeSingle();
    if (regErr) throw new Error(regErr.message);
    if (!reg) throw new Error("Registration not found");
    if (reg.status === "provisioned" && reg.tenant_id) throw new Error("This registration is already provisioned");

    const email = reg.email.trim().toLowerCase();
    const subdomain = reg.subdomain.trim().toLowerCase();

    const { data: dupe } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();
    if (dupe) throw new Error(`Subdomain "${subdomain}" is already used by another tenant`);

    // 1. Account for the PIC
    let ownerId: string | null = null;
    let generatedPassword: string | null = randomPassword();
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { full_name: reg.contact_name, phone: reg.phone, company_name: reg.company_name },
    });
    if (created.error) {
      generatedPassword = null;
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (!existing) throw new Error(created.error.message);
      ownerId = existing.id;
    } else {
      ownerId = created.data.user?.id ?? null;
    }
    if (!ownerId) throw new Error("Could not create the owner account");

    await supabaseAdmin.from("profiles").upsert({
      id: ownerId,
      email,
      full_name: reg.contact_name,
      phone: reg.phone,
      company_name: reg.company_name,
    });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: ownerId, role: "customer" }, { onConflict: "user_id,role" });

    // Keep the local JWT user table in sync so the owner can sign in at /auth
    // with the generated password (and legacy backfill still works as fallback).
    if (generatedPassword) {
      const { error: appUserErr } = await supabaseAdmin.from("app_users").upsert(
        {
          id: ownerId,
          email,
          full_name: reg.contact_name,
          password_hash: await hashPassword(generatedPassword),
          auth_user_id: ownerId,
          is_active: true,
        },
        { onConflict: "id" },
      );
      if (appUserErr) throw new Error(appUserErr.message);
    }


    // 2. Package + tenant
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("id,code,name,monthly_price")
      .eq("code", reg.package_code)
      .maybeSingle();

    const trialEnds = addDays(TRIAL_DAYS);
    const today = new Date().toISOString().slice(0, 10);

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: reg.company_name,
        subdomain,
        owner_id: ownerId,
        package_id: pkg?.id ?? null,
        status: "trial",
        industry: reg.industry,
        city: reg.city,
        pic_name: reg.contact_name,
        pic_email: email,
        pic_phone: reg.phone,
        user_count: 1,
        workspace_count: 1,
        started_at: today,
        trial_ends_at: trialEnds,
        notes: reg.notes,
      })
      .select("id")
      .single();
    if (tenantErr) throw new Error(tenantErr.message);

    // 3. Subscription
    const monthly = Number(pkg?.monthly_price ?? 0);
    const yearly = reg.billing_cycle === "yearly";
    const unitPrice = yearly ? monthly * 12 : monthly;
    const periodEnd = yearly ? addDays(365) : addDays(30);

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        tenant_id: tenant.id,
        package_id: pkg?.id ?? null,
        status: "trialing",
        billing_cycle: reg.billing_cycle,
        seats: 1,
        unit_price: unitPrice,
        current_period_start: today,
        current_period_end: periodEnd,
        auto_renew: true,
      })
      .select("id")
      .single();
    if (subErr) throw new Error(subErr.message);

    // 4. Workspace + membership + master data
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .insert({
        tenant_id: tenant.id,
        name: reg.company_name,
        legal_name: reg.company_name,
        slug: subdomain,
        currency: "IDR",
        timezone: "Asia/Jakarta",
        fiscal_year_start_month: 1,
        default_costing_method: "AVERAGE",
        status: "active",
        created_by: ownerId,
      })
      .select("id")
      .single();
    if (wsErr) throw new Error(wsErr.message);

    const { error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .upsert({ workspace_id: ws.id, user_id: ownerId, role: "owner" }, { onConflict: "workspace_id,user_id" });
    if (memberErr) throw new Error(memberErr.message);

    await seedWorkspaceDefaults(supabaseAdmin as any, ws.id);

    // 5. First invoice, due when the trial ends
    const stamp = new Date();
    const invoiceNumber = `INV/${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}/${subdomain
      .slice(0, 6)
      .toUpperCase()}-${String(stamp.getTime()).slice(-4)}`;
    await supabaseAdmin.from("invoices").insert({
      invoice_number: invoiceNumber,
      tenant_id: tenant.id,
      subscription_id: sub.id,
      status: "draft",
      issue_date: today,
      due_date: trialEnds,
      subtotal: unitPrice,
      tax_amount: 0,
      total: unitPrice,
      auto_reminder: true,
      notes: `First subscription invoice for ${pkg?.name ?? reg.package_code}`,
    });

    // 6. Close the registration
    const { error: regUpdErr } = await supabaseAdmin
      .from("registrations")
      .update({ status: "provisioned", tenant_id: tenant.id })
      .eq("id", reg.id);
    if (regUpdErr) throw new Error(regUpdErr.message);

    return {
      tenantId: tenant.id,
      workspaceId: ws.id,
      email,
      password: generatedPassword,
      invoiceNumber,
      trialEndsAt: trialEnds,
    };
  });

export const resetRegistrationOwnerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string }) => {
    if (!data?.email?.includes("@")) throw new Error("Valid email is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomPassword } = await import("@/lib/provisioning.server");

    const email = data.email.trim().toLowerCase();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (!profile) throw new Error("No account with that email");

    const password = randomPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
    if (error) throw new Error(error.message);
    return { email, password };
  });

/** Seed a freshly created workspace with default Indonesian master data. */
export const seedWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: allowed, error: permErr } = await ctx.supabase.rpc("can_write_workspace", {
      _workspace_id: data.workspaceId,
      _user_id: ctx.userId,
    });
    if (permErr) throw new Error(permErr.message);
    if (!allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { seedWorkspaceDefaults } = await import("@/lib/provisioning.server");
    await seedWorkspaceDefaults(supabaseAdmin as any, data.workspaceId);
    return { ok: true };
  });
