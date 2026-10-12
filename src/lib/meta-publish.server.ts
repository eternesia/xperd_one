/**
 * #54/#55 (BS New 3): inti publikasi postingan terjadwal ke Meta.
 *
 * Dipakai dua jalur:
 * - server fn `publishPostNow` (tombol "Posting sekarang" di UI), dan
 * - hook `/api/public/hooks/social-publish` yang dipanggil cron/scheduler
 *   eksternal untuk memproses postingan yang jatuh tempo (pola di
 *   `docs/INTEROP-BOILERPLATE.md`).
 *
 * Hanya boleh diimpor dari kode server: memakai access token Meta.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export interface PublishOutcome {
  ok: boolean;
  results: { account_id: string; ok: boolean; error?: string | null }[];
  title: string;
}

/** Mempublikasikan satu postingan ke semua akun Meta yang dipilih. */
export async function publishPost(workspaceId: string, postId: string): Promise<PublishOutcome> {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const { sqlDateTime } = await import("@/lib/datetime");

  const post = await executeOne<{
    id: string;
    title: string;
    caption: string | null;
    media_url: string | null;
    account_ids: unknown;
  }>(
    "SELECT id, title, caption, media_url, account_ids FROM crm_scheduled_posts WHERE id = ? AND workspace_id = ? LIMIT 1",
    [postId, workspaceId],
  );
  if (!post) throw new Error(`Postingan ${postId} tidak ditemukan`);

  const ids: string[] = Array.isArray(post.account_ids)
    ? (post.account_ids as string[])
    : typeof post.account_ids === "string" && post.account_ids.trim()
      ? (JSON.parse(post.account_ids) as string[])
      : [];
  if (ids.length === 0) throw new Error("Pilih minimal satu akun tujuan");

  const placeholders = ids.map(() => "?").join(", ");
  const accounts = await execute<{
    id: string;
    platform: string;
    external_id: string | null;
    access_token: string | null;
  }>(
    `SELECT a.id, a.platform, a.external_id, t.access_token
       FROM crm_social_accounts a
       LEFT JOIN crm_social_tokens t ON t.account_id = a.id
      WHERE a.workspace_id = ? AND a.id IN (${placeholders})`,
    [workspaceId, ...ids],
  );

  const results: PublishOutcome["results"] = [];
  for (const account of accounts ?? []) {
    if (!account.access_token || !account.external_id) {
      results.push({ account_id: account.id, ok: false, error: "Akun belum terhubung ke Meta" });
      continue;
    }
    try {
      if (account.platform === "instagram") {
        const containerRes = await fetch(`${GRAPH}/${account.external_id}/media`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            image_url: post.media_url,
            caption: post.caption ?? "",
            access_token: account.access_token,
          }),
        });
        const container = (await containerRes.json()) as { id?: string; error?: { message?: string } };
        if (!container.id) throw new Error(container.error?.message ?? "Gagal membuat container Instagram");
        const publishRes = await fetch(`${GRAPH}/${account.external_id}/media_publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ creation_id: container.id, access_token: account.access_token }),
        });
        const published = (await publishRes.json()) as { id?: string; error?: { message?: string } };
        if (!published.id) throw new Error(published.error?.message ?? "Gagal mempublikasikan ke Instagram");
      } else {
        const feedRes = await fetch(`${GRAPH}/${account.external_id}/feed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: post.caption ?? "",
            link: post.media_url ?? undefined,
            access_token: account.access_token,
          }),
        });
        const feed = (await feedRes.json()) as { id?: string; error?: { message?: string } };
        if (!feed.id) throw new Error(feed.error?.message ?? "Gagal mempublikasikan ke Halaman");
      }
      results.push({ account_id: account.id, ok: true });
    } catch (err) {
      results.push({
        account_id: account.id,
        ok: false,
        error: err instanceof Error ? err.message : "Gagal mempublikasikan",
      });
    }
  }

  const ok = results.length > 0 && results.every((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  await execute(
    "UPDATE crm_scheduled_posts SET status = ?, last_error = ?, published_at = ?, results = ? WHERE id = ?",
    [
      ok ? "published" : "failed",
      failed.length ? failed.map((f) => f.error).filter(Boolean).join("; ") : null,
      ok ? sqlDateTime() : null,
      JSON.stringify(results),
      post.id,
    ],
  );

  return { ok, results, title: post.title };
}

/** Memproses semua postingan terjadwal yang sudah jatuh tempo. */
export async function publishDuePosts(limit = 20): Promise<{ processed: number; ok: number; failed: number }> {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const due = await execute<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM crm_scheduled_posts
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC LIMIT ${Math.max(1, Math.min(limit, 100))}`,
  );

  let ok = 0;
  let failed = 0;
  for (const post of due ?? []) {
    // Tandai sedang diproses supaya cron berikutnya tidak mengambil baris yang sama.
    await execute("UPDATE crm_scheduled_posts SET status = 'publishing' WHERE id = ? AND status = 'scheduled'", [post.id]);
    const claimed = await executeOne<{ status: string }>("SELECT status FROM crm_scheduled_posts WHERE id = ? LIMIT 1", [
      post.id,
    ]);
    if (claimed?.status !== "publishing") continue;
    try {
      const outcome = await publishPost(post.workspace_id, post.id);
      if (outcome.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
      await execute("UPDATE crm_scheduled_posts SET status = 'failed' WHERE id = ?", [post.id]);
    }
  }
  return { processed: due?.length ?? 0, ok, failed };
}
