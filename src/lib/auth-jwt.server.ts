import { SignJWT, jwtVerify } from "jose";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const APP_JWT_COOKIE = "xperd_token";
const ITERATIONS = 100_000;

function secretKey() {
  const secret = process.env["APP_JWT_SECRET"];
  if (!secret) throw new Error("APP_JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256,
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer as ArrayBuffer)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !saltHex || !hashHex) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromHex(saltHex) as BufferSource,
      iterations: Number(iterations) || ITERATIONS,
    },
    key,
    256,
  );
  const a = new Uint8Array(bits);
  const b = fromHex(hashHex);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export interface AppJwtClaims {
  sub: string;
  email: string;
  name?: string | null;
  auth_user_id?: string | null;
}

export async function signAppJwt(claims: AppJwtClaims, maxAgeSeconds = 60 * 60 * 24 * 7) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("xperd-one")
    .setAudience("xperd-app")
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyAppJwt(token: string): Promise<AppJwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "xperd-one",
      audience: "xperd-app",
    });
    return payload as unknown as AppJwtClaims;
  } catch {
    return null;
  }
}

export interface AppUserRow {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  auth_user_id: string | null;
}

export async function findAppUserByEmail(email: string) {
  const { data } = await supabaseAdmin
    .from("app_users")
    .select("id, email, full_name, is_active, auth_user_id, password_hash")
    .ilike("email", email.trim())
    .maybeSingle();
  return data ?? null;
}