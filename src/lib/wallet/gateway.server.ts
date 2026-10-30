import { createHash, timingSafeEqual } from "node:crypto";
import { isSettledPayment, midtransNoticeSchema } from "./rules";

export async function verifyMidtransNotice(input: unknown, key: string) {
  const notice = midtransNoticeSchema.parse(input);
  const expected = createHash("sha512")
    .update(`${notice.order_id}${notice.status_code}${notice.gross_amount}${key}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(notice.signature_key, "hex")))
    throw new Error("Invalid signature");
  return notice;
}
export async function readMidtransStatus(reference: string, key: string, mode: string) {
  const host = mode === "live" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  const response = await fetch(`${host}/v2/${encodeURIComponent(reference)}/status`, {
    headers: { Accept: "application/json", Authorization: `Basic ${btoa(`${key}:`)}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Status pembayaran belum tersedia. Coba lagi setelah pembayaran.");
  return midtransNoticeSchema.omit({ signature_key: true }).parse(await response.json());
}
export { isSettledPayment };
