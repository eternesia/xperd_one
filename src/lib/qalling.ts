// #64 (BS New 3): permukaan Qalling standalone — landing `/qalling`, login
// `/qalling/login`, dan shell aplikasi `/qalling/app` yang memakai ulang view CRM
// (`CrmView` / `CrmDashboardView`) beserta izin & add-on yang sudah ada.
//
// Daftar host dapat diatur lewat env `VITE_QALLING_HOSTS` (dipisah koma) supaya
// domain final (qalling.id / qalling.net atau domain lain) bisa ditentukan
// belakangan tanpa mengubah kode. Pemetaan host → `/qalling` yang paling andal
// tetap dilakukan di reverse proxy produksi; redirect di klien di sini hanya
// jaring pengaman.

export const DEFAULT_QALLING_HOSTS = ["qalling.id", "www.qalling.id", "qalling.net", "www.qalling.net"];

/** Host yang dianggap sebagai permukaan Qalling (default + `VITE_QALLING_HOSTS`). */
export function qallingHosts(): string[] {
  const raw = (import.meta.env.VITE_QALLING_HOSTS as string | undefined) ?? "";
  const extra = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.length > 0 ? extra : DEFAULT_QALLING_HOSTS;
}

export function isQallingHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  return qallingHosts().includes(host);
}

/** True bila path sudah berada di dalam permukaan Qalling (tidak perlu redirect). */
export function isQallingPath(pathname: string): boolean {
  return pathname === "/qalling" || pathname.startsWith("/qalling/");
}
