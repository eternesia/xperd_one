export type TenantSource = "qalling" | "xperd" | "admin";
export function registrationSource(explicit?: TenantSource, notes?: string | null): TenantSource {
  if (explicit) return explicit;
  return notes === "qalling-google" || notes === "qalling-signup" ? "qalling" : "xperd";
}
export function tenantSourceLabel(source: string | null) {
  return source === "qalling" ? "Web Qalling" : source === "xperd" ? "Web XPERD" : source === "admin" ? "Super Admin" : "Belum diketahui";
}