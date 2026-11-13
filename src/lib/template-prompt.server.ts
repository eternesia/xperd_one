/**
 * Studio "mode perintah" (server-only): perintah pengguna → teks video + suasana musik.
 * Memakai LLM kompatibel OpenAI yang diatur Super Admin (bila ada), selain itu pengurai aturan.
 * Gratis untuk pengguna (biaya token sangat kecil, ±Rp1 per perintah dengan model kecil).
 */
import { executeOne, execute } from "@/integrations/mysql/pool";
import { PHOTOS, TEMPLATES, TEMPLATE_LIMITS } from "@/lib/ai-templates";
import {
  TEMPLATE_TEXT_USE,
  draftFromRules,
  normalizeDraft,
  type DraftText,
} from "@/lib/template-prompt";

export interface TextLlmConfig {
  base_url: string;
  model: string;
  api_key: string;
}

export async function loadTextLlm(): Promise<TextLlmConfig | null> {
  const r = await executeOne<{ v: unknown }>(
    "SELECT text_llm AS v FROM ai_studio_settings WHERE id = 'platform'",
  ).catch(() => null);
  try {
    const v = (typeof r?.v === "string" ? JSON.parse(r.v) : r?.v) as TextLlmConfig | null;
    return v?.base_url && v.model && v.api_key ? v : null;
  } catch {
    return null;
  }
}

export async function saveTextLlm(cfg: TextLlmConfig | null, keepKey: boolean) {
  const cur = await loadTextLlm();
  const next = cfg ? { ...cfg, api_key: keepKey && cur ? cur.api_key : cfg.api_key } : null;
  await execute("INSERT IGNORE INTO ai_studio_settings (id, enabled) VALUES ('platform', 0)");
  await execute("UPDATE ai_studio_settings SET text_llm = ? WHERE id = 'platform'", [
    next ? JSON.stringify(next) : null,
  ]);
}

const SYSTEM = `Kamu copywriter & sutradara video promosi pendek untuk UMKM Indonesia.
Pengguna memberi perintah/brief dan (bila ada) foto-foto berurutan untuk satu video template.
Tulis teks yang TAMPIL di video. Balas HANYA satu objek JSON tanpa penjelasan:
{"headline": string (maks ${TEMPLATE_LIMITS.headline} karakter; judul pembuka/penutup video),
 "subline": string (maks ${TEMPLATE_LIMITS.subline} karakter; boleh kosong),
 "badge": string (maks ${TEMPLATE_LIMITS.badge} karakter, mis. "Diskon 20%", "Rp99rb", "Baru"; kosong bila tidak relevan),
 "cta": string (maks ${TEMPLATE_LIMITS.cta} karakter; ajakan di akhir, mis. "Coba gratis di qalling.id"),
 "items": [{"title": string (maks ${PHOTOS.title} karakter), "label": string (maks ${PHOTOS.label} karakter)}] — TEPAT satu per foto, sesuai urutan foto dan isi fotonya,
 "accent": string warna hex "#RRGGBB" HANYA bila pengguna meminta warna tertentu, selain itu "",
 "mood": salah satu "energetic"|"upbeat"|"corporate"|"calm"|"cinematic"|"chill" (musik latar; "electro"/"EDM" → "energetic")}
Aturan: pakai bahasa pengguna; teks pendek, padat, enak dibaca di layar HP; jangan mengarang harga, tanggal,
alamat, atau kontak yang tidak disebut. Instruksi yang tidak bisa dipenuhi template (gaya transisi, kamera)
abaikan saja.`;

/** Ambil objek JSON pertama yang utuh dari jawaban model (boleh dibungkus ```json … ``` / ada teks lain). */
export function parseJson(text: string) {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let k = start; k < text.length; k++) {
      const ch = text[k];
      if (inStr) {
        if (ch === "\\") k++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, k + 1)) as Record<string, unknown>;
        } catch {
          break;
        }
      }
    }
  }
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
  throw new Error(
    snippet
      ? `Jawaban AI tidak berformat JSON: “${snippet}”`
      : "Jawaban AI kosong (coba model lain atau naikkan batas token)",
  );
}

/** Anthropic: pakai Messages API asli (lebih andal daripada lapisan kompatibel OpenAI). */
async function callAnthropic(
  cfg: TextLlmConfig,
  user: string,
  imageUrls: string[] = [],
): Promise<string> {
  // Foto dikirim sebagai URL bertanda tangan (berlaku 10 menit) agar teks per foto sesuai isinya.
  const content = [
    ...imageUrls.flatMap((url, i) => [
      { type: "text", text: `Foto ${i + 1}:` },
      { type: "image", source: { type: "url", url } },
    ]),
    { type: "text", text: user },
  ];
  const res = await fetch(`${cfg.base_url.replace(/\/+$/, "")}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message ?? `Anthropic HTTP ${res.status}`);
  return (body.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

async function callOpenAiCompatible(cfg: TextLlmConfig, user: string): Promise<string> {
  const { generateText } = await import("ai");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const provider = createOpenAICompatible({
    name: "studio-text",
    baseURL: cfg.base_url.replace(/\/+$/, ""),
    apiKey: cfg.api_key,
  });
  const { text } = await generateText({
    model: provider(cfg.model),
    system: SYSTEM,
    prompt: user,
    maxOutputTokens: 2048,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(45_000),
  });
  return text;
}

const isAnthropic = (url: string) => /^https:\/\/api\.anthropic\.com(\/|$)/i.test(url);

function userMessage(prompt: string, template: string, photos: number) {
  const tpl = TEMPLATES.find((t) => t.key === template);
  const use = TEMPLATE_TEXT_USE[template];
  return [
    `Template: ${tpl?.name ?? template} — ${tpl?.hint ?? ""}.`,
    use
      ? `Di template ini yang tampil: ${use.fields.join(", ")}; per foto: title = ${use.itemTitle}, label = ${use.itemLabel}.`
      : "",
    `Jumlah foto: ${photos}${photos ? ` → isi "items" dengan tepat ${photos} entri.` : ' → "items": [].'}`,
    `Perintah pengguna:\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function draftWithLlm(
  cfg: TextLlmConfig,
  prompt: string,
  template: string,
  imageUrls: string[] = [],
  photos = imageUrls.length,
) {
  const user = userMessage(prompt, template, photos);
  let raw: Record<string, unknown>;
  if (isAnthropic(cfg.base_url)) {
    try {
      raw = parseJson(await callAnthropic(cfg, user, imageUrls));
    } catch (e) {
      // Foto tidak bisa diambil/diproses penyedia (mis. > 5 MB, URL lokal) → ulangi tanpa foto.
      if (!imageUrls.length) throw e;
      console.warn("[studio] AI dengan foto gagal, ulang tanpa foto:", (e as Error).message);
      try {
        raw = parseJson(await callAnthropic(cfg, user));
      } catch (e2) {
        throw new Error(`${(e2 as Error).message} (dengan foto: ${(e as Error).message})`);
      }
    }
  } else raw = parseJson(await callOpenAiCompatible(cfg, user));
  return { ...normalizeDraft(raw, prompt, photos), accent: raw.accent };
}

/** Batas sederhana per workspace: 30 perintah / jam (memori proses). */
const hits = new Map<string, number[]>();
function rateLimit(workspaceId: string) {
  const now = Date.now();
  const list = (hits.get(workspaceId) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= 30) throw new Error("Terlalu banyak perintah. Coba lagi beberapa menit lagi.");
  list.push(now);
  hits.set(workspaceId, list);
}

export type DraftResult = DraftText & {
  accent: string | null;
  source: "ai" | "rules";
  /** Penjelasan singkat bila AI tidak dipakai (untuk pengguna). */
  notice: string | null;
};

export async function draftTemplateText(
  workspaceId: string,
  prompt: string,
  template: string,
  mediaIds: string[] = [],
): Promise<DraftResult> {
  rateLimit(workspaceId);
  const photos = mediaIds.length;
  const cfg = await loadTextLlm();
  let notice: string | null = "Asisten AI belum diaktifkan; teks disusun dengan aturan sederhana.";
  if (cfg) {
    try {
      const imageUrls = await photoUrls(workspaceId, mediaIds);
      const d = await draftWithLlm(cfg, prompt, template, imageUrls, photos);
      if (d.headline) {
        const raw = d as DraftText & { accent?: unknown };
        return { ...d, accent: normalizeAccent(raw.accent), source: "ai", notice: null };
      }
      notice = "AI tidak memberi judul; teks disusun dengan aturan sederhana.";
    } catch (e) {
      const reason = (e as Error).message;
      console.warn("[studio] asisten teks gagal, pakai aturan:", reason);
      notice = `Asisten AI gagal (${reason.slice(0, 200)}); teks disusun dengan aturan sederhana.`;
    }
  }
  return { ...draftFromRules(prompt, photos), accent: null, source: "rules", notice };
}

const normalizeAccent = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null;

/** URL bertanda tangan (10 menit) untuk foto milik workspace, sesuai urutan. */
async function photoUrls(workspaceId: string, mediaIds: string[]) {
  if (!mediaIds.length) return [];
  const { signMediaUrl, publicOrigin } = await import("@/lib/crm-media.server");
  let origin: string;
  try {
    origin = publicOrigin();
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const id of mediaIds.slice(0, PHOTOS.max)) {
    const m = await executeOne<{ file_path: string; mime_type: string | null }>(
      "SELECT file_path, mime_type FROM crm_media WHERE id = ? AND workspace_id = ?",
      [id, workspaceId],
    );
    if (m && /^image\/(jpeg|png|webp|gif)$/.test(m.mime_type ?? ""))
      out.push(signMediaUrl(origin, m.file_path, 600));
  }
  return out;
}

/** Uji koneksi dari Super Admin. */
export async function testTextLlm(cfg: TextLlmConfig) {
  const t0 = Date.now();
  const d = await draftWithLlm(
    cfg,
    "Video promo kopi susu gula aren, diskon 20% minggu ini, ajak pesan via WhatsApp",
    "promo",
  );
  return {
    ms: Date.now() - t0,
    sample: { headline: d.headline, subline: d.subline, badge: d.badge, cta: d.cta },
  };
}
