import { z } from "zod";

export const rupiah = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const requestTopupSchema = z.object({
  tenantId: z.string().uuid(),
  amount: rupiah,
  gatewayId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  note: z.string().trim().max(1000).default(""),
});
export const reviewTopupSchema = z
  .object({
    id: z.string().uuid(),
    approve: z.boolean(),
    note: z.string().trim().max(1000).default(""),
  })
  .refine((v) => v.approve || v.note.length > 0, { message: "Alasan penolakan wajib diisi" });
export function validateTopupAmount(amount: number, minimum: number, maximum: number) {
  rupiah.parse(amount);
  if (amount < minimum || amount > maximum)
    throw new Error(
      `Nominal harus antara Rp${minimum.toLocaleString("id-ID")} dan Rp${maximum.toLocaleString("id-ID")}`,
    );
  return amount;
}
export const midtransNoticeSchema = z.object({
  order_id: z.string().max(100),
  status_code: z.string().max(10),
  gross_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  signature_key: z.string().regex(/^[a-fA-F0-9]{128}$/),
  transaction_status: z.string().max(30),
  fraud_status: z.string().max(30).optional(),
});
export function isSettledPayment(status: string, fraudStatus?: string) {
  return status === "settlement" || (status === "capture" && fraudStatus === "accept");
}
export function walletCsv(
  rows: Array<{
    created_at: string;
    entry_type: string;
    product_code: string;
    amount_idr: number;
    balance_after: number;
    description: string;
    idempotency_key: string;
  }>,
) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-]/.test(s) && typeof v !== "number") s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return (
    "\ufeff" +
    [
      ["Tanggal", "Jenis", "Produk", "Nominal IDR", "Saldo IDR", "Keterangan", "Referensi"],
      ...rows.map((r) => [
        r.created_at,
        r.entry_type,
        r.product_code,
        r.amount_idr,
        r.balance_after,
        r.description,
        r.idempotency_key,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\n")
  );
}
