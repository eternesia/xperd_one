/**
 * Batas panjang caption per platform (murni — dipakai composer, MCP, dan saat publikasi).
 * Sumber: aturan platform Tebar (get_platform_rules). Satu postingan bisa ke banyak akun, jadi
 * batas dicek per platform: akun yang melebihi batas gagal sendiri, akun lain tetap terbit.
 * Threads > 500 karakter otomatis dibagi menjadi utas (bagian lanjutan dikirim sebagai balasan).
 */

export interface CaptionRule {
  max: number;
  /** Batas saat ada media (Telegram: 1024 di samping media). */
  maxWithMedia?: number;
  unit: "chars" | "threads" | "x" | "bytes";
}

export const CAPTION_RULES: Record<string, CaptionRule> = {
  instagram: { max: 2200, unit: "chars" },
  tiktok: { max: 2200, unit: "chars" },
  threads: { max: 500, unit: "threads" },
  x: { max: 280, unit: "x" },
  twitter: { max: 280, unit: "x" },
  facebook: { max: 63206, unit: "chars" },
  linkedin: { max: 3000, unit: "chars" },
  youtube: { max: 5000, unit: "bytes" },
  pinterest: { max: 800, unit: "chars" },
  telegram: { max: 4096, maxWithMedia: 1024, unit: "chars" },
  discord: { max: 2000, unit: "chars" },
  bluesky: { max: 300, unit: "chars" },
};

/** Maks. bagian utas Threads: 1 postingan utama + 10 bagian lanjutan. */
export const THREADS_MAX_PARTS = 11;

const isEmojiLike = (cp: number) => cp >= 0x2000;
const utf8Bytes = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);
/** Rentang yang dihitung 1 oleh X (Latin, Yunani, Kiril, tanda baca umum); lainnya 2. */
const xLight = (cp: number) =>
  (cp >= 0 && cp <= 0x10ff) ||
  (cp >= 0x2000 && cp <= 0x200d) ||
  (cp >= 0x2010 && cp <= 0x201f) ||
  (cp >= 0x2032 && cp <= 0x2037);

/** Panjang caption seperti dihitung platform tersebut. */
export function captionLength(platform: string, text: string): number {
  const rule = CAPTION_RULES[platform];
  const unit = rule?.unit ?? "chars";
  if (unit === "bytes") return new TextEncoder().encode(text).length;
  if (unit === "x") {
    // Setiap tautan dihitung 23.
    let n = 0;
    const withoutUrls = text.replace(/https?:\/\/\S+/gi, () => {
      n += 23;
      return "";
    });
    for (const ch of withoutUrls) n += xLight(ch.codePointAt(0)!) ? 1 : 2;
    return n;
  }
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // Threads: emoji dihitung sebesar byte UTF-8-nya.
    n += unit === "threads" && isEmojiLike(cp) ? utf8Bytes(cp) : 1;
  }
  return n;
}

export function captionMax(platform: string, hasMedia: boolean): number | null {
  const rule = CAPTION_RULES[platform];
  if (!rule) return null;
  return hasMedia && rule.maxWithMedia ? rule.maxWithMedia : rule.max;
}

/** Posisi potong terbaik di `head`: paragraf → akhir kalimat → baris → spasi (≥ 40% panjang). */
function breakPoint(head: string, max: number): number {
  const min = Math.floor(Math.min(head.length, max) * 0.4);
  const para = head.lastIndexOf("\n\n");
  if (para >= min) return para + 2;
  let sentence = -1;
  for (const m of head.matchAll(/[.!?…]["')\]]?\s/g)) sentence = m.index! + m[0].length;
  if (sentence >= min) return sentence;
  const line = head.lastIndexOf("\n");
  if (line >= min) return line + 1;
  const space = head.lastIndexOf(" ");
  if (space >= min) return space + 1;
  return head.length;
}

/**
 * Bagi teks panjang Threads menjadi bagian ≤ 500 (di batas paragraf/kalimat/kata).
 * `null` bila tetap lebih dari 11 bagian.
 */
export function splitForThreads(text: string, max = 500): string[] | null {
  const len = (s: string) => captionLength("threads", s);
  const parts: string[] = [];
  let rest = text.trim();
  while (rest) {
    if (len(rest) <= max) {
      parts.push(rest);
      break;
    }
    // Cari potongan terpanjang ≤ max, mundur ke batas paragraf → kalimat → spasi.
    const chars = Array.from(rest);
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (len(chars.slice(0, mid).join("")) <= max) lo = mid;
      else hi = mid - 1;
    }
    const head = chars.slice(0, lo).join("");
    const cut = breakPoint(head, max);
    const piece = head.slice(0, cut).trim();
    parts.push(piece);
    rest = rest.slice(piece.length).trim();
    if (parts.length > THREADS_MAX_PARTS) return null;
  }
  return parts.length <= THREADS_MAX_PARTS ? parts : null;
}

export type CaptionVerdict =
  | { platform: string; ok: true; length: number; max: number }
  | { platform: string; ok: true; length: number; max: number; threadParts: number }
  | { platform: string; ok: false; length: number; max: number; error: string };

/** Hasil cek caption untuk satu platform. */
export function checkCaption(
  platform: string,
  text: string,
  opts: { hasMedia: boolean; threadsCustomParts?: boolean },
): CaptionVerdict | null {
  const max = captionMax(platform, opts.hasMedia);
  if (max === null || !text) return null;
  const length = captionLength(platform, text);
  if (length <= max) return { platform, ok: true, length, max };
  const label = PLATFORM_LABEL[platform] ?? platform;
  if (platform === "threads" && !opts.threadsCustomParts) {
    const parts = splitForThreads(text, max);
    if (parts) return { platform, ok: true, length, max, threadParts: parts.length };
  }
  return {
    platform,
    ok: false,
    length,
    max,
    error: `Caption ${length} karakter melebihi batas ${label} ${max}${
      platform === "telegram" && opts.hasMedia ? " (dengan media)" : ""
    }`,
  };
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  threads: "Threads",
  x: "X",
  twitter: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  pinterest: "Pinterest",
  telegram: "Telegram",
  discord: "Discord",
  bluesky: "Bluesky",
};

/** Peringatan untuk semua platform yang dipilih (satu entri per platform). */
export function captionWarnings(
  platforms: string[],
  text: string,
  opts: { hasMedia: boolean; threadsCustomParts?: boolean },
): string[] {
  const out: string[] = [];
  for (const p of [...new Set(platforms)]) {
    const v = checkCaption(p, text, opts);
    if (!v) continue;
    if (!v.ok)
      out.push(`${v.error}: akun ${PLATFORM_LABEL[p] ?? p} akan gagal, akun lain tetap terbit.`);
    else if ("threadParts" in v)
      out.push(
        `Threads: caption ${v.length}/${v.max} karakter akan dibagi otomatis menjadi utas ${v.threadParts} bagian.`,
      );
  }
  return out;
}
