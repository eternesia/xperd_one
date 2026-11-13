/**
 * Template video Studio AI (tingkat "Template"): digabung dari foto + teks oleh mesin render Remotion
 * (`render-worker/`), tanpa model AI. Kunci template harus sama dengan komposisi di `render-worker/src/Root.tsx`.
 */
export interface TemplateDef {
  key: "steps" | "motion" | "promo" | "showcase" | "catalog" | "story" | "announce";
  /** Foto wajib (1–10) atau opsional (0–10, untuk Pengumuman). */
  photos: "required" | "optional";
  name: string;
  name_en: string;
  hint: string;
  hint_en: string;
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "steps",
    photos: "required",
    name: "Langkah demi Langkah",
    name_en: "Step by Step",
    hint: "Tiap foto jadi langkah bernomor dengan judul dua warna dan garis kemajuan",
    hint_en: "Each photo becomes a numbered step with a two-tone title and progress line",
  },
  {
    key: "motion",
    photos: "required",
    name: "Motion Grafis",
    name_en: "Motion Graphics",
    hint: "Kartu terbang, layar terbelah, sapuan warna, kolase penutup",
    hint_en: "Flying cards, split screens, colour wipes, closing collage",
  },
  {
    key: "promo",
    photos: "required",
    name: "Promo Harga",
    name_en: "Price Promo",
    hint: "Foto penuh dengan zoom pelan, judul, dan lencana harga",
    hint_en: "Full photo with slow zoom, title and price badge",
  },
  {
    key: "showcase",
    photos: "required",
    name: "Sorotan Produk",
    name_en: "Product Spotlight",
    hint: "Foto dalam kartu melayang di atas warna tema",
    hint_en: "Photo in a floating card over the theme colour",
  },
  {
    key: "catalog",
    photos: "required",
    name: "Slideshow Katalog",
    name_en: "Catalogue Slideshow",
    hint: "Foto bergantian, masing-masing dengan nama dan harga",
    hint_en: "Photos in turn, each with its name and price",
  },
  {
    key: "story",
    photos: "required",
    name: "Cerita Bertahap",
    name_en: "Story",
    hint: "Teks muncul satu per satu di atas foto",
    hint_en: "Text appears line by line over the photo",
  },
  {
    key: "announce",
    photos: "optional",
    name: "Pengumuman",
    name_en: "Announcement",
    hint: "Teks besar bergerak; foto opsional di latar",
    hint_en: "Large moving text; photos optional in the background",
  },
];
export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key) as [string, ...string[]];

export const TEMPLATE_ACCENTS = [
  "#6D28D9",
  "#0B2FA8",
  "#10B981",
  "#F59E0B",
  "#E11D48",
  "#111827",
  "#FFFFFF",
] as const;

export const TEMPLATE_LIMITS = { headline: 40, subline: 70, badge: 18, cta: 28 } as const;
/** Durasi bawaan; pilihan lengkap di TEMPLATE_DURATIONS. */
export const TEMPLATE_SECONDS = 10;
export const TEMPLATE_DURATIONS = [8, 10, 15, 20, 30, 45, 60] as const;
/** "auto" = dari bentuk foto pertama (tegak 9:16, persegi 1:1, mendatar 16:9). */
export const TEMPLATE_RATIOS = ["auto", "9:16", "1:1", "16:9"] as const;

/** Foto per video dan batas teks per foto. */
export const PHOTOS = { max: 10, title: 40, label: 24 } as const;

/**
 * Durasi minimum (detik) supaya tiap foto sempat terbaca; harus sama dengan `minimumFrames`
 * di `render-worker/src/Root.tsx`.
 */
export function minSeconds(key: string, n: number) {
  const k = Math.max(1, n);
  if (key === "catalog") return k * 2.5 + 2;
  if (key === "motion") return 1.5 + k * 2 + 2;
  if (key === "steps") return 2 + k * 2.5 + 2.5;
  if (key === "announce") return 0;
  return k * 2.5;
}
/** Durasi akhir video (detik): pilihan pengguna, dipanjangkan oleh jumlah foto atau narasi. */
export function finalSeconds(key: string, n: number, chosen: number, narration = 0) {
  return Math.ceil(
    Math.max(chosen, minSeconds(key, n), narration ? Math.min(60, narration + 1) : 0),
  );
}

/** Harga Template per durasi: tingkat pertama yang `max_s`-nya cukup. */
export interface TemplatePrice {
  max_s: number;
  credits: number;
}
export const DEFAULT_TEMPLATE_PRICES: TemplatePrice[] = [
  { max_s: 10, credits: 1 },
  { max_s: 15, credits: 2 },
  { max_s: 30, credits: 3 },
  { max_s: 61, credits: 5 },
];
export function templateCredits(prices: TemplatePrice[], seconds: number) {
  const list = [...(prices.length ? prices : DEFAULT_TEMPLATE_PRICES)].sort(
    (a, b) => a.max_s - b.max_s,
  );
  return (list.find((p) => seconds <= p.max_s) ?? list[list.length - 1]).credits;
}

/** Narasi unggahan pengguna: batas durasi (detik); video memanjang mengikuti narasi. */
export const NARRATION = {
  maxSeconds: 60,
  folder: "ai/narration",
  accept: ".mp3,.m4a,.wav",
} as const;

export interface CatalogItem {
  media_id: string;
  title: string;
  price: string;
}

export interface TemplateText {
  headline: string;
  subline: string;
  badge: string;
  cta: string;
  accent: string;
  /** Foto berurutan + teks per foto. */
  items?: CatalogItem[];
  /** Efek suara mengikuti animasi. */
  sound?: boolean;
  /** Path rekaman narasi (folder `ai/narration`). */
  narration?: string;
  /** Suasana musik latar (kosong = sesuai template). */
  mood?: MusicMood;
  /** Perintah/brief pengguna (tidak dirender; untuk "Buat versi lain"). */
  brief?: string;
}

/** Suasana musik latar (disintesis mesin render, bebas lisensi). */
export const MUSIC_MOODS = [
  { key: "auto", name: "Otomatis", name_en: "Automatic" },
  { key: "energetic", name: "Energik", name_en: "Energetic" },
  { key: "upbeat", name: "Ceria", name_en: "Upbeat" },
  { key: "corporate", name: "Profesional", name_en: "Corporate" },
  { key: "calm", name: "Tenang", name_en: "Calm" },
  { key: "cinematic", name: "Elegan", name_en: "Cinematic" },
  { key: "chill", name: "Santai", name_en: "Chill" },
] as const;
export type MusicMood = Exclude<(typeof MUSIC_MOODS)[number]["key"], "auto">;
export const MUSIC_MOOD_KEYS = MUSIC_MOODS.map((m) => m.key) as [string, ...string[]];

/** Mesin render dianggap terhubung bila menghubungi dalam 2 menit terakhir. */
export const WORKER_ONLINE_MS = 120_000;
