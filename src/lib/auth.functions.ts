import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie, getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const registerAppUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const { hashPassword, findAppUserByEmail } = await import("@/lib/auth-jwt.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();
    if (await findAppUserByEmail(email)) {
      throw new Error("Email is already registered");
    }

    // Mirror identity into the platform auth store so existing row-level
    // security rules (which key off the platform user id) keep working.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? null },
    });
    if (createError && !/already/i.test(createError.message)) throw new Error(createError.message);

    let authUserId = created?.user?.id ?? null;
    if (!authUserId) {
      const { data: found } = await supabaseAdmin.rpc("find_user_id_by_email", { _email: email });
      authUserId = (found as string | null) ?? null;
    }

    const { error } = await supabaseAdmin.from("app_users").insert({
      email,
      full_name: data.fullName ?? null,
      password_hash: await hashPassword(data.password),
      auth_user_id: authUserId,
    });
    if (error) throw new Error(error.message);

    return { ok: true as const, email };
  });

export const loginAppUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentialsSchema.omit({ fullName: true }).parse(input))
  .handler(async ({ data }) => {
    const { findAppUserByEmail, verifyPassword, signAppJwt, APP_JWT_COOKIE } = await import(
      "@/lib/auth-jwt.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();
    let user = await findAppUserByEmail(email);
    // Same generic message for unknown email and wrong password.
    const invalid = new Error("Invalid email or password");

    // Backfill: accounts created before the app_users table existed are
    // migrated on their first successful sign-in.
    if (!user) {
      const { hashPassword } = await import("@/lib/auth-jwt.server");
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: legacy, error: legacyError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (legacyError || !legacy.user) throw invalid;
      await supabaseAdmin.from("app_users").insert({
        email,
        full_name: (legacy.user.user_metadata?.["full_name"] as string | null) ?? null,
        password_hash: await hashPassword(data.password),
        auth_user_id: legacy.user.id,
      });
      user = await findAppUserByEmail(email);
    }

    if (!user || !user.is_active) throw invalid;
    if (!(await verifyPassword(data.password, user.password_hash))) throw invalid;

    const token = await signAppJwt({
      sub: user.id,
      email: user.email,
      name: user.full_name,
      auth_user_id: user.auth_user_id,
    });

    setCookie(APP_JWT_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await supabaseAdmin
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return {
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
  });

export const currentAppUser = createServerFn({ method: "GET" }).handler(async () => {
  const { verifyAppJwt, APP_JWT_COOKIE } = await import("@/lib/auth-jwt.server");
  const token = getCookie(APP_JWT_COOKIE);
  if (!token) return null;
  const claims = await verifyAppJwt(token);
  if (!claims) return null;
  return { id: claims.sub, email: claims.email, fullName: claims.name ?? null };
});

export const logoutAppUser = createServerFn({ method: "POST" }).handler(async () => {
  const { APP_JWT_COOKIE } = await import("@/lib/auth-jwt.server");
  deleteCookie(APP_JWT_COOKIE, { path: "/" });
  return { ok: true as const };
});