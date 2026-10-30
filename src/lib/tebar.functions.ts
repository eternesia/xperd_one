/**
 * Konektor Tebar (BS New 11): Super Admin menyimpan API key platform dan menetapkan akun ke
 * workspace; tenant menghubungkan akun lewat Connect Link Tebar (satu profil Tebar per workspace,
 * `external_id` = id workspace). API key hanya dibaca server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function assertSuperAdmin(userId: string) {
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await hasRole(userId, "admin"))) throw new Error("Hanya Super Admin");
}
async function assertWsWriter(workspaceId: string, userId: string) {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasQalling } = await import("@/lib/social-interactions.server");
  if (!(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Tidak punya akses ke workspace ini");
  if (!(await workspaceHasQalling(workspaceId)))
    throw new Error("Paket Qalling tidak mengizinkan publikasi sosial");
}
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export const getTebarAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { listTebarAccounts } = await import("@/lib/tebar.server");
    const s = await executeOne<{
      api_key: string | null;
      status: string;
      last_error: string | null;
      verified_at: string | null;
    }>("SELECT api_key, status, last_error, verified_at FROM tebar_settings WHERE id = 'platform'");
    const ws = await execute<{ id: string; name: string }>(
      "SELECT id, name FROM workspaces ORDER BY name",
    );
    const assigned = await execute<{ external_id: string; workspace_id: string }>(
      "SELECT external_id, workspace_id FROM crm_social_accounts WHERE source = 'tebar'",
    );
    let accounts: Awaited<ReturnType<typeof listTebarAccounts>> = [];
    let fetchError: string | null = null;
    if (s?.api_key && s.status === "verified") {
      try {
        accounts = await listTebarAccounts(s.api_key);
      } catch (e) {
        fetchError = (e as Error).message;
      }
    }
    return {
      hasKey: !!s?.api_key,
      status: s?.status ?? "none",
      lastError: fetchError ?? s?.last_error ?? null,
      verifiedAt: iso(s?.verified_at),
      accounts,
      workspaces: ws.map((w) => ({ id: String(w.id), name: String(w.name) })),
      assignments: Object.fromEntries(
        assigned.map((a) => [String(a.external_id), String(a.workspace_id)]),
      ) as Record<string, string>,
    };
  });

export const saveTebarKey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { apiKey: string }) => {
    const apiKey = String(d?.apiKey ?? "").trim();
    if (apiKey.length < 10 || apiKey.length > 300) throw new Error("Input tidak valid");
    return { apiKey };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const { listTebarAccounts } = await import("@/lib/tebar.server");
    let status = "verified";
    let lastError: string | null = null;
    let count = 0;
    try {
      count = (await listTebarAccounts(data.apiKey)).length;
    } catch (e) {
      status = "invalid";
      lastError = (e as Error).message;
    }
    await execute(
      `INSERT INTO tebar_settings (id, api_key, status, last_error, verified_at) VALUES ('platform', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE api_key = VALUES(api_key), status = VALUES(status), last_error = VALUES(last_error), verified_at = VALUES(verified_at)`,
      [data.apiKey, status, lastError, status === "verified" ? sqlDateTime() : null],
    );
    return { status, lastError, count };
  });

interface AssignInput {
  tebarId: string;
  platform: string;
  name: string;
  handle: string | null;
  profileUrl: string | null;
  workspaceId: string | null;
}
export const assignTebarAccount = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: AssignInput) => {
    if (!d?.tebarId || d.tebarId.length > 200 || (d.workspaceId !== null && !isId(d.workspaceId)))
      throw new Error("Input tidak valid");
    return {
      tebarId: d.tebarId,
      platform: String(d.platform ?? "").slice(0, 50),
      name: String(d.name ?? "").slice(0, 200),
      handle: d.handle ? String(d.handle).slice(0, 200) : null,
      profileUrl: d.profileUrl ? String(d.profileUrl).slice(0, 500) : null,
      workspaceId: d.workspaceId,
    };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await execute("DELETE FROM crm_social_accounts WHERE source = 'tebar' AND external_id = ?", [
      data.tebarId,
    ]);
    if (data.workspaceId) {
      const { assertAccountQuota } = await import("@/lib/qalling-quota.server");
      await assertAccountQuota(data.workspaceId);
      await execute(
        `INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, profile_url, external_id, source, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'tebar', 'connected')`,
        [
          uuid(),
          data.workspaceId,
          data.platform,
          data.name,
          data.handle,
          data.profileUrl,
          data.tebarId,
        ],
      );
    }
    return { ok: true };
  });

export const getTebarStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { getTebarKey } = await import("@/lib/tebar.server");
    return { ready: !!(await getTebarKey()) };
  });

export const startTebarConnect = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; returnUrl: string; platforms?: string[] }) => {
    if (!isId(d?.workspaceId) || !d.returnUrl) throw new Error("Input tidak valid");
    try {
      new URL(d.returnUrl);
    } catch {
      throw new Error("Input tidak valid");
    }
    return { ...d, platforms: (d.platforms ?? []).slice(0, 10).map((p) => String(p).slice(0, 30)) };
  })
  .handler(async ({ data, context }) => {
    await assertWsWriter(data.workspaceId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const t = await import("@/lib/tebar.server");
    const key = await t.getTebarKey();
    if (!key) throw new Error("Koneksi sosial belum diaktifkan oleh admin XPERD");
    const ws = await executeOne<{ name: string }>("SELECT name FROM workspaces WHERE id = ?", [
      data.workspaceId,
    ]);
    await t.ensureTebarProfile(key, data.workspaceId, ws?.name ?? data.workspaceId);
    await t.registerTebarOrigin(key, new URL(data.returnUrl).origin);
    return t.createTebarConnectLink(
      key,
      data.workspaceId,
      data.returnUrl,
      data.workspaceId,
      data.platforms.length ? data.platforms : undefined,
    );
  });

export const syncTebarAccounts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertWsWriter(data.workspaceId, context.userId);
    const { execute, query, uuid } = await import("@/integrations/mysql/pool");
    const t = await import("@/lib/tebar.server");
    const key = await t.getTebarKey();
    if (!key) throw new Error("Koneksi sosial belum diaktifkan oleh admin XPERD");
    const profileId = await t.ensureTebarProfile(key, data.workspaceId, data.workspaceId);
    const accounts = await t.listProfileAccounts(key, profileId, data.workspaceId);
    const existing = await execute<{ id: string; external_id: string }>(
      "SELECT id, external_id FROM crm_social_accounts WHERE workspace_id = ? AND source = 'tebar'",
      [data.workspaceId],
    );
    const have = new Set(existing.map((e) => e.external_id));
    const ids = new Set(accounts.map((a) => a.id));
    const stale = existing.filter((e) => !ids.has(e.external_id)).map((e) => e.id);
    if (stale.length) await query("DELETE FROM crm_social_accounts WHERE id IN (?)", [stale]);
    for (const a of accounts) {
      if (have.has(a.id)) {
        await execute(
          "UPDATE crm_social_accounts SET platform = ?, account_name = ?, handle = ?, profile_url = ?, status = 'connected' WHERE workspace_id = ? AND external_id = ? AND source = 'tebar'",
          [a.platform, a.name, a.handle, a.profile_url, data.workspaceId, a.id],
        );
      } else {
        const { assertAccountQuota } = await import("@/lib/qalling-quota.server");
        await assertAccountQuota(data.workspaceId);
        await execute(
          "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, profile_url, external_id, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'tebar', 'connected')",
          [uuid(), data.workspaceId, a.platform, a.name, a.handle, a.profile_url, a.id],
        );
      }
    }
    return { count: accounts.length };
  });

/** Menarik postingan buatan Tebar ke kalender Qalling; hanya yang menarget akun workspace ini. */
export const syncTebarPosts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertWsWriter(data.workspaceId, context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const t = await import("@/lib/tebar.server");
    const { mapTebarPost } = await import("@/lib/tebar-posts");
    const key = await t.getTebarKey();
    if (!key) throw new Error("Koneksi sosial belum diaktifkan oleh admin XPERD");
    const accs = await execute<{ id: string; external_id: string | null }>(
      "SELECT id, external_id FROM crm_social_accounts WHERE workspace_id = ? AND source = 'tebar'",
      [data.workspaceId],
    );
    const accountMap = new Map(
      accs.filter((a) => a.external_id).map((a) => [a.external_id as string, a.id]),
    );
    if (!accountMap.size) return { imported: 0, updated: 0 };

    const raw = await t.listTebarPosts(key);
    const mapped = raw
      .map((r) => mapTebarPost(r, accountMap))
      .filter((m): m is NonNullable<typeof m> => !!m);
    const existing = await execute<{
      id: string;
      external_id: string | null;
      source: string;
      results: unknown;
    }>("SELECT id, external_id, source, results FROM crm_scheduled_posts WHERE workspace_id = ?", [
      data.workspaceId,
    ]);
    const byExt = new Map<string, { id: string; source: string }>();
    const knownIds = new Set<string>();
    for (const e of existing) {
      if (e.external_id) byExt.set(e.external_id, { id: e.id, source: e.source });
      let results: unknown = e.results;
      if (typeof results === "string") {
        try {
          results = JSON.parse(results);
        } catch {
          results = [];
        }
      }
      for (const r of (Array.isArray(results) ? results : []) as { id?: string }[])
        if (r?.id) knownIds.add(String(r.id));
    }
    const dt = (v: string | null) =>
      v && Number.isFinite(Date.parse(v)) ? sqlDateTime(new Date(v)) : null;
    let imported = 0;
    let updated = 0;
    for (const m of mapped) {
      const hit = byExt.get(m.external_id);
      if (hit) {
        const status = [
          m.status,
          dt(m.published_at),
          m.last_error,
          JSON.stringify(m.permalinks),
          JSON.stringify(m.results),
        ];
        if (hit.source === "tebar") {
          await execute(
            "UPDATE crm_scheduled_posts SET status = ?, published_at = ?, last_error = ?, permalinks = ?, results = ?, title = ?, caption = ?, media_url = ?, account_ids = ?, scheduled_at = ? WHERE id = ?",
            [
              ...status,
              m.title,
              m.caption,
              m.media_url,
              JSON.stringify(m.account_ids),
              dt(m.scheduled_at) ?? sqlDateTime(),
              hit.id,
            ],
          );
        } else {
          await execute(
            "UPDATE crm_scheduled_posts SET status = ?, published_at = ?, last_error = ?, permalinks = ?, results = ? WHERE id = ?",
            [...status, hit.id],
          );
        }
        updated++;
      } else if (!knownIds.has(m.external_id)) {
        const { assertPostQuota } = await import("@/lib/qalling-quota.server");
        await assertPostQuota(data.workspaceId, (m.scheduled_at ?? null) as string | null);
        await execute(
          `INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, media_url, account_ids, scheduled_at, status, published_at, last_error, permalinks, results, external_id, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tebar')`,
          [
            uuid(),
            data.workspaceId,
            m.title,
            m.caption,
            m.media_url,
            JSON.stringify(m.account_ids),
            dt(m.scheduled_at) ?? sqlDateTime(),
            m.status,
            dt(m.published_at),
            m.last_error,
            JSON.stringify(m.permalinks),
            JSON.stringify(m.results),
            m.external_id,
          ],
        );
        imported++;
      }
    }
    return { imported, updated };
  });

export const disconnectTebarAccount = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; accountId: string }) => {
    if (!isId(d?.workspaceId) || !isId(d?.accountId)) throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertWsWriter(data.workspaceId, context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const t = await import("@/lib/tebar.server");
    const row = await executeOne<{ external_id: string }>(
      "SELECT external_id FROM crm_social_accounts WHERE id = ? AND workspace_id = ? AND source = 'tebar'",
      [data.accountId, data.workspaceId],
    );
    if (!row) throw new Error("Akun tidak ditemukan");
    const key = await t.getTebarKey();
    if (key)
      await t
        .tebarFetch(key, `/accounts/${encodeURIComponent(row.external_id)}`, { method: "DELETE" })
        .catch(() => null);
    await execute("DELETE FROM crm_social_accounts WHERE id = ?", [data.accountId]);
    return { ok: true };
  });
