/** Signup defaults to Lite; explicit selections are preserved. */
export const QALLING_SIGNUP_TIERS = ["qalling_lite", "qalling_pro", "qalling_agency"] as const;
export type QallingSignupTier = (typeof QALLING_SIGNUP_TIERS)[number];

export function resolveSignupTier(v?: string): QallingSignupTier {
  if (!v) return "qalling_lite";
  if (!isSignupTier(v)) throw new Error("Paket tidak valid");
  return v;
}

export function isSignupTier(v: unknown): v is QallingSignupTier {
  return typeof v === "string" && (QALLING_SIGNUP_TIERS as readonly string[]).includes(v);
}

export function normalizeEmail(v: string) {
  return (v ?? "").trim().toLowerCase();
}

export function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

/** Tenant subdomain derived from the email local part plus a random suffix. */
export function subdomainFromEmail(email: string, suffix: string) {
  const base =
    normalizeEmail(email)
      .split("@")[0]
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "qalling";
  return `${base.length < 3 ? `${base}-q` : base}-${suffix}`.slice(0, 40);
}

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
