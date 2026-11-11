/**
 * Template video Studio AI (tingkat "Template"): digabung dari foto + teks oleh mesin render Remotion
 * (`render-worker/`), tanpa model AI. Kunci template harus sama dengan komposisi di `render-worker/src/Root.tsx`.
 */
export interface TemplateDef {
  key: "promo" | "showcase" | "story";
  name: string;
  name_en: string;
  hint: string;
  hint_en: string;
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "promo",
    name: "Promo Harga",
    name_en: "Price Promo",
    hint: "Foto penuh dengan zoom pelan, judul, lencana harga, dan tombol ajakan",
    hint_en: "Full photo with slow zoom, title, price badge and call to action",
  },
  {
    key: "showcase",
    name: "Sorotan Produk",
    name_en: "Product Spotlight",
    hint: "Foto dalam kartu melayang di atas warna merek Anda",
    hint_en: "Photo in a floating card over your brand colour",
  },
  {
    key: "story",
    name: "Cerita Bertahap",
    name_en: "Step-by-step Story",
    hint: "Teks muncul satu per satu di samping foto, cocok untuk pengumuman",
    hint_en: "Text appears line by line beside the photo, good for announcements",
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
export const TEMPLATE_SECONDS = 6;

export interface TemplateText {
  headline: string;
  subline: string;
  badge: string;
  cta: string;
  accent: string;
}

/** Mesin render dianggap terhubung bila menghubungi dalam 2 menit terakhir. */
export const WORKER_ONLINE_MS = 120_000;
