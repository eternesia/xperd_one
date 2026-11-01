/**
 * Callback login Google: cocokkan `state`, tukar `code` → token, ambil profil (email harus terverifikasi), lalu buat/temukan
 * akun dan terbitkan cookie sesi. Pengguna baru lewat `assertRegistrationEmail` (email sekali pakai ditolak). Tenant trial
 * dibuat setelahnya oleh `provisionGoogleSignup` (halaman login/aplikasi), sama seperti New 13.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/google-oauth.server");
        const url = new URL(request.url);
        const headers = new Headers();
        headers.append("Set-Cookie", `${g.GOOGLE_STATE_COOKIE}=; ${g.cookieAttrs(0)}`);
        const fail = (code: string) => {
          headers.set("Location", `/qalling/login?google_error=${code}`);
          return new Response(null, { status: 302, headers });
        };
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error")) return fail("denied");
        if (
          !state ||
          !code ||
          state !== g.readCookie(request.headers.get("cookie"), g.GOOGLE_STATE_COOKIE)
        )
          return fail("state");
        const cfg = await g.loadGoogleConfig();
        if (!cfg.enabled || !cfg.clientId || !cfg.secret) return fail("not_configured");
        const { publicOrigin } = await import("@/lib/crm-media.server");
        const urls = g.googleUrls();
        let email = "";
        let name = "";
        try {
          const tokenRes = await fetch(urls.token, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: cfg.clientId,
              client_secret: cfg.secret,
              redirect_uri: g.googleRedirectUri(publicOrigin(request.url)),
              grant_type: "authorization_code",
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!tokenRes.ok) return fail("exchange");
          const { access_token } = (await tokenRes.json()) as { access_token?: string };
          if (!access_token) return fail("exchange");
          const infoRes = await fetch(urls.userinfo, {
            headers: { Authorization: `Bearer ${access_token}` },
            signal: AbortSignal.timeout(15000),
          });
          if (!infoRes.ok) return fail("exchange");
          const info = (await infoRes.json()) as {
            email?: string;
            email_verified?: boolean | string;
            name?: string;
          };
          if (!info.email || !(info.email_verified === true || info.email_verified === "true"))
            return fail("unverified");
          email = info.email;
          name = info.name ?? "";
        } catch {
          return fail("exchange");
        }

        const { normalizeEmail } = await import("@/lib/qalling-signup-rules");
        email = normalizeEmail(email);
        const { execute, uuid } = await import("@/integrations/mysql/pool");
        const { findAppUserByEmail, hashPassword, signAppJwt, APP_JWT_COOKIE } =
          await import("@/lib/auth-jwt.server");
        let user = await findAppUserByEmail(email);
        if (!user) {
          try {
            const { assertRegistrationEmail } = await import("@/lib/disposable-email.server");
            assertRegistrationEmail(email);
          } catch {
            return fail("disposable");
          }
          const id = uuid();
          const fullName = (name || email.split("@")[0]).slice(0, 120);
          // Akun tanpa kata sandi (masuk lewat Google / kode email): hash dari nilai acak yang tak diketahui siapa pun.
          await execute(
            "INSERT INTO app_users (id, email, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)",
            [id, email, fullName, await hashPassword(uuid() + uuid())],
          );
          await execute(
            "INSERT INTO profiles (id, email, full_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)",
            [id, email, fullName],
          );
          await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer')", [
            uuid(),
            id,
          ]);
          user = await findAppUserByEmail(email);
        }
        if (!user || !user.is_active) return fail("inactive");
        const token = await signAppJwt({
          sub: user.id,
          email: user.email,
          name: user.full_name,
          auth_user_id: user.auth_user_id,
        });
        headers.append(
          "Set-Cookie",
          `${APP_JWT_COOKIE}=${token}; ${g.cookieAttrs(60 * 60 * 24 * 7)}`,
        );
        await execute("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [
          user.id,
        ]);
        headers.set("Location", "/qalling/login");
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
