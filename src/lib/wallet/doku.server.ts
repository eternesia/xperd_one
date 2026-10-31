import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** DOKU Checkout NON-SNAP (Jokul): Client ID + Secret Key. Salinan New 13; kunci dibaca dari DB Old (bukan Supabase). */
export const DOKU_WEBHOOK_PATH = "/api/public/webhooks/wallet-doku";
export const dokuNoticeSchema = z.object({
  order: z.object({
    invoice_number: z.string().min(1).max(100),
    amount: z
      .union([z.number(), z.string()])
      .transform(Number)
      .pipe(z.number().int().positive().safe()),
  }),
  transaction: z.object({
    status: z.enum([
      "SUCCESS",
      "PENDING",
      "FAILED",
      "EXPIRED",
      "CANCELLED",
      "REFUNDED",
      "TIMEOUT",
      "REDIRECT",
    ]),
  }),
});
export type DokuCredentials = { clientId: string; secret: string; mode: string };

/** Basis API DOKU; bisa ditimpa (`DOKU_API_BASE`) untuk server tiruan saat uji. */
const apiBase = (mode: string) =>
  (
    process.env.DOKU_API_BASE ??
    (mode === "live" ? "https://api.doku.com" : "https://api-sandbox.doku.com")
  ).replace(/\/$/, "");

export function dokuSignature(
  clientId: string,
  requestId: string,
  timestamp: string,
  path: string,
  secret: string,
  body?: string,
) {
  const canonical = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${path}`,
  ];
  if (body !== undefined)
    canonical.push(`Digest:${createHash("sha256").update(body).digest("base64")}`);
  return `HMACSHA256=${createHmac("sha256", secret).update(canonical.join("\n")).digest("base64")}`;
}
export function verifyDokuNotice(
  body: string,
  headers: Headers,
  credentials: DokuCredentials,
  path = DOKU_WEBHOOK_PATH,
) {
  const id = headers.get("Client-Id");
  const requestId = headers.get("Request-Id");
  const timestamp = headers.get("Request-Timestamp");
  const signature = headers.get("Signature");
  if (
    id !== credentials.clientId ||
    !requestId ||
    requestId.length > 128 ||
    !timestamp ||
    !Number.isFinite(Date.parse(timestamp)) ||
    !signature
  )
    throw new Error("Invalid signature");
  const expected = Buffer.from(
    dokuSignature(id, requestId, timestamp, path, credentials.secret, body),
  );
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("Invalid signature");
  // DOKU dapat mengulang notifikasi lama; penyelesaian saldo atomik menangani pengulangan.
  return dokuNoticeSchema.parse(JSON.parse(body));
}
async function dokuRequest(credentials: DokuCredentials, path: string, body?: string) {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const response = await fetch(`${apiBase(credentials.mode)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "Client-Id": credentials.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: dokuSignature(
        credentials.clientId,
        requestId,
        timestamp,
        path,
        credentials.secret,
        body,
      ),
    },
    body,
  });
  if (!response.ok)
    throw new Error(
      `DOKU menolak permintaan (${response.status}). Periksa Client ID, Secret Key, mode, dan aktivasi Checkout di DOKU.`,
    );
  return response.json();
}
export async function createDokuCheckout(
  credentials: DokuCredentials,
  reference: string,
  amount: number,
  returnUrl?: string,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Nominal tidak valid.");
  const payload = await dokuRequest(
    credentials,
    "/checkout/v1/payment",
    JSON.stringify({
      order: {
        amount,
        invoice_number: reference,
        ...(returnUrl
          ? { callback_url: returnUrl, callback_url_result: returnUrl, auto_redirect: true }
          : { auto_redirect: false }),
      },
      payment: { payment_due_date: 1440 },
    }),
  );
  const parsed = z
    .object({ response: z.object({ payment: z.object({ url: z.string().url() }) }) })
    .parse(payload);
  const url = new URL(parsed.response.payment.url);
  // Tautan checkout hanya boleh ke domain DOKU (server tiruan uji: DOKU_API_BASE → izinkan host itu).
  const allowedHost = process.env.DOKU_API_BASE ? new URL(process.env.DOKU_API_BASE).hostname : null;
  const okHost =
    url.hostname === "doku.com" ||
    url.hostname.endsWith(".doku.com") ||
    (allowedHost !== null && url.hostname === allowedHost);
  if (!okHost || (url.protocol !== "https:" && allowedHost === null))
    throw new Error("Tautan DOKU tidak valid.");
  return url.href;
}
export async function readDokuStatus(credentials: DokuCredentials, reference: string) {
  return dokuNoticeSchema.parse(
    await dokuRequest(credentials, `/orders/v1/status/${encodeURIComponent(reference)}`),
  );
}
export function validateDokuPayment(
  notice: z.infer<typeof dokuNoticeSchema>,
  reference: string,
  amount: number,
) {
  if (notice.order.invoice_number !== reference || notice.order.amount !== amount)
    throw new Error("Referensi atau nominal pembayaran tidak cocok.");
  return notice.transaction.status === "SUCCESS";
}
/** Client ID = `merchant_id`; Secret Key = `server_key` (DB) atau env bernama `server_key_secret_name` (cadangan). */
export function getDokuCredentials(gateway: {
  merchant_id: string | null;
  mode: string;
  server_key: string | null;
  server_key_secret_name: string | null;
}): DokuCredentials {
  const secret = gateway.server_key || process.env[gateway.server_key_secret_name || "DOKU_SECRET_KEY"];
  if (!gateway.merchant_id || !secret)
    throw new Error("Client ID dan Secret Key DOKU belum dikonfigurasi admin.");
  return { clientId: gateway.merchant_id, secret, mode: gateway.mode };
}
