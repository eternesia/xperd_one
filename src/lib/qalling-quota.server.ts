/**
 * Penegakan kuota Qalling di lapisan aplikasi (BS New 11: trigger `enforce_qalling_quota` /
 * `enforce_qalling_max_users`). Batas berasal dari entitlement (tier + opsi + override); tanpa add-on
 * aktif / add-on lama (tanpa tier) tidak ada batas. Pesan galat sama dengan New 11.
 */
import { executeOne } from "@/integrations/mysql/pool";
import { workspaceLimits } from "./entitlements.server";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Akun sosial baru/aktif tidak boleh melebihi `max_accounts`. */
export async function assertAccountQuota(workspaceId: string, excludeId?: string) {
  const lim = await workspaceLimits(workspaceId);
  const cap = num(lim?.max_accounts);
  if (cap === null) return;
  const r = await executeOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM crm_social_accounts WHERE workspace_id = ? AND status <> 'disconnected' AND id <> ?",
    [workspaceId, excludeId ?? ""],
  );
  if (Number(r?.n ?? 0) >= cap) throw new Error("Qalling quota exceeded");
}

/** Media: ukuran valid, video ≤ `max_video_mb`, total ≤ `storage_gb` (GB desimal). */
export async function assertMediaQuota(
  workspaceId: string,
  media: { size_bytes: number; mime_type?: string | null },
  excludeId?: string,
) {
  const size = Number(media.size_bytes);
  if (!Number.isFinite(size) || size < 0) throw new Error("Invalid media size");
  // Batas tier (pesan spesifik paket) dicek dulu, lalu kebijakan unggah Super Admin (berlaku semua paket).
  await assertTierMediaQuota(workspaceId, size, media.mime_type, excludeId);
  const { assertMediaPolicy } = await import("./media-policy.server");
  await assertMediaPolicy({ size_bytes: size, mime_type: media.mime_type });
}

async function assertTierMediaQuota(
  workspaceId: string,
  size: number,
  mime_type: string | null | undefined,
  excludeId?: string,
) {
  const lim = await workspaceLimits(workspaceId);
  if (!lim) return;
  const videoCap = num(lim.max_video_mb);
  if (mime_type?.startsWith("video/") && videoCap !== null && size > videoCap * 1_000_000)
    throw new Error("Video exceeds tier limit");
  const gb = num(lim.storage_gb);
  if (gb === null) return;
  const r = await executeOne<{ n: number }>(
    "SELECT COALESCE(SUM(size_bytes),0) AS n FROM crm_media WHERE workspace_id = ? AND id <> ?",
    [workspaceId, excludeId ?? ""],
  );
  // Sama dengan New 11: `used = sum + new - 1` lalu `used >= cap` → total persis = cap masih boleh.
  if (Number(r?.n ?? 0) + size - 1 >= gb * 1_000_000_000) throw new Error("Qalling quota exceeded");
}

/** Posting dijadwalkan per bulan kalender (Asia/Jakarta) ≤ `monthly_post_limit`. */
export async function assertPostQuota(
  workspaceId: string,
  when: Date | string | null | undefined,
  excludeId?: string,
) {
  const lim = await workspaceLimits(workspaceId);
  const cap = num(lim?.monthly_post_limit);
  if (cap === null) return;
  const ref = when ? new Date(when) : new Date();
  const jak = new Date(ref.getTime() + 7 * 3600_000).toISOString().slice(0, 7); // YYYY-MM
  const r = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM crm_scheduled_posts
      WHERE workspace_id = ? AND id <> ?
        AND DATE_FORMAT(CONVERT_TZ(COALESCE(scheduled_at, created_at), '+00:00', '+07:00'), '%Y-%m') = ?`,
    [workspaceId, excludeId ?? "", jak],
  );
  if (Number(r?.n ?? 0) >= cap) throw new Error("Qalling quota exceeded");
}

/** Anggota baru workspace tidak boleh melebihi `max_users` (anggota yang sudah ada tidak dihitung ulang). */
export async function assertUserQuota(workspaceId: string, userId: string) {
  const lim = await workspaceLimits(workspaceId);
  const cap = num(lim?.max_users);
  if (cap === null) return;
  const existing = await executeOne(
    "SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [workspaceId, userId],
  );
  if (existing) return;
  const r = await executeOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ?",
    [workspaceId],
  );
  if (Number(r?.n ?? 0) >= cap) throw new Error("Qalling max_users quota exceeded");
}

/** Penjaga generik untuk jalur tulis `saveWorkspaceRow`/`upsertWorkspaceRows` (tabel Qalling saja). */
export async function enforceWorkspaceWriteQuota(
  table: string,
  workspaceId: string,
  row: Record<string, unknown>,
  existingId?: string | null,
) {
  const isUpdate = Boolean(existingId);
  if (table === "crm_social_accounts") {
    if (isUpdate && !("status" in row)) return;
    if (row.status === "disconnected") return;
    await assertAccountQuota(workspaceId, existingId ?? undefined);
  } else if (table === "crm_media") {
    if (isUpdate && !("size_bytes" in row)) return;
    await assertMediaQuota(
      workspaceId,
      { size_bytes: Number(row.size_bytes ?? 0), mime_type: (row.mime_type as string) ?? null },
      existingId ?? undefined,
    );
  } else if (table === "crm_scheduled_posts") {
    if (isUpdate && !("scheduled_at" in row)) return;
    await assertPostQuota(workspaceId, row.scheduled_at as string | null, existingId ?? undefined);
  }
}
