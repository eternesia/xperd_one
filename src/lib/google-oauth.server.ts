/** Login Google (OAuth 2.0 authorization code) untuk Qalling. Kunci dari `platform_auth_settings`, bukan env. */
import { executeOne } from "@/integrations/mysql/pool";

export const GOOGLE_START_PATH = "/api/public/auth/google/start";
export const GOOGLE_CALLBACK_PATH = "/api/public/auth/google/callback";
export const GOOGLE_STATE_COOKIE = "xperd_g_state";

/**
 * Endpoint Google; `GOOGLE_OAUTH_BASE` menimpa ketiganya untuk server tiruan saat uji. `GOOGLE_OAUTH_AUTH_BASE` (opsional)
 * menimpa alamat layar persetujuan saja — yang dibuka browser — bila berbeda dari alamat server-ke-server.
 */
export function googleUrls() {
  const base = process.env.GOOGLE_OAUTH_BASE?.replace(/\/$/, "");
  const authBase = process.env.GOOGLE_OAUTH_AUTH_BASE?.replace(/\/$/, "") ?? base;
  return base
    ? { auth: `${authBase}/o/oauth2/v2/auth`, token: `${base}/token`, userinfo: `${base}/userinfo` }
    : {
        auth: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
      };
}

export async function loadGoogleConfig() {
  const r = await executeOne<{
    google_enabled: number;
    google_client_id: string;
    google_client_secret: string;
  }>(
    "SELECT google_enabled, google_client_id, google_client_secret FROM platform_auth_settings WHERE singleton = 1",
  );
  return {
    enabled: r ? Boolean(r.google_enabled) : false,
    // Nilai dari UI (DB) diutamakan; env `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` jadi cadangan.
    clientId: r?.google_client_id || process.env.GOOGLE_CLIENT_ID || "",
    secret: r?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || "",
    secretFromEnv: !r?.google_client_secret && Boolean(process.env.GOOGLE_CLIENT_SECRET),
  };
}

export const googleRedirectUri = (origin: string) =>
  `${origin.replace(/\/$/, "")}${GOOGLE_CALLBACK_PATH}`;

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const cookieAttrs = (maxAge: number) =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
