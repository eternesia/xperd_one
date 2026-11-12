/**
 * Studio Video — "mode perintah": pengguna menulis satu kalimat perintah, lalu teks video
 * (judul, keterangan, lencana, ajakan) dan suasana musik disusun otomatis.
 * Berkas ini murni (tanpa API): pengurai aturan sederhana untuk bahasa Indonesia, dipakai bila
 * asisten AI (LLM) belum diatur Super Admin atau sedang gagal.
 */
import { PHOTOS, TEMPLATE_LIMITS, type MusicMood } from "./ai-templates";

export interface DraftText {
  headline: string;
  subline: string;
  badge: string;
  cta: string;
  mood: MusicMood | "auto";
  /** Teks per foto, berurutan (judul + label); kosong = tidak diubah. */
  items: { title: string; label: string }[];
}

/**
 * Teks mana yang benar-benar tampil di tiap template — dipakai untuk mengarahkan AI dan memberi
 * tahu pengguna. `itemLabel` = arti label per foto.
 */
export const TEMPLATE_TEXT_USE: Record<
  string,
  { fields: ("headline" | "subline" | "badge" | "cta")[]; itemTitle: string; itemLabel: string }
> = {
  motion: {
    fields: ["headline", "cta"],
    itemTitle: "nama fitur/produk di foto",
    itemLabel: "harga atau keterangan singkat",
  },
  catalog: { fields: ["headline", "cta"], itemTitle: "nama produk", itemLabel: "harga" },
  steps: {
    fields: ["headline", "subline", "badge", "cta"],
    itemTitle: "judul langkah",
    itemLabel: "label langkah (mis. LANGKAH 1 / nama tahap)",
  },
  promo: {
    fields: ["headline", "subline", "badge", "cta"],
    itemTitle: "judul adegan",
    itemLabel: "lencana adegan (harga/promo)",
  },
  showcase: {
    fields: ["headline", "subline", "badge", "cta"],
    itemTitle: "judul adegan",
    itemLabel: "lencana adegan",
  },
  story: {
    fields: ["headline", "subline", "badge", "cta"],
    itemTitle: "kalimat cerita adegan",
    itemLabel: "lencana adegan",
  },
  announce: {
    fields: ["headline", "subline", "badge", "cta"],
    itemTitle: "judul adegan",
    itemLabel: "lencana adegan",
  },
};

/** Pecah perintah berisi daftar (baris / nomor / poin) menjadi teks per foto bila jumlahnya pas. */
const DIRECTIVE = /^(gunakan|pakai|tambahkan|tambah|buat|bikin|dominasi|warna|musik|transisi|durasi|font|gaya|tone|nuansa)\b/i;

export function itemsFromList(prompt: string, n: number): DraftText["items"] {
  if (n < 1) return [];
  const raw = prompt.split(/\n+/).map((l) => l.trim());
  // Utamakan daftar bernomor; selain itu poin "-"/"•". Instruksi gaya (warna, musik, transisi) diabaikan.
  const numbered = raw.filter((l) => /^\d{1,2}[.)]\s/.test(l));
  const bullets = raw.filter((l) => /^[-•*]\s/.test(l));
  const lines = (numbered.length >= Math.min(2, n) ? numbered : bullets)
    .map((l) => l.replace(/^(?:\d{1,2}[.)]|[-•*])\s*/, "").trim())
    .filter((l) => l.length > 2 && !DIRECTIVE.test(l));
  if (!lines.length) return [];
  return lines.slice(0, n).map((l) => {
    const [a, b] = l.split(/\s[–—-]\s|:\s/);
    return { title: clip(first(a ?? l), PHOTOS.title), label: clip(first(b ?? ""), PHOTOS.label) };
  });
}

/** Potong di batas kata tanpa melebihi `max` karakter. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : t.slice(0, max)).replace(/[\s,.;:–-]+$/, "");
}

const SMALL = new Set([
  "di",
  "ke",
  "dari",
  "dan",
  "dengan",
  "untuk",
  "yang",
  "sampai",
  "atau",
  "pada",
  "&",
]);
const cap = (s: string) =>
  s
    .split(" ")
    .map((w, i) =>
      i > 0 && SMALL.has(w.toLowerCase())
        ? w.toLowerCase()
        : w
          ? w[0].toUpperCase() + w.slice(1)
          : w,
    )
    .join(" ");
const first = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const MOOD_WORDS: [MusicMood, RegExp][] = [
  ["energetic", /\b(promo|diskon|sale|flash|murah|hemat|potongan|cashback|grand opening|serbu)\b/i],
  ["cinematic", /\b(elegan|mewah|premium|luxury|eksklusif|wedding|pernikahan|properti|villa)\b/i],
  ["chill", /\b(santai|kafe|cafe|kopi|coffee|lo-?fi|senja|healing|liburan)\b/i],
  ["upbeat", /\b(ceria|anak|kids|fun|lucu|seru|ulang tahun|playful|warna-?warni)\b/i],
  ["calm", /\b(tenang|cerita|kisah|terima kasih|duka|ramadhan|lebaran|natal|hangat|spa)\b/i],
  [
    "corporate",
    /\b(bisnis|perusahaan|corporate|software|aplikasi|teknologi|sistem|erp|webinar|seminar)\b/i,
  ],
];

export function guessMood(prompt: string): DraftText["mood"] {
  for (const [m, re] of MOOD_WORDS) if (re.test(prompt)) return m;
  return "auto";
}

/** Pengurai aturan: cukup baik untuk perintah singkat; LLM menghasilkan teks yang lebih luwes. */
export function draftFromRules(prompt: string, photos = 0): DraftText {
  // Hanya baris pertama/paragraf sebelum daftar yang dipakai untuk judul & ajakan.
  const intro = prompt
    .split(/\n+/)
    .filter((l) => !/^\s*(?:\d{1,2}[.)]|[-•*])\s/.test(l))
    .join("\n");
  let rest = ` ${(intro || prompt).replace(/[ \t]+/g, " ").trim()} `;
  const take = (re: RegExp) => {
    const m = re.exec(rest);
    if (!m) return "";
    rest = rest.replace(m[0], " ");
    return m[0].trim();
  };

  // Lencana: diskon/harga/gratis ongkir/baru.
  let badge = "";
  const disc =
    /\b(diskon|disc|potongan|hemat|off)\s*(hingga|s\.?d\.?|sampai|up to)?\s*\d{1,3}\s*%/i.exec(
      rest,
    ) ?? /\b\d{1,3}\s*%\s*(off|diskon)?/i.exec(rest);
  const price =
    /\b((harga|cuma|hanya|mulai|dari)\s+){0,2}rp\.?\s?\d[\d.,]*\s*(rb|ribu|k|jt|juta)?\b/i.exec(
      rest,
    );
  if (disc) {
    badge = disc[0].trim();
    rest = rest.replace(disc[0], " ");
    if (/^\d/.test(badge)) badge = `Diskon ${badge.replace(/\s*(off|diskon)$/i, "")}`;
  } else if (price) {
    badge = price[0].trim();
    rest = rest.replace(price[0], " ");
  } else {
    badge = take(
      /\b(gratis ongkir|free ongkir|buy 1 get 1|beli 1 gratis 1|cashback \S+|produk baru|new arrival|best seller|terlaris)\b/i,
    );
  }
  badge = first(badge.replace(/^((harga|cuma|hanya)\s+)+/i, ""));

  // Ajakan: tautan, @akun, nomor WA, atau frasa ajakan sampai akhir klausa.
  let cta = "";
  const url = /\b((https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?)\b/i.exec(rest);
  const handle = /@[\w.]{2,30}/.exec(rest);
  const verb =
    /\b(ajak(?:an)?\s+(?:untuk\s+)?|cta\s*:?\s*)?(order|pesan|beli|belanja|hubungi|chat|kunjungi|daftar|klik|cek|follow|ikuti|dm|wa|whatsapp|booking|reservasi|coba)\b(?:[^,;.\n]|\.(?=\S))*/i.exec(
      rest,
    );
  if (verb) {
    cta = verb[0].replace(/^(ajak(?:an)?\s+(?:untuk\s+)?|cta\s*:?\s*)/i, "").trim();
    rest = rest.replace(verb[0], " ");
  } else if (url) {
    cta = url[1].replace(/^https?:\/\//, "");
    rest = rest.replace(url[0], " ");
  } else if (handle) {
    cta = `Follow ${handle[0]}`;
    rest = rest.replace(handle[0], " ");
  }
  cta = first(cta.replace(/\b(lewat|melalui|via)\b/i, "via"));

  // Sisa: buang kata perintah, pecah per klausa → judul + keterangan.
  rest = rest
    .replace(
      /\b(tolong|buatkan|buat|bikin|bikinin|tampilkan|video|konten|reels?|tiktok|untuk|tentang|mengenai|soal|yang|dengan tema|tema)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const clauses = rest
    .split(/[,.;\n]|\s(?:dan|serta|lalu|kemudian)\s/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
  let head = clauses.shift() ?? rest;
  // Judul terlalu panjang → pecah di kata sambung ("… dari …", "… untuk …"), sisanya jadi keterangan.
  if (head.length > TEMPLATE_LIMITS.headline) {
    const m = /\s(dari|untuk|dengan|yang|di|khusus|mulai)\s/i.exec(head.slice(8));
    if (m && m.index + 8 <= TEMPLATE_LIMITS.headline) {
      clauses.unshift(head.slice(m.index + 9));
      head = head.slice(0, m.index + 8);
    }
  }
  const sub = clauses.join(", ");
  return {
    headline: clip(
      cap(head.replace(/^(iklan|promosi|promo)\s+/i, (m) => m)),
      TEMPLATE_LIMITS.headline,
    ),
    subline: clip(first(sub), TEMPLATE_LIMITS.subline),
    badge: clip(badge, TEMPLATE_LIMITS.badge),
    cta: clip(cta, TEMPLATE_LIMITS.cta),
    mood: guessMood(prompt),
    items: itemsFromList(prompt, photos),
  };
}

/** Bersihkan hasil LLM ke batas & bentuk yang sama dengan pengurai aturan. */
export function normalizeDraft(
  raw: Partial<Record<keyof DraftText, unknown>>,
  prompt: string,
  photos = 0,
): DraftText {
  const s = (v: unknown) => (typeof v === "string" ? v.replace(/["“”]/g, "").trim() : "");
  const moods = ["energetic", "upbeat", "corporate", "calm", "cinematic", "chill"];
  const mood = s(raw.mood).toLowerCase();
  return {
    headline: clip(s(raw.headline), TEMPLATE_LIMITS.headline),
    subline: clip(s(raw.subline), TEMPLATE_LIMITS.subline),
    badge: clip(s(raw.badge), TEMPLATE_LIMITS.badge),
    cta: clip(s(raw.cta), TEMPLATE_LIMITS.cta),
    mood: moods.includes(mood) ? (mood as MusicMood) : guessMood(prompt),
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, photos).map((it: unknown) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        title: clip(s(o.title), PHOTOS.title),
        label: clip(s(o.label ?? o.price), PHOTOS.label),
      };
    }),
  };
}
