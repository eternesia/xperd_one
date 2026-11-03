export type Entitlement = {
  tier: string | null;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
};
export type Entitlements = Record<string, Entitlement>;
export function isLiveAddon(
  row: { status: string; starts_at: string; ends_at: string | null },
  today: string,
) {
  return (
    (row.status === "active" || row.status === "trial") &&
    row.starts_at <= today &&
    (row.ends_at === null || row.ends_at >= today)
  );
}
export const CRM_FEATURES: Record<string, string> = {
  leads: "crm",
  pipeline: "crm",
  contacts: "crm",
  "follow-ups": "crm",
  targets: "crm",
  broadcast: "whatsapp",
  "wa-gateway": "whatsapp",
  templates: "templates",
  "post-scheduler": "publishing",
  media: "publishing",
  "social-accounts": "publishing",
  ideas: "ideas_campaigns",
  campaigns: "ideas_campaigns",
  comments: "comments",
  inbox: "inbox_dm",
  automations: "automations",
  "social-dashboard": "insights",
  tenders: "tender",
  "doc-library": "tender",
  calendar: "publishing",
  clients: "publishing",
  reports: "insights",
  ai: "mcp_api",
  team: "publishing",
};
export function hasCatalogFeature(
  entitlements: Entitlements,
  moduleId: string,
  submoduleId: string,
) {
  if (moduleId !== "crm") return true;
  const entitlement = entitlements.qalling;
  if (!entitlement) return false;
  return (
    entitlement.features.legacy === true ||
    entitlement.features[CRM_FEATURES[submoduleId] ?? "crm"] === true
  );
}
export function validateTierPrice(
  price: number,
  accounts: number | null,
  peers: Array<{ monthly_price: number; limits: Record<string, number | null> }>,
) {
  if (!Number.isSafeInteger(price) || price < 0)
    throw new Error("Harga harus rupiah bulat, tidak negatif");
  if (accounts == null) return;
  for (const peer of peers) {
    const capacity = peer.limits.max_accounts;
    if (capacity == null) continue;
    if (
      (capacity < accounts && peer.monthly_price >= price) ||
      (capacity > accounts && peer.monthly_price <= price)
    )
      throw new Error("Harga harus meningkat sesuai kapasitas akun");
  }
} /** Storage allowance in bytes (decimal GB, matching the server quota check); null = unlimited. */
export function storageQuota(limits: Record<string, number | null> | undefined, usedBytes: number) {
  const gb = limits?.storage_gb;
  if (gb == null) return { capBytes: null, usedBytes, remainingBytes: null, percent: 0 };
  const capBytes = gb * 1_000_000_000;
  return {
    capBytes,
    usedBytes,
    remainingBytes: Math.max(0, capBytes - usedBytes),
    percent: Math.min(100, Math.round((usedBytes / capBytes) * 100)),
  };
}
/** True when another social account would exceed the plan; null limit = unlimited. */
export function accountsFull(
  limits: Record<string, number | null> | undefined,
  activeCount: number,
) {
  const cap = limits?.max_accounts;
  return cap != null && activeCount >= cap;
}

/** Hari berjalan → prorata (padanan `proratedCharge` New 11 `subscription-rules.ts`). */
export function proratedCharge(
  newPrice: number,
  oldPrice: number,
  months: number,
  remaining: number,
  days: number,
) {
  if (![1, 3, 6, 12].includes(months) || days <= 0 || remaining < 1 || newPrice < 0 || oldPrice < 0)
    throw new Error("Invalid proration");
  return Math.round((Math.max(0, newPrice - oldPrice) * months * remaining) / days);
}

/** Rincian harga paket/opsi add-on (hasil `billing_quote`). */
export interface BillingQuote {
  kind: "tier" | "option";
  item: string;
  quantity: number;
  action: "purchase" | "scheduled" | "unchanged";
  monthly_price: number;
  charge: number;
  period_start: string;
  period_end: string;
  remaining_days: number;
  total_days: number;
  subscription: string;
  name: string;
  usage_warning: boolean;
}
