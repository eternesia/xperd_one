/**
 * URL bersih untuk domain Qalling (BS New 16): di qalling.id alamat publik tanpa prefiks `/qalling` (`/`, `/harga`, `/login`, `/register`,
 * `/app/...`), sedangkan rute internal tetap `/qalling/*`. Dipakai sebagai `rewrite` router TanStack: server (SSR) dan klien (hydration)
 * menerjemahkan alamat yang sama, sehingga halaman tidak crash walau browser membuka `/harga` (atau proxy meneruskan `/qalling/harga`).
 * Domain XPERD dan endpoint non-halaman (`/api`, `/mcp`, `/oauth`, `/.well-known`) tidak disentuh.
 */
const DEFAULT_HOSTS = ["qalling.id", "www.qalling.id", "qalling.net", "www.qalling.net"];
// Tambahan opsional (dipisah koma) lewat VITE_QALLING_HOSTS agar tersedia juga di bundel klien.
const EXTRA_HOSTS = String(
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_QALLING_HOSTS) ||
    "",
)
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const HOSTS = new Set([...DEFAULT_HOSTS, ...EXTRA_HOSTS]);

export function isQallingHost(hostname: string): boolean {
  return HOSTS.has(hostname.toLowerCase());
}

/** Alamat internal (`/qalling/...`) → alamat publik bersih di domain Qalling. */
export function qallingPublicUrl(url: URL): URL {
  const result = new URL(url);
  if (!isQallingHost(result.hostname)) return result;
  if (result.pathname === "/qalling" || result.pathname === "/qalling/") result.pathname = "/";
  else if (result.pathname === "/qalling/daftar" || result.pathname === "/qalling/register")
    result.pathname = "/register";
  else if (result.pathname.startsWith("/qalling/"))
    result.pathname = result.pathname.slice("/qalling".length);
  return result;
}

/** Alamat publik bersih → alamat internal rute `/qalling/...`. */
export function qallingInternalUrl(url: URL): URL {
  const result = new URL(url);
  if (!isQallingHost(result.hostname)) return result;
  const path = result.pathname;
  if (path === "/") result.pathname = "/qalling/";
  else if (["/register", "/daftar", "/register/", "/daftar/", "/qalling/register"].includes(path))
    result.pathname = "/qalling/daftar";
  else if (
    /^\/(login|solusi|fitur|kelebihan|harga|kontak|testimoni|docs(\/[\w-]+)?)(\/)?$/.test(path)
  )
    result.pathname = `/qalling${path}`;
  else if (/^\/(approve|report)\/[a-f0-9]{48}\/?$/.test(path)) result.pathname = `/qalling${path}`;
  else if (
    (path === "/app" || path.startsWith("/app/")) &&
    !/^\/app\/(w|onboarding)(\/|$)/.test(path)
  )
    result.pathname = `/qalling${path}`;
  return result;
}

/** Bila permintaan di domain Qalling masih memakai prefiks `/qalling`, kembalikan alamat bersihnya (untuk redirect 301 opsional). */
export function qallingLegacyRedirect(
  hostname: string,
  pathname: string,
  search = "",
): string | null {
  if (!isQallingHost(hostname)) return null;
  if (pathname !== "/qalling" && !pathname.startsWith("/qalling/")) return null;
  const clean = qallingPublicUrl(new URL(`https://${hostname}${pathname}`));
  return `${clean.pathname}${search}`;
}

/** Path halaman Qalling untuk redirect dari server (mis. login Google): bersih di domain Qalling, `/qalling/...` di domain lain. */
export function qallingPagePath(hostname: string, internalPath: string): string {
  if (!isQallingHost(hostname)) return internalPath;
  const u = qallingPublicUrl(new URL(`https://${hostname}${internalPath}`));
  return `${u.pathname}${u.search}`;
}

export const qallingDomainRewrite = {
  input: ({ url }: { url: URL }) => qallingInternalUrl(url),
  output: ({ url }: { url: URL }) => qallingPublicUrl(url),
};
