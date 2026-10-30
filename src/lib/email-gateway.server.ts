/** Server-only email delivery through the configured gateway (platform or workspace scope). Salinan New 11, DB MySQL. */
import { executeOne } from "@/integrations/mysql/pool";
import { createHash, randomInt } from "node:crypto";

export type EmailProvider = "smtp" | "resend" | "brevo" | "sendgrid";

export interface GatewayRow {
  enabled: boolean;
  provider: EmailProvider;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_secure: string;
  secret: string | null;
}

export const PLATFORM_SCOPE = "platform";
export const workspaceScope = (id: string) => `ws:${id}`;

export async function loadGateway(scopeKey: string): Promise<GatewayRow | null> {
  const r = await executeOne<Omit<GatewayRow, "enabled"> & { enabled: number }>(
    "SELECT * FROM email_gateway_settings WHERE scope_key = ?",
    [scopeKey],
  );
  return r ? { ...r, enabled: Boolean(r.enabled) } : null;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Basis API per penyedia; bisa ditimpa (`EMAIL_API_BASE_<PROVIDER>`) untuk server tiruan saat uji. */
const base = (p: string, d: string) =>
  (process.env[`EMAIL_API_BASE_${p.toUpperCase()}`] ?? d).replace(/\/$/, "");

export async function sendViaGateway(g: GatewayRow, msg: MailMessage): Promise<void> {
  if (!g.enabled) throw new Error("Email gateway is disabled");
  if (!g.from_email || !g.secret) throw new Error("Email gateway is incomplete (sender / key)");
  const fromName = g.from_name || "XPERD One";
  let res: Response;
  if (g.provider === "resend") {
    res = await fetch(`${base("resend", "https://api.resend.com")}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${g.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${g.from_email}>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: g.reply_to || undefined,
      }),
    });
  } else if (g.provider === "brevo") {
    res = await fetch(`${base("brevo", "https://api.brevo.com")}/v3/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": g.secret,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: g.from_email },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
        replyTo: g.reply_to ? { email: g.reply_to } : undefined,
      }),
    });
  } else if (g.provider === "sendgrid") {
    res = await fetch(`${base("sendgrid", "https://api.sendgrid.com")}/v3/mail/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${g.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: g.from_email, name: fromName },
        reply_to: g.reply_to ? { email: g.reply_to } : undefined,
        subject: msg.subject,
        content: [
          { type: "text/plain", value: msg.text },
          { type: "text/html", value: msg.html },
        ],
      }),
    });
  } else {
    throw new Error(
      "SMTP langsung belum didukung di server cloud. Gunakan provider API (Brevo/Resend/SendGrid) — Brevo juga menyediakan SMTP dengan akun yang sama.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gateway ${g.provider} menolak (${res.status}): ${body.slice(0, 200)}`);
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function otpEmail(name: string, code: string) {
  const subject = `Kode verifikasi XPERD One: ${code}`;
  const text = `Halo ${name},\n\nKode verifikasi akun XPERD One Anda: ${code}\nBerlaku 15 menit. Abaikan email ini jika Anda tidak mendaftar.\n\nXPERD One`;
  const html = `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f1f3d">
  <h2 style="margin:0 0 12px">Verifikasi akun XPERD One</h2>
  <p>Halo ${escapeHtml(name)},</p>
  <p>Masukkan kode berikut di halaman pendaftaran untuk mengaktifkan trial Anda:</p>
  <p style="font-size:30px;letter-spacing:8px;font-weight:bold;color:#b08d3c">${code}</p>
  <p style="color:#666;font-size:13px">Kode berlaku 15 menit. Abaikan email ini jika Anda tidak mendaftar.</p>
</div>`;
  return { subject, text, html };
}

export function welcomeEmail(name: string, email: string, trialEnds: string, loginUrl: string) {
  const subject = "Akun XPERD One Anda sudah aktif";
  const text = `Halo ${name},\n\nAkun trial Anda aktif hingga ${trialEnds}.\nMasuk: ${loginUrl}\nEmail: ${email}\n\nXPERD One`;
  const html = `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f1f3d">
  <h2 style="margin:0 0 12px">Selamat datang di XPERD One</h2>
  <p>Halo ${escapeHtml(name)}, akun trial Anda aktif hingga <b>${trialEnds}</b>.</p>
  <p><a href="${loginUrl}" style="background:#0f1f3d;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">Masuk ke XPERD One</a></p>
  <p style="color:#666;font-size:13px">Email login: ${escapeHtml(email)}</p>
</div>`;
  return { subject, text, html };
}

export const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
