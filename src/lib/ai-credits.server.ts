/**
 * Kredit Studio AI — saldo tersendiri per tenant (`ai_credit_accounts`) dengan buku besar yang hanya ditambah
 * (`ai_credit_ledger`, kunci idempotensi unik). Pola sama dengan `walletPostEntryOn`.
 *
 * Pembelian paket:
 *  - dari saldo Qalling: potong wallet (Rupiah) + tambah kredit dalam satu transaksi, kunci `ai-pack:<kunci>`;
 *  - bayar langsung (QRIS/kartu): top-up ber-`purchase_intent` {kind:"ai_credits"} → begitu lunas,
 *    `applyTopupPurchase` memanggil `applyCreditIntent` sehingga kredit langsung masuk.
 * Urutan kunci: wallet dahulu, lalu akun kredit (tidak ada jalur yang membalik urutan ini).
 */
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import { DEFAULT_PACKS, type CreditPack } from "./ai-studio";

export type CreditKind = "purchase" | "usage" | "refund" | "bonus" | "adjustment";

export interface CreditEntry {
  tenantId: string;
  delta: number;
  kind: CreditKind;
  ref: string | null;
  idem: string;
  description: string;
  amountIdr?: number;
  actor?: string | null;
}

/** Entri kredit di dalam transaksi pemanggil; idempoten dengan pemeriksaan kesesuaian. Mengembalikan saldo akhir. */
export async function creditPostOn(conn: PoolConnection, p: CreditEntry): Promise<number> {
  if (!Number.isInteger(p.delta) || p.delta === 0 || p.idem.length < 3)
    throw new Error("invalid_credit_entry");
  await conn.execute("INSERT IGNORE INTO ai_credit_accounts (tenant_id, credits) VALUES (?, 0)", [
    p.tenantId,
  ]);
  const [accs] = await conn.execute(
    "SELECT credits FROM ai_credit_accounts WHERE tenant_id = ? FOR UPDATE",
    [p.tenantId],
  );
  const balance = Number((accs as { credits: number }[])[0].credits);
  const [prior] = await conn.execute(
    "SELECT tenant_id, delta, kind, ref_id, balance_after FROM ai_credit_ledger WHERE idempotency_key = ?",
    [p.idem],
  );
  const v = (
    prior as {
      tenant_id: string;
      delta: number;
      kind: string;
      ref_id: string | null;
      balance_after: number;
    }[]
  )[0];
  if (v) {
    if (
      v.tenant_id !== p.tenantId ||
      Number(v.delta) !== p.delta ||
      v.kind !== p.kind ||
      (v.ref_id ?? null) !== (p.ref ?? null)
    )
      throw new Error("idempotency_conflict");
    return balance;
  }
  if (balance + p.delta < 0) throw new Error("insufficient_credits");
  const after = balance + p.delta;
  await conn.execute(
    `INSERT INTO ai_credit_ledger (id, tenant_id, kind, delta, balance_after, amount_idr, ref_id, idempotency_key, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      p.tenantId,
      p.kind,
      p.delta,
      after,
      p.amountIdr ?? 0,
      p.ref,
      p.idem,
      p.description.slice(0, 255),
      p.actor ?? null,
    ],
  );
  await conn.execute("UPDATE ai_credit_accounts SET credits = ? WHERE tenant_id = ?", [
    after,
    p.tenantId,
  ]);
  return after;
}

export async function getCredits(tenantId: string): Promise<number> {
  const r = await executeOne<{ credits: number }>(
    "SELECT credits FROM ai_credit_accounts WHERE tenant_id = ?",
    [tenantId],
  );
  return Number(r?.credits ?? 0);
}

export async function getPacks(): Promise<CreditPack[]> {
  const r = await executeOne<{ credit_packs: unknown }>(
    "SELECT credit_packs FROM ai_studio_settings WHERE id = 'platform'",
  );
  const raw = r?.credit_packs;
  const packs = (typeof raw === "string" ? JSON.parse(raw) : raw) as CreditPack[] | null;
  const valid = (packs ?? []).filter(
    (p) =>
      Number.isInteger(p?.credits) &&
      p.credits > 0 &&
      Number.isInteger(p?.price_idr) &&
      p.price_idr > 0,
  );
  return (valid.length ? valid : DEFAULT_PACKS).slice().sort((a, b) => a.credits - b.credits);
}

/** Inti pembelian: potong Rupiah wallet lalu tambah kredit, dalam transaksi pemanggil. */
async function buyOn(
  conn: PoolConnection,
  p: {
    tenantId: string;
    credits: number;
    priceIdr: number;
    key: string;
    ref: string;
    actor: string | null;
  },
) {
  const { walletPostEntryOn } = await import("./wallet.server");
  try {
    await walletPostEntryOn(conn, {
      tenantId: p.tenantId,
      type: "usage",
      amount: -p.priceIdr,
      product: "qalling_ai",
      ref: p.ref,
      idem: `ai-pack:${p.key}`,
      description: `Beli ${p.credits} kredit Studio AI`,
      actor: p.actor,
    });
  } catch (e) {
    if ((e as Error).message === "insufficient_balance")
      throw new Error(
        `Saldo Qalling tidak cukup (butuh Rp${p.priceIdr.toLocaleString("id-ID")}). Top up saldo atau bayar langsung.`,
      );
    throw e;
  }
  return creditPostOn(conn, {
    tenantId: p.tenantId,
    delta: p.credits,
    kind: "purchase",
    ref: p.ref,
    idem: `ai-pack:${p.key}`,
    amountIdr: p.priceIdr,
    description: `Paket ${p.credits} kredit`,
    actor: p.actor,
  });
}

/** Beli paket dari saldo Qalling (harga saat ini). `key` = UUID dari klien untuk idempotensi. */
export async function buyPackFromWallet(p: {
  tenantId: string;
  credits: number;
  key: string;
  actor: string;
}) {
  const pack = (await getPacks()).find((x) => x.credits === p.credits);
  if (!pack) throw new Error("Paket tidak tersedia");
  const credits = await transaction((conn) =>
    buyOn(conn, {
      tenantId: p.tenantId,
      credits: pack.credits,
      priceIdr: pack.price_idr,
      key: p.key,
      ref: p.key,
      actor: p.actor,
    }),
  );
  return { credits, pack };
}

/**
 * Top-up ber-niat kredit sudah lunas → konversi langsung ke kredit dengan harga yang dibayar (tercatat di niat).
 * Dipanggil dari `applyTopupPurchase`; idempoten per top-up.
 */
export async function applyCreditIntent(
  topupId: string,
  tenantId: string,
  actor: string | null,
  intent: { credits?: number; price_idr?: number },
) {
  const credits = Number(intent.credits);
  const price = Number(intent.price_idr);
  if (!Number.isInteger(credits) || credits <= 0 || !Number.isInteger(price) || price <= 0)
    throw new Error("invalid_credit_intent");
  await transaction((conn) =>
    buyOn(conn, {
      tenantId,
      credits,
      priceIdr: price,
      key: `topup-${topupId}`,
      ref: topupId,
      actor,
    }),
  );
}

/** Super Admin: kredit bonus (uji coba, promosi). `key` = UUID dari klien. */
export async function grantBonusCredits(p: {
  tenantId: string;
  credits: number;
  key: string;
  actor: string;
  note: string;
}) {
  return transaction((conn) =>
    creditPostOn(conn, {
      tenantId: p.tenantId,
      delta: p.credits,
      kind: p.credits > 0 ? "bonus" : "adjustment",
      ref: null,
      idem: `ai-bonus:${p.key}`,
      description: p.note || "Kredit bonus dari admin",
      actor: p.actor,
    }),
  );
}

/** Riwayat kredit + pembayaran langsung yang masih menunggu (untuk halaman Studio). */
export async function creditActivity(tenantId: string) {
  const ledger = await execute<Record<string, unknown>>(
    `SELECT kind, delta, balance_after, amount_idr, description, created_at
       FROM ai_credit_ledger WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 15`,
    [tenantId],
  );
  const pending = await execute<Record<string, unknown>>(
    `SELECT id, amount_idr, payment_url, created_at, purchase_intent
       FROM topups
      WHERE tenant_id = ? AND status = 'pending' AND created_at >= NOW(6) - INTERVAL 1 DAY
        AND JSON_UNQUOTE(JSON_EXTRACT(purchase_intent, '$.kind')) = 'ai_credits'
      ORDER BY created_at DESC LIMIT 5`,
    [tenantId],
  );
  return {
    ledger: ledger.map((r) => ({
      kind: String(r.kind),
      delta: Number(r.delta),
      balance_after: Number(r.balance_after),
      amount_idr: Number(r.amount_idr),
      description: String(r.description ?? ""),
      created_at: String(r.created_at),
    })),
    pending: pending.map((r) => {
      const intent = (
        typeof r.purchase_intent === "string" ? JSON.parse(r.purchase_intent) : r.purchase_intent
      ) as {
        credits?: number;
      } | null;
      return {
        id: String(r.id),
        amount_idr: Number(r.amount_idr),
        credits: Number(intent?.credits ?? 0),
        payment_url: (r.payment_url as string | null) ?? null,
        created_at: String(r.created_at),
      };
    }),
  };
}
