/**
 * #63 (BS New 3): Omnix — add-on integrasi toko online.
 *
 * Semua logika uang (top up, paket, biaya per transaksi) dijalankan **di level
 * aplikasi** dalam satu transaksi MySQL (`lib/omnix.functions.ts`) — TIDAK ada
 * trigger atau stored function di database.
 */

export interface OmnixChannel {
  id: string;
  name: string;
  /** label field Partner/App ID sesuai platform */
  pid: string;
  /** label field public key */
  pub: string;
  /** label field secret */
  sec: string;
}

export const OMNIX_CHANNELS: OmnixChannel[] = [
  { id: "shopee", name: "Shopee", pid: "Partner ID", pub: "Partner Key (public)", sec: "Partner Secret Key" },
  { id: "tiktok", name: "TikTok Shop", pid: "App ID", pub: "App Key", sec: "App Secret" },
  { id: "tokopedia", name: "Tokopedia", pid: "App ID / FS ID", pub: "Client ID", sec: "Client Secret" },
  { id: "lazada", name: "Lazada", pid: "App ID", pub: "App Key", sec: "App Secret" },
  { id: "gofood", name: "GoFood", pid: "Merchant / Partner ID", pub: "Client ID", sec: "Client Secret" },
  { id: "grabfood", name: "GrabFood", pid: "Partner ID", pub: "Client ID", sec: "Client Secret" },
  { id: "shopeefood", name: "ShopeeFood", pid: "Partner ID", pub: "Partner Key (public)", sec: "Secret Key" },
];

export const omnixChannelName = (id: string) => OMNIX_CHANNELS.find((c) => c.id === id)?.name ?? id;

export const OMNIX_ORDER_STATUS = ["pending", "processing", "shipped", "completed", "cancelled"] as const;
export const OMNIX_PACK_STATUS = ["unpacked", "packed", "picked_up"] as const;

/** Biaya Omnix per transaksi selesai (Rp) — dipakai saat status jadi `completed`. */
export const OMNIX_FEE_PER_ORDER = 25;
/** Paket bulanan: harga, kuota transaksi, dan masa berlaku (hari). */
export const OMNIX_BUNDLE = { price: 350000, quota: 20000, days: 30 };
/** Minimal pengajuan top up saldo. */
export const OMNIX_MIN_TOPUP = 10000;

const PACK_LABEL: Record<string, { en: string; id_: string }> = {
  unpacked: { en: "Not packed", id_: "Belum dikemas" },
  packed: { en: "Packed", id_: "Dikemas" },
  picked_up: { en: "Picked up", id_: "Diserahkan kurir" },
};

export function packLabel(status: string, lang: string) {
  const row = PACK_LABEL[status];
  if (!row) return status;
  return lang === "id" ? row.id_ : row.en;
}

export function isBundleActive(wallet: { bundle_quota: number; bundle_used: number; bundle_ends_at: string | null } | null) {
  if (!wallet?.bundle_ends_at) return false;
  return new Date(wallet.bundle_ends_at).getTime() > Date.now() && Number(wallet.bundle_used) < Number(wallet.bundle_quota);
}
