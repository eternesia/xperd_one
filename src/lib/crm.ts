// Qalling CRM shared definitions + pure helpers (ported verbatim from the
// Business Suite Lovable export — no DB access, safe to import from the UI).

export interface CrmStage {
  id: string;
  en: string;
  id_: string;
  probability: number;
}

export const CRM_STAGES: CrmStage[] = [
  { id: "new", en: "New", id_: "Baru", probability: 10 },
  { id: "contacted", en: "Contacted", id_: "Dihubungi", probability: 25 },
  { id: "qualified", en: "Qualified", id_: "Terkualifikasi", probability: 50 },
  { id: "proposal", en: "Proposal", id_: "Penawaran", probability: 70 },
  { id: "negotiation", en: "Negotiation", id_: "Negosiasi", probability: 85 },
  { id: "won", en: "Won", id_: "Menang", probability: 100 },
  { id: "lost", en: "Lost", id_: "Kalah", probability: 0 },
];

export const CRM_SOURCES = ["website", "referral", "instagram", "tiktok", "facebook", "linkedin", "whatsapp", "offline"];

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

export function nextLeadCode(count: number) {
  return `LEAD-${String(count + 1).padStart(4, "0")}`;
}

export const CRM_BROADCAST_CHANNELS = [
  { id: "whatsapp", en: "WhatsApp", id_: "WhatsApp" },
  { id: "email", en: "Email", id_: "Email" },
  { id: "sms", en: "SMS", id_: "SMS" },
];

export const CRM_WA_PROVIDERS = [
  { id: "manual", en: "Manual (wa.me links)", id_: "Manual (tautan wa.me)" },
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
