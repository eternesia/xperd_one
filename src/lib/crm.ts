// Qalling CRM shared definitions + pure helpers (ported verbatim from the
// Business Suite Lovable export — no DB access, safe to import from the UI).

export interface CrmStage {
  id: string;
  en: string;
  id_: string;
  probability: number;
}

export const CRM_STAGES: CrmStage[] = [
  { id: "new", en: "New inquiry", id_: "Tanya Harga", probability: 10 },
  { id: "contacted", en: "Follow up", id_: "Follow Up", probability: 25 },
  { id: "qualified", en: "Consultation", id_: "Konsultasi", probability: 50 },
  { id: "proposal", en: "Quote / Invoice sent", id_: "Kirim Penawaran", probability: 70 },
  { id: "negotiation", en: "Awaiting payment", id_: "Nego / Tunggu Bayar", probability: 85 },
  { id: "won", en: "Closing / Deal", id_: "Closing", probability: 100 },
  { id: "lost", en: "Lost", id_: "Batal", probability: 0 },
];

export const CRM_SOURCES = [
  "website",
  "referral",
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "whatsapp",
  "offline",
];

export const CRM_ACTIVITY_TYPES = [
  { id: "call", en: "Call", id_: "Telepon" },
  { id: "whatsapp", en: "WhatsApp", id_: "WhatsApp" },
  { id: "email", en: "Email", id_: "Email" },
  { id: "meeting", en: "Meeting", id_: "Meeting" },
  { id: "note", en: "Note", id_: "Catatan" },
];

export function stageLabel(id: string, lang: string) {
  const s = CRM_STAGES.find((x) => x.id === id);
  if (!s) return id;
  return lang === "id" ? s.id_ : s.en;
}

/** Highest numeric suffix among existing LEAD-xxxx codes (0 when none). */
export function maxLeadNumber(codes: (string | null | undefined)[]) {
  let max = 0;
  for (const c of codes) {
    const m = /^LEAD-(\d+)$/i.exec((c ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Next lead code after the highest existing one; `offset` reserves extra numbers (e.g. bulk import). */
export function nextLeadCode(codes: (string | null | undefined)[], offset = 0) {
  return `LEAD-${String(maxLeadNumber(codes) + offset + 1).padStart(4, "0")}`;
}

export const CRM_BROADCAST_CHANNELS = [
  { id: "whatsapp", en: "WhatsApp", id_: "WhatsApp" },
  { id: "email", en: "Email", id_: "Email" },
  { id: "sms", en: "SMS", id_: "SMS" },
];

export const CRM_WA_PROVIDERS = [
  { id: "manual", en: "Manual (wa.me links)", id_: "Manual (tautan wa.me)" },
  { id: "kirimdev", en: "Kirimdev (official WhatsApp API)", id_: "Kirimdev (WhatsApp API resmi)" },
  { id: "custom", en: "Custom HTTP gateway", id_: "Gateway HTTP kustom" },
];

export const CRM_SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
];

export const CRM_CAMPAIGN_OBJECTIVES = [
  { id: "awareness", en: "Awareness", id_: "Awareness" },
  { id: "traffic", en: "Traffic", id_: "Trafik" },
  { id: "leads", en: "Lead generation", id_: "Cari prospek" },
  { id: "sales", en: "Sales", id_: "Penjualan" },
  { id: "retention", en: "Retention", id_: "Retensi" },
];

export const CRM_CAMPAIGN_STATUSES = ["draft", "scheduled", "running", "paused", "completed"];

export function normalizeWaNumber(raw: string) {
  const digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function renderBroadcastMessage(template: string, name: string) {
  return (template || "").replace(/\{\{\s*name\s*\}\}/gi, name || "");
}

export function waLink(phone: string, message: string) {
  return `https://wa.me/${normalizeWaNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/** mysql2 returns JSON columns as a parsed array/object; guard for a raw string too. */
export function parsePlatforms(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((p) => String(p));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((p) => String(p)) : [];
    } catch {
      return [];
    }
  }
  return [];
}
