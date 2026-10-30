export function publicWebsite(path: string): "qalling" | "xperd" | null {
  if (
    /^\/(app(?:-admin)?|auth|register|login)(\/|$)/.test(path) ||
    /^\/qalling\/(app|login|daftar)(\/|$)/.test(path) ||
    path.startsWith("/api/")
  )
    return null;
  return path.startsWith("/qalling") ? "qalling" : "xperd";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validasi kunjungan di server (padanan fungsi SQL `record_website_visit`). */
export function acceptVisit(
  v: Record<string, unknown>,
): { ok: true; row: [string, string, string, string, string, string] } | { ok: false } {
  const id = String(v.id ?? "");
  const site = String(v.site ?? "");
  const path = String(v.path ?? "");
  const session = String(v.session ?? "");
  const referrer = String(v.referrer ?? "").slice(0, 200);
  const device = String(v.device ?? "");
  if (
    !UUID.test(id) ||
    !UUID.test(session) ||
    (site !== "xperd" && site !== "qalling") ||
    (device !== "mobile" && device !== "desktop")
  )
    return { ok: false };
  if (!path.startsWith("/") || path.length > 200 || /[?#]/.test(path)) return { ok: false };
  if (
    /^\/(app(-admin)?|auth|register|login|api)(\/|$)/.test(path) ||
    /^\/qalling\/(app|login|daftar)(\/|$)/.test(path)
  )
    return { ok: false };
  if (
    (path.startsWith("/qalling") && site !== "qalling") ||
    (!path.startsWith("/qalling") && site !== "xperd")
  )
    return { ok: false };
  return { ok: true, row: [id, site, path, session, referrer, device] };
}
