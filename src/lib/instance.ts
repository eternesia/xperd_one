/**
 * Instalasi XPERD di server klien (self-hosted): modul berlisensi & bentuk lisensi (murni, dipakai
 * pusat dan server klien).
 */

/** Modul yang bisa dilisensikan untuk instalasi klien → id modul aplikasi. */
export const LICENSE_MODULES = [
  { key: "purchase", name: "Pembelian (Purchase)", modules: ["procurement"] },
  { key: "inventory", name: "Persediaan (Inventory)", modules: ["inventory"] },
  { key: "production", name: "Produksi (Production)", modules: ["manufacturing"] },
  { key: "sales", name: "Penjualan (Sales)", modules: ["sales"] },
  { key: "accounting", name: "Akuntansi & Kas/Bank", modules: ["accounting", "cash-bank"] },
  { key: "report", name: "Laporan (Report)", modules: ["reporting"] },
] as const;
export type LicenseModuleKey = (typeof LICENSE_MODULES)[number]["key"];
export const LICENSE_MODULE_KEYS = LICENSE_MODULES.map((m) => m.key) as [
  LicenseModuleKey,
  ...LicenseModuleKey[],
];

/** Modul aplikasi yang selalu ada di instalasi klien (data induk). */
export const ALWAYS_MODULES = ["master-data"];

export interface LicensePayload {
  /** id instalasi di pusat */
  iid: string;
  client: string;
  modules: LicenseModuleKey[];
  max_users: number;
  /** YYYY-MM-DD; null = tanpa batas */
  expires_at: string | null;
  grace_days: number;
  /** waktu terbit (ISO) */
  iat: string;
}

/** Id modul aplikasi yang diizinkan lisensi. */
export function licensedAppModules(keys: readonly string[]): string[] {
  const out = new Set(ALWAYS_MODULES);
  for (const m of LICENSE_MODULES) if (keys.includes(m.key)) m.modules.forEach((x) => out.add(x));
  return [...out];
}

export type LicenseStatus = "valid" | "expiring" | "grace" | "expired" | "missing" | "invalid";

/** Status lisensi pada tanggal `today` (YYYY-MM-DD, WIB). */
export function licenseStatus(
  p: LicensePayload | null,
  today: string,
): { status: LicenseStatus; daysLeft: number | null } {
  if (!p) return { status: "missing", daysLeft: null };
  if (!p.expires_at) return { status: "valid", daysLeft: null };
  const days = Math.round((Date.parse(p.expires_at) - Date.parse(today)) / 86_400_000);
  if (days >= 14) return { status: "valid", daysLeft: days };
  if (days >= 0) return { status: "expiring", daysLeft: days };
  if (days >= -p.grace_days) return { status: "grace", daysLeft: days };
  return { status: "expired", daysLeft: days };
}
