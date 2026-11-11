/**
 * Perlindungan form publik dari spam & bot, berlapis:
 *  1. Token bertanda tangan (HMAC) dari server saat halaman dibuka: wajib ada, umur ≥ 3 detik
 *     (bot mengisi instan) dan ≤ 2 jam, sekali pakai (nonce unik di DB).
 *  2. Honeypot: kolom tersembunyi yang hanya diisi bot → diam-diam dibuang (bot mengira berhasil).
 *  3. Batas kiriman per IP (5/jam) dan per email (3/hari).
 *  4. Cek isi: tautan berlebihan / tautan di nama ditolak.
 *  5. Opsional Cloudflare Turnstile: aktif bila TURNSTILE_SITE_KEY & TURNSTILE_SECRET_KEY diisi.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execute, executeOne } from "@/integrations/mysql/pool";

const MIN_AGE_MS = 3_000;
const MAX_AGE_MS = 2 * 3600_000;
const PER_IP_HOUR = 5;
const PER_EMAIL_DAY = 3;

export class FormRejected extends Error {}

function secret() {
  const s = process.env.APP_JWT_SECRET;
  if (!s) throw new Error("APP_JWT_SECRET is not configured");
  return s;
}
const sign = (form: string, ts: number, nonce: string) =>
  createHmac("sha256", secret()).update(`form:${form}.${ts}.${nonce}`).digest("hex");

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
    ? process.env.TURNSTILE_SITE_KEY
    : null;
}

export function issueFormToken(form: string) {
  const ts = Date.now();
  const nonce = randomBytes(16).toString("hex");
  return { token: `${ts}.${nonce}.${sign(form, ts, nonce)}`, turnstileSiteKey: turnstileSiteKey() };
}

/** IP klien di balik proxy (Cloudflare / nginx). */
export function clientIp(req: Request | undefined): string {
  const h = req?.headers;
  const ip =
    h?.get("cf-connecting-ip") ||
    h?.get("x-real-ip") ||
    h?.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  return ip.trim().slice(0, 64);
}

function parseToken(form: string, token: string) {
  const [tsRaw, nonce, sig] = String(token ?? "").split(".");
  const ts = Number(tsRaw);
  if (
    !Number.isFinite(ts) ||
    !/^[0-9a-f]{32}$/.test(nonce ?? "") ||
    !/^[0-9a-f]{64}$/.test(sig ?? "")
  )
    return null;
  const want = Buffer.from(sign(form, ts, nonce), "hex");
  const got = Buffer.from(sig, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { ts, nonce };
}

async function verifyTurnstile(response: string | undefined, ip: string) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey || !process.env.TURNSTILE_SITE_KEY) return;
  if (!response) throw new FormRejected("Selesaikan verifikasi keamanan terlebih dahulu.");
  const body = new URLSearchParams({ secret: secretKey, response });
  if (ip !== "unknown") body.set("remoteip", ip);
  let ok = false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    ok = Boolean(((await r.json()) as { success?: boolean }).success);
  } catch {
    throw new FormRejected("Verifikasi keamanan tidak dapat dihubungi. Coba lagi sebentar.");
  }
  if (!ok) throw new FormRejected("Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.");
}

const HAS_LINK = /(https?:\/\/|www\.)\S+/i;
const countLinks = (t: string) => t.match(/(https?:\/\/|www\.)\S+/gi)?.length ?? 0;

export interface GuardInput {
  form: string;
  token: string | undefined;
  honeypot: string | undefined;
  turnstile?: string;
  email: string;
  ip: string;
  /** Kolom isian bebas yang dicek tautannya. */
  names: (string | null | undefined)[];
  message?: string | null;
}

/**
 * Kembalikan `"drop"` bila kiriman harus dibuang diam-diam (bot), `"ok"` bila boleh disimpan.
 * Melempar `FormRejected` (pesan untuk pengguna) bila ditolak.
 */
export async function checkFormSubmission(g: GuardInput): Promise<"ok" | "drop"> {
  if (g.honeypot && g.honeypot.trim()) return "drop";
  const t = parseToken(g.form, g.token ?? "");
  if (!t) throw new FormRejected("Sesi form tidak valid. Muat ulang halaman lalu coba lagi.");
  const age = Date.now() - t.ts;
  if (age < MIN_AGE_MS) return "drop";
  if (age > MAX_AGE_MS)
    throw new FormRejected("Form sudah terlalu lama dibuka. Muat ulang halaman lalu coba lagi.");

  if (g.names.some((n) => n && HAS_LINK.test(n))) return "drop";
  if (countLinks(g.message ?? "") > 2)
    throw new FormRejected("Pesan berisi terlalu banyak tautan.");

  const ipHash = createHash("sha256").update(`${secret()}:${g.ip}`).digest("hex");
  const email = g.email.toLowerCase();
  const byIp = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM public_form_submissions
      WHERE form = ? AND ip_hash = ? AND created_at >= NOW(6) - INTERVAL 1 HOUR`,
    [g.form, ipHash],
  );
  if (Number(byIp?.n ?? 0) >= PER_IP_HOUR)
    throw new FormRejected("Terlalu banyak kiriman dari jaringan ini. Coba lagi dalam 1 jam.");
  const byEmail = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM public_form_submissions
      WHERE form = ? AND email = ? AND created_at >= NOW(6) - INTERVAL 1 DAY`,
    [g.form, email],
  );
  if (Number(byEmail?.n ?? 0) >= PER_EMAIL_DAY)
    throw new FormRejected(
      "Kami sudah menerima permintaan dari email ini hari ini. Tim kami akan segera menghubungi Anda.",
    );

  await verifyTurnstile(g.turnstile, g.ip);

  // Klaim token (sekali pakai). Duplikat = token dipakai ulang.
  try {
    await execute(
      "INSERT INTO public_form_submissions (nonce, form, ip_hash, email) VALUES (?, ?, ?, ?)",
      [t.nonce, g.form, ipHash, email],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY")
      throw new FormRejected("Form ini sudah terkirim. Muat ulang halaman untuk mengirim lagi.");
    throw e;
  }
  if (Math.random() < 0.05)
    await execute(
      "DELETE FROM public_form_submissions WHERE created_at < NOW(6) - INTERVAL 2 DAY",
    ).catch(() => undefined);
  return "ok";
}
