/**
 * Publikasi postingan Qalling (BS New 11): akun Tebar lewat Tebar API, akun Meta native lewat
 * Graph API. Dipakai oleh server fn `publishPostNow` dan hook cron
 * `/api/public/hooks/social-publish`. Hanya boleh diimpor dari kode server (memakai token).
 * Media pustaka dibaca layanan eksternal lewat URL bertanda tangan 7 hari (`crm-media.server.ts`),
 * pengganti signed URL bucket Supabase.
 */
import { execute, executeOne, query, result } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { signMediaUrl } from "./crm-media.server";
import { workspaceHasQalling } from "./social-interactions.server";

/** Basis Graph API; bisa ditimpa (`META_GRAPH_BASE`) untuk server tiruan saat uji. */
export const GRAPH = (process.env.META_GRAPH_BASE ?? "https://graph.facebook.com/v21.0").replace(
  /\/$/,
  "",
);

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET") {
  const qs = new URLSearchParams(params);
  const res = await fetch(method === "GET" ? `${GRAPH}${path}?${qs}` : `${GRAPH}${path}`, {
    method,
    body: method === "POST" ? qs : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta error ${res.status}`);
  return json;
}
export { graph as metaGraph };

export async function verifyMetaApp(appId: string, appSecret: string) {
  const tok = await graph("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    grant_type: "client_credentials",
  });
  const app = await graph(`/${appId}`, { fields: "name", access_token: tok.access_token });
  return { appName: (app.name as string) ?? appId };
}

export interface PublishResultRow {
  account_id: string;
  ok: boolean;
  id?: string;
  permalink?: string;
  error?: string | null;
}
export interface PublishOutcome {
  ok: boolean;
  results: PublishResultRow[];
  title: string;
}

const parseArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** Mempublikasikan satu postingan ke semua akun yang dipilih (Tebar + Meta native). */
export async function publishPost(
  workspaceId: string,
  postId: string,
  origin: string,
): Promise<PublishOutcome> {
  const post = await executeOne<{
    id: string;
    title: string;
    caption: string | null;
    media_url: string | null;
    media_paths: unknown;
    account_ids: unknown;
  }>(
    "SELECT id, title, caption, media_url, media_paths, account_ids FROM crm_scheduled_posts WHERE id = ? AND workspace_id = ? LIMIT 1",
    [postId, workspaceId],
  );
  if (!post) throw new Error("Post not found");
  if (!(await workspaceHasQalling(workspaceId)))
    throw new Error("Qalling publishing entitlement is inactive");

  const ids = parseArr(post.account_ids);
  const accounts = ids.length
    ? await query<{ id: string; platform: string; external_id: string | null; source: string }>(
        "SELECT id, platform, external_id, source FROM crm_social_accounts WHERE workspace_id = ? AND id IN (?)",
        [workspaceId, ids],
      )
    : [];
  const tokens = ids.length
    ? await query<{ account_id: string; access_token: string }>(
        "SELECT account_id, access_token FROM crm_social_tokens WHERE account_id IN (?)",
        [ids],
      )
    : [];
  const tokenOf = new Map(tokens.map((t) => [t.account_id, t.access_token]));

  const caption = post.caption || post.title;
  const signed = parseArr(post.media_paths).map((p) => signMediaUrl(origin, p));
  const mediaUrls = [...(post.media_url ? [post.media_url] : []), ...signed];
  const firstMedia = mediaUrls[0] ?? null;
  const results: PublishResultRow[] = [];
  let externalId: string | null = null;

  const tebarAccs = accounts.filter((a) => a.source === "tebar" && a.external_id);
  if (tebarAccs.length) {
    const { getTebarKey, publishTebar } = await import("./tebar.server");
    const key = await getTebarKey();
    try {
      if (!key) throw new Error("Tebar connector belum aktif di Super Admin");
      const r = await publishTebar(
        key,
        postId,
        tebarAccs.map((a) => a.external_id as string),
        caption,
        mediaUrls,
      );
      externalId = r.postIds[0] ?? null;
      const byExt = new Map(r.targets.map((t) => [t.account_id, t]));
      for (const a of tebarAccs) {
        const t = byExt.get(a.external_id as string);
        results.push({
          account_id: a.id,
          ok: !!t?.ok,
          id: t?.post_id,
          ...(t?.permalink ? { permalink: t.permalink } : {}),
          ...(t && !t.ok ? { error: t.error } : !t ? { error: "Tidak ada respons Tebar" } : {}),
        });
      }
    } catch (e) {
      for (const a of tebarAccs)
        results.push({ account_id: a.id, ok: false, error: (e as Error).message });
    }
  }
  for (const a of accounts.filter((x) => x.source !== "tebar")) {
    const token = tokenOf.get(a.id);
    if (a.source !== "meta" || !token || !a.external_id) {
      results.push({ account_id: a.id, ok: false, error: "Account is not connected via Meta" });
      continue;
    }
    try {
      if (a.platform === "facebook") {
        const r = firstMedia
          ? await graph(
              `/${a.external_id}/photos`,
              { url: firstMedia, caption, access_token: token },
              "POST",
            )
          : await graph(
              `/${a.external_id}/feed`,
              { message: caption, access_token: token },
              "POST",
            );
        results.push({ account_id: a.id, ok: true, id: r.post_id ?? r.id });
      } else if (a.platform === "instagram") {
        if (!firstMedia) throw new Error("Instagram requires an image URL");
        const c = await graph(
          `/${a.external_id}/media`,
          { image_url: firstMedia, caption, access_token: token },
          "POST",
        );
        const r = await graph(
          `/${a.external_id}/media_publish`,
          { creation_id: c.id, access_token: token },
          "POST",
        );
        results.push({ account_id: a.id, ok: true, id: r.id });
      } else {
        results.push({
          account_id: a.id,
          ok: false,
          error: "Platform not supported for auto-posting",
        });
      }
    } catch (e) {
      results.push({ account_id: a.id, ok: false, error: (e as Error).message });
    }
  }
  if (results.length === 0)
    results.push({ account_id: "-", ok: false, error: "No accounts selected" });

  const ok = results.every((r) => r.ok);
  const anyOk = results.some((r) => r.ok);
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => r.error)
    .join("; ");
  await execute(
    `UPDATE crm_scheduled_posts SET status = ?, published_at = ?, last_error = ?, results = ?, permalinks = ?${externalId ? ", external_id = ?" : ""} WHERE id = ?`,
    [
      anyOk ? "published" : "failed",
      anyOk ? sqlDateTime() : null,
      ok ? null : errors,
      JSON.stringify(results),
      JSON.stringify(results.map((r) => r.permalink).filter((p): p is string => !!p)),
      ...(externalId ? [externalId] : []),
      postId,
    ],
  );
  return { ok, results, title: post.title };
}

/** Memproses postingan terjadwal yang jatuh tempo (bukan milik Tebar: Tebar menerbitkan sendiri). */
export async function publishDuePosts(
  origin: string,
  limit = 25,
): Promise<{ processed: number; ok: number; failed: number }> {
  const due = await execute<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM crm_scheduled_posts
      WHERE status = 'scheduled' AND source <> 'tebar' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC LIMIT ${Math.max(1, Math.min(limit, 100))}`,
  );
  let ok = 0;
  let failed = 0;
  for (const post of due) {
    // Klaim atomik: hanya satu pemanggil cron yang memproses baris ini.
    const claimed = await result(
      "UPDATE crm_scheduled_posts SET status = 'publishing' WHERE id = ? AND status = 'scheduled'",
      [post.id],
    );
    if (!claimed.affectedRows) continue;
    try {
      const outcome = await publishPost(post.workspace_id, post.id, origin);
      if (outcome.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
      await execute("UPDATE crm_scheduled_posts SET status = 'failed' WHERE id = ?", [post.id]);
    }
  }
  return { processed: due.length, ok, failed };
}
