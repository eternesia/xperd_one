/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeOne } from "@/integrations/mysql/pool";
import { targetEnhancementOptions, type FirstCommentOutcome } from "./post-enhancements";
import { mergePlatformOptions, type PlatformOptions } from "./platform-options";
import { accountPagePath, normalizeAccountPage } from "./tebar-account-page";

/** Basis API Tebar; dapat ditimpa (`TEBAR_API_BASE`) untuk server tiruan saat uji. */
export const TEBAR_API = (process.env.TEBAR_API_BASE ?? "https://api.tebar.app/v1").replace(
  /\/$/,
  "",
);

export type TebarAccount = {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  profile_url: string | null;
};

export async function tebarFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${TEBAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    const err = json?.error;
    const msg =
      (typeof err === "object" ? err?.message : err) ??
      json?.message ??
      `Tebar error ${res.status}`;
    const code = typeof err === "object" ? err?.code : json?.code;
    throw new Error(code && !String(msg).includes(code) ? `${msg} (${code})` : String(msg));
  }
  return json;
}

const profileHeader = (profile: string | null): Record<string, string> =>
  profile ? { "Tebar-Profile": profile } : {};

/** Satu halaman akun Tebar (kursor) untuk Admin → Tebar; tidak memuat semua akun sekaligus. */
export async function listTebarAccountPage(
  apiKey: string,
  cursor: string | null = null,
  limit = 25,
) {
  return normalizeAccountPage(await tebarFetch(apiKey, accountPagePath(cursor, limit)));
}

/** Normalises Tebar account rows; field names are read defensively. */
export async function listTebarAccounts(apiKey: string): Promise<TebarAccount[]> {
  const out: TebarAccount[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const json = await tebarFetch(
      apiKey,
      `/accounts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    const rows = (Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []) as any[];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        platform: String(r.platform ?? r.provider ?? "other").toLowerCase(),
        name: String(r.name ?? r.display_name ?? r.username ?? r.id),
        handle: r.username ?? r.handle ?? null,
        profile_url: r.profile_url ?? r.url ?? null,
      });
    }
    cursor = json.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

export async function getTebarKey(): Promise<string | null> {
  const row = await executeOne<{ api_key: string | null; status: string }>(
    "SELECT api_key, status FROM tebar_settings WHERE id = 'platform'",
  );
  return row?.api_key && row.status === "verified" ? row.api_key : null;
}

/** Profile that owns an account; posts and media must live in that same profile. */
async function accountProfile(apiKey: string, accountId: string): Promise<string | null> {
  try {
    const r = await tebarFetch(apiKey, `/accounts/${encodeURIComponent(accountId)}`);
    const a = r.data ?? r;
    return (a?.profile_id ?? a?.profile?.id ?? null) as string | null;
  } catch {
    return null;
  }
}

/** Imports a public (signed) URL into Tebar's media library and returns its media id. */
export async function uploadTebarMedia(apiKey: string, url: string, profile: string | null) {
  const r = await tebarFetch(apiKey, "/media/from-url", {
    method: "POST",
    headers: profileHeader(profile),
    body: JSON.stringify({ url }),
  });
  const id = r.id ?? r.data?.id;
  if (!id) throw new Error("Upload media ke Tebar gagal");
  return String(id);
}

export type TebarPublishTarget = {
  account_id: string;
  ok: boolean;
  pending?: boolean;
  post_id?: string;
  permalink?: string;
  error?: string;
  first_comment?: FirstCommentOutcome;
};

/**
 * Publishes now via Tebar: media is uploaded first (POST /posts only accepts media_ids),
 * and accounts are grouped per Tebar profile because one post may not mix profiles.
 */
export async function publishTebar(
  apiKey: string,
  postId: string,
  accountIds: string[],
  content: string,
  mediaUrls: string[],
  enhancements?: {
    firstComment: string;
    coverUrl?: string;
    platforms: Record<string, string>;
    title: string;
    platformOptions?: PlatformOptions | null;
  },
) {
  const groups = new Map<string, string[]>();
  for (const acc of accountIds) {
    const p = (await accountProfile(apiKey, acc)) ?? "";
    groups.set(p, [...(groups.get(p) ?? []), acc]);
  }
  const targets: TebarPublishTarget[] = [];
  const postIds: string[] = [];
  for (const [profile, accs] of groups) {
    try {
      const mediaIds: string[] = [];
      for (const url of mediaUrls.slice(0, 10))
        mediaIds.push(await uploadTebarMedia(apiKey, url, profile || null));
      const coverId = enhancements?.coverUrl
        ? await uploadTebarMedia(apiKey, enhancements.coverUrl, profile || null)
        : undefined;
      const body: Record<string, unknown> = {
        content,
        targets: accs.map((account_id) => {
          const base = enhancements
            ? targetEnhancementOptions(
                enhancements.platforms[account_id],
                enhancements.firstComment,
                coverId,
                enhancements.title,
              )
            : {};
          const options = enhancements
            ? mergePlatformOptions(
                enhancements.platforms[account_id],
                base,
                enhancements.platformOptions,
              )
            : base;
          return { account_id, ...(Object.keys(options).length ? { options } : {}) };
        }),
      };
      if (mediaIds.length) body.media_ids = mediaIds;
      const r = await tebarFetch(apiKey, "/posts", {
        method: "POST",
        headers: {
          ...profileHeader(profile || null),
          "Idempotency-Key": `xperd-${postId}-${profile || "default"}`,
        },
        body: JSON.stringify(body),
      });
      const p = r.data ?? r;
      const pid = String(p.id ?? "");
      if (!pid) throw new Error("Respons pengiriman belum dapat dikonfirmasi; jangan kirim ulang");
      postIds.push(pid);
      const tg = new Map<string, any>(
        (Array.isArray(p.targets) ? p.targets : []).map((t: any) => [String(t.account_id), t]),
      );
      for (const a of accs) {
        const t = tg.get(a);
        const failed = t?.status === "failed";
        targets.push({
          account_id: a,
          ok: !failed,
          pending: !failed && t?.status !== "published",
          post_id: pid,
          ...(t?.first_comment ? { first_comment: t.first_comment as FirstCommentOutcome } : {}),
          ...(t?.permalink ? { permalink: t.permalink } : {}),
          ...(failed ? { error: String(t?.error?.message ?? t?.error_code ?? "Gagal") } : {}),
        });
      }
    } catch (e) {
      accs.forEach((a) => targets.push({ account_id: a, ok: false, error: (e as Error).message }));
    }
  }
  return { postIds, targets };
}

/** Every post created through Tebar across all profiles (owner key); callers must filter by account. */
export async function listTebarPosts(apiKey: string, maxPages = 10) {
  const out: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const json = await tebarFetch(
      apiKey,
      `/posts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    out.push(...((Array.isArray(json.data) ? json.data : []) as any[]));
    cursor = json.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/** Ensures an isolated Tebar profile exists for a workspace (external_id = workspace id). */
export async function ensureTebarProfile(apiKey: string, workspaceId: string, name: string) {
  try {
    const r = await tebarFetch(apiKey, `/profiles/${encodeURIComponent(workspaceId)}`);
    const p = r.data ?? r;
    if (p?.id) return String(p.id);
  } catch {
    /* not found → create */
  }
  const r = await tebarFetch(apiKey, "/profiles", {
    method: "POST",
    body: JSON.stringify({ name, external_id: workspaceId }),
  });
  return String(r.id ?? r.data?.id ?? workspaceId);
}

export async function createTebarConnectLink(
  apiKey: string,
  workspaceId: string,
  redirectUrl: string,
  state: string,
  platforms?: string[],
) {
  const path = `/profiles/${encodeURIComponent(workspaceId)}/connect-links`;
  const body: Record<string, unknown> = { redirect_url: redirectUrl, state };
  if (platforms?.length) body.platforms = platforms;
  // Headless (white-label): langsung ke halaman OAuth jaringan. Butuh paket Tebar Agency; jika tidak memenuhi, pakai tautan standar.
  if (platforms?.length === 1) {
    try {
      const h = await tebarFetch(apiKey, path, {
        method: "POST",
        body: JSON.stringify({ ...body, headless: true }),
      });
      const d = h.data ?? h;
      const starts = (d.start_urls ?? {}) as Record<string, string>;
      const direct = starts[platforms[0]] ?? Object.values(starts)[0];
      if (direct)
        return {
          url: String(direct),
          expiresAt: (d.expires_at ?? null) as string | null,
          headless: true,
        };
    } catch {
      /* paket tidak memenuhi → tautan standar */
    }
  }
  const r = await tebarFetch(apiKey, path, { method: "POST", body: JSON.stringify(body) });
  return {
    url: String(r.url ?? r.data?.url),
    expiresAt: (r.expires_at ?? null) as string | null,
    headless: false,
  };
}

export async function registerTebarOrigin(apiKey: string, origin: string) {
  try {
    await tebarFetch(apiKey, "/connect/redirect-origins", {
      method: "POST",
      body: JSON.stringify({ origin }),
    });
  } catch {
    /* already registered */
  }
}

/** Accounts belonging to a workspace's Tebar profile only. */
export async function listProfileAccounts(
  apiKey: string,
  profileId: string,
  workspaceId: string,
): Promise<TebarAccount[]> {
  const json = await tebarFetch(
    apiKey,
    `/accounts?limit=100&profile_id=${encodeURIComponent(profileId)}`,
  );
  const rows = (Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []) as any[];
  return rows
    .filter((r) => {
      const pid = r.profile_id ?? r.profile?.id ?? null;
      const ext = r.profile?.external_id ?? null;
      return pid === profileId || ext === workspaceId; // never trust unscoped rows
    })
    .map((r) => ({
      id: String(r.id),
      platform: String(r.platform ?? r.provider ?? "other").toLowerCase(),
      name: String(r.name ?? r.display_name ?? r.username ?? r.id),
      handle: r.username ?? r.handle ?? null,
      profile_url: r.profile_url ?? r.url ?? null,
    }));
}
