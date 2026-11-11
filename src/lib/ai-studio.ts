/**
 * Studio AI Qalling (foto → video) — konstanta & tipe bersama klien/server.
 * Rancangan: docs/AI-STUDIO.md. Kredit = saldo tersendiri per tenant, dibeli per paket
 * (dari saldo Qalling atau bayar langsung QRIS/kartu); video memotong kredit.
 */

export interface CreditPack {
  credits: number;
  price_idr: number;
}

/** Paket bawaan (bisa diubah di Super Admin). */
export const DEFAULT_PACKS: CreditPack[] = [
  { credits: 10, price_idr: 25_000 },
  { credits: 25, price_idr: 60_000 },
  { credits: 50, price_idr: 110_000 },
  { credits: 100, price_idr: 200_000 },
];

export const perCredit = (p: CreditPack) => Math.round(p.price_idr / p.credits);
/** Nilai kredit terendah (paket termurah per kredit) — dasar perhitungan margin yang aman. */
export const minCreditValue = (packs: CreditPack[]) =>
  packs.length ? Math.min(...packs.map(perCredit)) : 0;

export const AI_TIERS = ["hemat", "standar", "premium"] as const;
export type AiTier = (typeof AI_TIERS)[number];

export const AI_PROVIDERS = ["fal", "atlas"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_DURATIONS = [5, 10] as const;
export const AI_RATIOS = ["9:16", "1:1"] as const;

/** Gaya gerakan = kunci + nama + prompt bahasa Inggris. Bawaan bisa diubah/ditambah di Super Admin. */
export interface StyleConfig {
  key: string;
  name: string;
  name_en: string;
  hint: string;
  hint_en: string;
  /** Prompt bahasa Inggris yang dikirim ke model (tidak dikirim ke browser pengguna). */
  prompt: string;
  enabled: boolean;
}
export type StyleView = Omit<StyleConfig, "prompt" | "enabled">;

/** Prompt bawaan — sama persis dengan yang dipakai saat uji kualitas. */
export const DEFAULT_STYLES: StyleConfig[] = [
  {
    key: "zoom",
    name: "Zoom produk",
    name_en: "Product zoom",
    hint: "Kamera mendekat pelan ke produk",
    hint_en: "Camera slowly pushes in",
    prompt:
      "slow cinematic push-in on the product, soft studio lighting, shallow depth of field, product stays sharp and unchanged",
    enabled: true,
  },
  {
    key: "rotate",
    name: "Putar 360°",
    name_en: "360° spin",
    hint: "Produk berputar di meja putar",
    hint_en: "Product spins on a turntable",
    prompt:
      "the product slowly rotates 360 degrees on a turntable, clean background, consistent lighting",
    enabled: true,
  },
  {
    key: "steam",
    name: "Uap/percikan",
    name_en: "Steam/splash",
    hint: "Uap dan percikan untuk makanan atau minuman",
    hint_en: "Steam and splash for food and drinks",
    prompt: "gentle steam rises, subtle liquid splash, appetizing close-up, warm light",
    enabled: true,
  },
  {
    key: "store",
    name: "Suasana toko",
    name_en: "Store walk-through",
    hint: "Kamera berjalan menyusuri toko",
    hint_en: "Camera walks through the store",
    prompt: "handheld camera slowly walks through the store, natural daylight, lively but calm",
    enabled: true,
  },
  {
    key: "model",
    name: "Dipakai model",
    name_en: "Worn by model",
    hint: "Pakaian dikenakan dan bergerak",
    hint_en: "Outfit worn and moving",
    prompt:
      "a model wears the outfit and turns slowly, natural movement, fabric moves realistically",
    enabled: true,
  },
  {
    key: "free",
    name: "Bebas",
    name_en: "Free",
    hint: "Gerakan halus, tulis arahan sendiri",
    hint_en: "Subtle motion, your own direction",
    prompt:
      "subtle natural motion, product stays sharp and unchanged, keep all text and logos legible",
    enabled: true,
  },
];

export const NOTE_MAX = 500;

/** "Gaya saya": gaya bawaan + arahan tersimpan, per workspace. */
export interface UserStyle {
  id: string;
  name: string;
  style: string;
  note: string;
}

export const TIER_LABELS: Record<AiTier, { id: string; en: string }> = {
  hemat: { id: "Hemat", en: "Basic" },
  standar: { id: "Standar", en: "Standard" },
  premium: { id: "Premium", en: "Premium" },
};

export interface TierConfig {
  enabled: boolean;
  provider: AiProvider;
  /** ID model/endpoint di penyedia, mis. `fal-ai/kling-video/v3/standard/image-to-video`. */
  model: string;
  /** Nama parameter gambar di model tsb (`image_url`, `start_image_url`, `image`). */
  image_param: string;
  credits_5s: number;
  credits_10s: number;
  /** Perkiraan biaya penyedia per detik (USD) — hanya untuk laporan margin. */
  cost_usd_per_s: number;
  /** Parameter tambahan per model (JSON), digabung ke body permintaan. */
  extra?: Record<string, string | number | boolean>;
}

/**
 * Bawaan (cek ulang di halaman harga resmi sebelum dibuka ke pengguna).
 * Kredit per 5 detik: Hemat 3 / Standar 5 / Premium 10 (1 kredit ±Rp2.000–2.500).
 */
export const DEFAULT_TIERS: Record<AiTier, TierConfig> = {
  hemat: {
    enabled: true,
    provider: "fal",
    model: "fal-ai/wan-25-preview/image-to-video",
    image_param: "image_url",
    credits_5s: 3,
    credits_10s: 6,
    cost_usd_per_s: 0.05,
  },
  standar: {
    enabled: true,
    provider: "fal",
    model: "fal-ai/kling-video/v3/standard/image-to-video",
    image_param: "start_image_url",
    credits_5s: 5,
    credits_10s: 10,
    cost_usd_per_s: 0.084,
    extra: { generate_audio: false },
  },
  premium: {
    enabled: true,
    provider: "fal",
    model: "bytedance/seedance-2.0/fast/image-to-video",
    image_param: "image_url",
    credits_5s: 10,
    credits_10s: 20,
    cost_usd_per_s: 0.181,
    extra: { resolution: "720p" },
  },
};

export const tierCredits = (t: TierConfig, duration: number) =>
  duration >= 10 ? t.credits_10s : t.credits_5s;

export type AiJobStatus = "queued" | "processing" | "saving" | "done" | "failed";

export interface AiJobView {
  id: string;
  status: AiJobStatus;
  /** hemat | standar | premium, atau "template" untuk video Template. */
  tier: AiTier | "template";
  style: string;
  style_label: string;
  style_label_en: string;
  source_name: string | null;
  duration_s: number;
  aspect_ratio: string;
  credits: number;
  refunded: boolean;
  error: string | null;
  result_media_id: string | null;
  source_media_id: string | null;
  result_path: string | null;
  result_name: string | null;
  source_path: string | null;
  note: string | null;
  seconds_elapsed: number;
  created_at: string;
}

export interface StudioAccess {
  /** Studio boleh dipakai pengguna ini sekarang. */
  available: boolean;
  /** `live` = dibuka untuk semua; `admin_preview` = fitur OFF, hanya Super Admin (uji). */
  mode: "off" | "live" | "admin_preview";
  /** Saldo kredit AI tenant. */
  credits: number;
  /** Saldo Rupiah wallet (untuk membeli paket). */
  balance_idr: number;
  /** Boleh membeli paket (owner/admin tenant). */
  can_buy: boolean;
  packs: CreditPack[];
  daily_limit: number;
  used_today: number;
  tiers: { tier: AiTier; credits_5s: number; credits_10s: number }[];
  styles: StyleView[];
  /** Tingkat Template (tanpa AI): tersedia?, harga kredit, mesin render terhubung? */
  template: { available: boolean; credits: number; worker_online: boolean };
  can_write: boolean;
}
