import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie, getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const registerAppUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const { assertPublicSignupAllowed } = await import("@/lib/instance.server");
    assertPublicSignupAllowed();
    const { hashPassword, findAppUserByEmail } = await import("@/lib/auth-jwt.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");

    const email = data.email.trim().toLowerCase();
    if (await findAppUserByEmail(email)) {
      throw new Error("Email is already registered");
    }

    await execute(
      "INSERT INTO app_users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)",
      [uuid(), email, data.fullName ?? null, await hashPassword(data.password)],
    );

    return { ok: true as const, email };
  });

export const loginAppUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsSchema.omit({ fullName: true }).parse(input))
  .handler(async ({ data }) => {
    const { findAppUserByEmail, verifyPassword, signAppJwt, APP_JWT_COOKIE } = await import(
      "@/lib/auth-jwt.server"
    );
    const { execute } = await import("@/integrations/mysql/pool");

    const email = data.email.trim().toLowerCase();
    const user = await findAppUserByEmail(email);
    // Same generic message for unknown email and wrong password.
    const invalid = new Error("Invalid email or password");

    if (!user || !user.is_active || !user.password_hash) throw invalid;
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
      // Over http://localhost a `secure` cookie is never stored/sent — only
      // enable it behind TLS (production).
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await execute("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [user.id]);

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

export const getIsAdmin = createServerFn({ method: "GET" })
  .validator((input: unknown) => String(input))
  .handler(async ({ data }) => {
    const { hasRole, claimSuperadminIfAllowed } = await import("@/lib/auth-context.server");
    if (await hasRole(data, "admin")) return true;
    const { findAppUserById } = await import("@/lib/auth-jwt.server");
    const user = await findAppUserById(data);
    if (!user?.email) return false;
    return claimSuperadminIfAllowed(data, user.email);
  });