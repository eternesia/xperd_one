/**
 * URL publik bertanda tangan untuk media pustaka Qalling.
 * Jaringan sosial (Tebar/Meta) mengambil media lewat URL, sedangkan berkas Old privat
 * (rute `/api/workspace-files` butuh cookie). Padanan "signed URL 7 hari" di BS New 11:
 * HMAC-SHA256(APP_JWT_SECRET, `${path}.${exp}`), kedaluwarsa, dan path harus ada di `crm_media`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.APP_JWT_SECRET;
  if (!s) throw new Error("APP_JWT_SECRET is not configured");
  return s;
}
const mac = (path: string, exp: number) =>
  createHmac("sha256", secret()).update(`${path}.${exp}`).digest("hex");

export function signMediaUrl(origin: string, path: string, ttlSeconds = 7 * 86_400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const q = new URLSearchParams({ path, exp: String(exp), sig: mac(path, exp) });
  return `${origin.replace(/\/$/, "")}/api/public/crm-media?${q}`;
}

export function verifyMediaSignature(
  path: string,
  exp: string | null,
  sig: string | null,
): boolean {
  const e = Number(exp);
  if (!path || !sig || !Number.isFinite(e) || e < Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(sig))
    return false;
  return timingSafeEqual(Buffer.from(mac(path, e), "hex"), Buffer.from(sig, "hex"));
}

/** Basis URL publik aplikasi (untuk URL yang dibaca layanan eksternal). */
export function publicOrigin(requestUrl?: string): string {
  const fixed = process.env.APP_PUBLIC_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  throw new Error("APP_PUBLIC_URL is not configured");
}
