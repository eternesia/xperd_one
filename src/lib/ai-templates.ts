/**
 * Template video Studio AI (tingkat "Template"): digabung dari foto + teks oleh mesin render Remotion
 * (`render-worker/`), tanpa model AI. Kunci template harus sama dengan komposisi di `render-worker/src/Root.tsx`.
 */
export interface TemplateDef {
  key: "promo" | "showcase" | "story" | "catalog" | "announce";
  /** Kebutuhan foto: satu, beberapa (slideshow), atau tanpa foto. */
  photos: "one" | "many" | "none";
  name: string;
  name_en: string;
  hint: string;
  hint_en: string;
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "promo",
    photos: "one",
    name: "Promo Harga",
    name_en: "Price Promo",
    hint: "Foto penuh dengan zoom pelan, judul, lencana harga, dan tombol ajakan",
    hint_en: "Full photo with slow zoom, title, price badge and call to action",
  },
  {
    key: "showcase",
    photos: "one",
    name: "Sorotan Produk",
    name_en: "Product Spotlight",
    hint: "Foto dalam kartu melayang di atas warna merek Anda",
    hint_en: "Photo in a floating card over your brand colour",
  },
  {
    key: "story",
    photos: "one",
    name: "Cerita Bertahap",
    name_en: "Step-by-step Story",
    hint: "Teks muncul satu per satu di samping foto, cocok untuk pengumuman",
    hint_en: "Text appears line by line beside the photo, good for announcements",
  },
  {
    key: "catalog",
    photos: "many",
    name: "Slideshow Katalog",
    name_en: "Catalogue Slideshow",
    hint: "2 sampai 6 foto bergantian, masing-masing dengan nama dan harga",
    hint_en: "2 to 6 photos in turn, each with its name and price",
  },
  {
    key: "announce",
    photos: "none",
    name: "Pengumuman Teks",
    name_en: "Text Announcement",
    hint: "Tanpa foto. Teks besar bergerak di atas warna merek, untuk promo atau info",
    hint_en: "No photo. Large moving text over your brand colour, for promos or notices",
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

export const TEMPLATE_LIMITS = { headline: 40, subline: 70, badge: 18, cta: 24 } as const;
/** Durasi bawaan; pilihan lengkap di TEMPLATE_DURATIONS. */
export const TEMPLATE_SECONDS = 6;
export const TEMPLATE_DURATIONS = [6, 10, 15] as const;
/** 16:9 = video lebar (YouTube). */
export const TEMPLATE_RATIOS = ["9:16", "1:1", "16:9"] as const;

/** Slideshow Katalog: jumlah foto, batas teks per foto, dan lama tiap foto + penutup (detik). */
export const CATALOG = { min: 2, max: 6, title: 30, price: 18, slide: 2.5, outro: 2 } as const;
export const catalogSeconds = (n: number) => Math.round(n * CATALOG.slide + CATALOG.outro);

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
  /** Hanya Slideshow Katalog. */
  items?: CatalogItem[];
}

/** Mesin render dianggap terhubung bila menghubungi dalam 2 menit terakhir. */
export const WORKER_ONLINE_MS = 120_000;
