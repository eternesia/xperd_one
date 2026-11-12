/**
 * Studio "mode perintah" (server-only): perintah pengguna → teks video + suasana musik.
 * Memakai LLM kompatibel OpenAI yang diatur Super Admin (bila ada), selain itu pengurai aturan.
 * Gratis untuk pengguna (biaya token sangat kecil, ±Rp1 per perintah dengan model kecil).
 */
import { executeOne, execute } from "@/integrations/mysql/pool";
import { TEMPLATES, TEMPLATE_LIMITS } from "@/lib/ai-templates";
import { draftFromRules, normalizeDraft, type DraftText } from "@/lib/template-prompt";

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

const SYSTEM = `Kamu copywriter video promosi pendek untuk UMKM Indonesia.
Dari perintah pengguna, tulis teks untuk video template. Balas HANYA JSON tanpa penjelasan:
{"headline": string (maks ${TEMPLATE_LIMITS.headline} karakter, inti pesan, menarik),
 "subline": string (maks ${TEMPLATE_LIMITS.subline} karakter, pelengkap/keterangan; boleh kosong),
 "badge": string (maks ${TEMPLATE_LIMITS.badge} karakter, mis. "Diskon 20%", "Rp99rb", "Baru"; kosong bila tidak ada),
 "cta": string (maks ${TEMPLATE_LIMITS.cta} karakter, ajakan bertindak, mis. "Pesan via WhatsApp"; kosong bila tidak ada),
 "mood": salah satu "energetic"|"upbeat"|"corporate"|"calm"|"cinematic"|"chill" (suasana musik latar)}
Gunakan bahasa perintah pengguna. Jangan mengarang harga, tanggal, alamat, atau kontak yang tidak disebut.`;

async function draftWithLlm(cfg: TextLlmConfig, prompt: string, template: string) {
  const { generateText } = await import("ai");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const provider = createOpenAICompatible({
    name: "studio-text",
    baseURL: cfg.base_url.replace(/\/+$/, ""),
    apiKey: cfg.api_key,
    // Anthropic (endpoint kompatibel OpenAI) juga menerima header ini.
    headers: { "anthropic-version": "2023-06-01" },
  });
  const tpl = TEMPLATES.find((t) => t.key === template);
  const { text } = await generateText({
    model: provider(cfg.model),
    system: SYSTEM,
    prompt: `Template: ${tpl?.name ?? template} (${tpl?.hint ?? ""}).\nPerintah: ${prompt}`,
    maxOutputTokens: 300,
    maxRetries: 0,
    temperature: 0.7,
    abortSignal: AbortSignal.timeout(15_000),
  });
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw new Error("Jawaban AI tidak berformat JSON");
  return normalizeDraft(JSON.parse(json), prompt);
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

export async function draftTemplateText(
  workspaceId: string,
  prompt: string,
  template: string,
): Promise<DraftText & { source: "ai" | "rules" }> {
  rateLimit(workspaceId);
  const cfg = await loadTextLlm();
  if (cfg) {
    try {
      const d = await draftWithLlm(cfg, prompt, template);
      if (d.headline) return { ...d, source: "ai" };
    } catch (e) {
      console.warn("[studio] asisten teks gagal, pakai aturan:", (e as Error).message);
    }
  }
  return { ...draftFromRules(prompt), source: "rules" };
}

/** Uji koneksi dari Super Admin. */
export async function testTextLlm(cfg: TextLlmConfig) {
  const t0 = Date.now();
  const d = await draftWithLlm(
    cfg,
    "Video promo kopi susu gula aren, diskon 20% minggu ini",
    "promo",
  );
  return { ms: Date.now() - t0, sample: d };
}
