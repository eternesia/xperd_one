import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { validateStorageEndpoint } from "./platform-infrastructure-rules";

const schema = z.object({
  provider: z.enum(["r2", "s3", "wasabi", "spaces", "b2"]),
  endpoint: z.string(),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  /** Bucket khusus backup otomatis (kosong = backup hanya di server). */
  backup_bucket: z
    .string()
    .regex(/^([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])?$/)
    .default(""),
  region: z.string().min(1),
  access_key: z.string().optional(),
  secret_key: z.string().optional(),
  cdn_url: z.string().default(""),
});

async function assertAdmin(userId: string) {
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await hasRole(userId, "admin"))) throw new Error("Hanya Super Admin");
}

export const getPlatformStorage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const data = await executeOne<{
      provider: string;
      endpoint: string;
      bucket: string;
      backup_bucket: string;
      region: string;
      cdn_url: string;
      access_key: string;
      secret_key: string;
      media_on_r2: number;
    }>(
      "SELECT provider, endpoint, bucket, backup_bucket, region, cdn_url, access_key, secret_key, media_on_r2 FROM platform_storage_settings WHERE singleton = 1",
    );
    if (!data) return null;
    const { access_key, secret_key, media_on_r2, ...safe } = data;
    return {
      ...safe,
      media_on_r2: Number(media_on_r2) === 1,
      has_access_key: Boolean(access_key),
      has_secret_key: Boolean(secret_key),
    };
  });

export const savePlatformStorage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const endpoint = validateStorageEndpoint(data.endpoint);
    if (data.cdn_url && new URL(data.cdn_url).protocol !== "https:")
      throw new Error("CDN harus HTTPS");
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      `INSERT INTO platform_storage_settings (singleton, provider, endpoint, bucket, backup_bucket, region, cdn_url, access_key, secret_key)
       VALUES (1, ?, ?, ?, ?, ?, ?, COALESCE(?, ''), COALESCE(?, ''))
       ON DUPLICATE KEY UPDATE provider = VALUES(provider), endpoint = VALUES(endpoint), bucket = VALUES(bucket),
         backup_bucket = VALUES(backup_bucket),
         region = VALUES(region), cdn_url = VALUES(cdn_url),
         access_key = IF(? IS NULL OR ? = '', access_key, VALUES(access_key)),
         secret_key = IF(? IS NULL OR ? = '', secret_key, VALUES(secret_key))`,
      [
        data.provider,
        endpoint,
        data.bucket,
        data.backup_bucket,
        data.region,
        data.cdn_url,
        data.access_key ?? null,
        data.secret_key ?? null,
        data.access_key ?? null,
        data.access_key ?? null,
        data.secret_key ?? null,
        data.secret_key ?? null,
      ],
    );
    const { resetMediaStoreCache } = await import("@/lib/files.server");
    resetMediaStoreCache();
    return { ok: true };
  });

/** Uji akses bucket: HEAD bertanda tangan SigV4 ke endpoint resmi (tanpa redirect). */
export const testPlatformStorage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const r = await executeOne<Record<string, string>>(
      "SELECT * FROM platform_storage_settings WHERE singleton = 1",
    );
    if (!r?.access_key || !r.secret_key) throw new Error("Simpan kedua kunci terlebih dahulu");
    const endpoint = validateStorageEndpoint(r.endpoint);
    const { AwsClient } = await import("aws4fetch");
    const client = new AwsClient({
      accessKeyId: r.access_key,
      secretAccessKey: r.secret_key,
      service: "s3",
      region: r.region,
    });
    // Uji bucket berkas dan (bila diisi) bucket backup.
    const buckets = [r.bucket, r.backup_bucket].filter(Boolean);
    for (const b of buckets) {
      const request = await client.sign(`${endpoint}/${encodeURIComponent(b)}`, {
        method: "HEAD",
      });
      const response = await fetch(request, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          `Bucket "${b}" menolak akses (${response.status}). Periksa nama bucket dan izin kunci.`,
        );
    }
    return { ok: true, buckets };
  });

/** Status penyimpanan berkas unggahan: sakelar R2, berkas yang masih di disk, progres pemindahan. */
export const getMediaStorageStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getMediaMigrationState, localFilesSummary } =
      await import("@/lib/media-migration.server");
    const { loadStorageConfig, bucketUsage } = await import("@/lib/object-storage.server");
    const cfg = await loadStorageConfig().catch(() => null);
    const [migration, local, remote] = await Promise.all([
      getMediaMigrationState(),
      localFilesSummary(),
      cfg?.bucket
        ? bucketUsage(cfg, cfg.bucket, 20).catch((e: Error) => ({ error: e.message }))
        : Promise.resolve(null),
    ]);
    return {
      configured: Boolean(cfg?.bucket),
      bucket: cfg?.bucket ?? "",
      mediaOnR2: Boolean(cfg?.mediaOnR2),
      local,
      remote,
      migration,
    };
  });

/** Sakelar: unggahan baru langsung ke bucket media. */
export const setMediaOnR2 = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.enabled) {
      const { loadStorageConfig, headBucket } = await import("@/lib/object-storage.server");
      const cfg = await loadStorageConfig();
      if (!cfg?.bucket) throw new Error("Atur dan uji object storage terlebih dahulu");
      await headBucket(cfg, cfg.bucket);
    }
    const { execute } = await import("@/integrations/mysql/pool");
    await execute("UPDATE platform_storage_settings SET media_on_r2 = ? WHERE singleton = 1", [
      data.enabled ? 1 : 0,
    ]);
    const { resetMediaStoreCache } = await import("@/lib/files.server");
    resetMediaStoreCache();
    return { ok: true };
  });

/** Pindahkan berkas lama dari disk server ke bucket media (latar belakang). */
export const startMediaMigrationFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: unknown) => z.object({ deleteLocal: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startMediaMigration } = await import("@/lib/media-migration.server");
    return startMediaMigration(data.deleteLocal);
  });
