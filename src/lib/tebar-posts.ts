/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pure helpers that turn Tebar post payloads into Qalling post rows. Field names are read defensively. */

export type TebarTarget = {
  account_id: string;
  status: string;
  permalink: string | null;
  error: string | null;
  post_id?: string;
};

export type MappedTebarPost = {
  external_id: string;
  title: string;
  caption: string;
  media_url: string | null;
  account_ids: string[];
  scheduled_at: string;
  published_at: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  permalinks: string[];
  last_error: string | null;
  results: { account_id: string; ok: boolean; id: string; permalink?: string; error?: string }[];
};

export function readTargets(raw: any): TebarTarget[] {
  const list = Array.isArray(raw?.targets) ? raw.targets : [];
  return list
    .map((t: any) => ({
      account_id: String(t?.account_id ?? t?.account?.id ?? ""),
      status: String(t?.status ?? "pending").toLowerCase(),
      permalink: (t?.permalink ?? t?.url ?? null) as string | null,
      error: (t?.error?.message ??
        t?.error_message ??
        t?.error_code ??
        (typeof t?.error === "string" ? t.error : null)) as string | null,
    }))
    .filter((t: TebarTarget) => t.account_id);
}

/** Collapses Tebar post + target statuses into Qalling's draft/scheduled/published/failed. */
export function deriveStatus(
  postStatus: string,
  targets: TebarTarget[],
): MappedTebarPost["status"] {
  const s = postStatus.toLowerCase();
  if (s === "draft") return "draft";
  if (!targets.length) {
    if (s === "published" || s === "completed") return "published";
    if (s === "failed") return "failed";
    return "scheduled";
  }
  const done = targets.filter((t) => t.status === "published");
  const failed = targets.filter((t) => t.status === "failed" || t.status === "error");
  const pending = targets.length - done.length - failed.length;
  if (pending > 0) return "scheduled";
  if (done.length > 0) return "published";
  return "failed";
}

/**
 * Maps a Tebar post to a Qalling row. Returns null when none of its targets belong to the
 * workspace (accountMap: Tebar account id → Qalling account id), so other tenants' posts never leak.
 */
export function mapTebarPost(raw: any, accountMap: Map<string, string>): MappedTebarPost | null {
  const id = raw?.id ? String(raw.id) : "";
  if (!id) return null;
  const targets = readTargets(raw).filter((t) => accountMap.has(t.account_id));
  if (!targets.length) return null;
  const own = (Array.isArray(raw.targets) ? raw.targets : []).find((t: any) =>
    accountMap.has(String(t?.account_id)),
  );
  const caption = String(raw.content || own?.content || raw.text || "");
  const media = (Array.isArray(raw.media) ? raw.media : []).filter((m: any) => !m?.expired);
  const mediaUrl = (media[0]?.public_url ??
    media[0]?.poster_url ??
    media[0]?.url ??
    raw.media_urls?.[0] ??
    null) as string | null;
  const targetPublished = (Array.isArray(raw.targets) ? raw.targets : [])
    .map((t: any) => t?.published_at)
    .filter(Boolean)
    .sort()[0] as string | undefined;
  const when = (raw.scheduled_at ??
    raw.published_at ??
    targetPublished ??
    raw.created_at ??
    new Date().toISOString()) as string;
  const status = deriveStatus(String(raw.status ?? ""), targets);
  const errors = targets
    .filter((t) => t.status === "failed" || t.status === "error")
    .map((t) => t.error ?? "Gagal");
  return {
    external_id: id,
    title: caption.split("\n")[0].slice(0, 80) || "Postingan Tebar",
    caption,
    media_url: mediaUrl,
    account_ids: targets.map((t) => accountMap.get(t.account_id)!),
    scheduled_at: when,
    published_at:
      status === "published" ? ((raw.published_at ?? targetPublished ?? when) as string) : null,
    status,
    permalinks: targets.map((t) => t.permalink).filter((p): p is string => !!p),
    last_error: errors.length ? errors.join("; ") : null,
    results: targets.map((t) => ({
      account_id: accountMap.get(t.account_id)!,
      ok: t.status !== "failed" && t.status !== "error",
      id,
      ...(t.permalink ? { permalink: t.permalink } : {}),
      ...(t.error ? { error: t.error } : {}),
    })),
  };
}
