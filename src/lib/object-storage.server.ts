/**
 * Klien object storage S3-kompatibel minimal (Cloudflare R2, S3, Wasabi, Spaces, B2) — server-only.
 * Konfigurasi dari platform_storage_settings (Super Admin → Pengaturan → Object Storage).
 * Gaya path: <endpoint>/<bucket>/<key>. Tanda tangan SigV4 lewat aws4fetch.
 */
import { open, stat } from "node:fs/promises";

import { executeOne } from "@/integrations/mysql/pool";
import { validateStorageEndpoint } from "@/lib/platform-infrastructure-rules";

export interface StorageConfig {
  provider: string;
  endpoint: string;
  region: string;
  /** Bucket berkas unggahan (media). */
  bucket: string;
  /** Bucket backup (boleh kosong = backup hanya di server). */
  backupBucket: string;
  /** Unggahan baru disimpan di bucket media (sakelar Super Admin). */
  mediaOnR2: boolean;
  accessKey: string;
  secretKey: string;
}

export async function loadStorageConfig(): Promise<StorageConfig | null> {
  const r = await executeOne<Record<string, string>>(
    "SELECT * FROM platform_storage_settings WHERE singleton = 1",
  ).catch(() => null);
  if (!r?.endpoint || !r.access_key || !r.secret_key) return null;
  return {
    provider: r.provider,
    // Uji lokal (emulator S3): override endpoint hanya di luar produksi.
    endpoint:
      process.env.NODE_ENV !== "production" && process.env.OBJECT_STORAGE_ENDPOINT_OVERRIDE
        ? process.env.OBJECT_STORAGE_ENDPOINT_OVERRIDE.replace(/\/+$/, "")
        : validateStorageEndpoint(r.endpoint).replace(/\/+$/, ""),
    region: r.region || "auto",
    bucket: r.bucket ?? "",
    backupBucket: r.backup_bucket ?? "",
    mediaOnR2: Number(r.media_on_r2) === 1,
    accessKey: r.access_key,
    secretKey: r.secret_key,
  };
}

async function client(cfg: StorageConfig) {
  const { AwsClient } = await import("aws4fetch");
  return new AwsClient({
    accessKeyId: cfg.accessKey,
    secretAccessKey: cfg.secretKey,
    service: "s3",
    region: cfg.region,
  });
}

const objectUrl = (cfg: StorageConfig, bucket: string, key = "") =>
  `${cfg.endpoint}/${encodeURIComponent(bucket)}${key ? `/${key.split("/").map(encodeURIComponent).join("/")}` : ""}`;

async function send(cfg: StorageConfig, url: string, init: RequestInit & { timeoutMs?: number }) {
  const c = await client(cfg);
  const { timeoutMs = 60_000, ...rest } = init;
  const req = await c.sign(url, rest);
  let res: Response;
  try {
    res = await fetch(req, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new Error(
      timeout
        ? "Object storage tidak merespons (batas waktu habis)"
        : "Tidak bisa terhubung ke object storage (periksa endpoint & jaringan server)",
    );
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
    throw new Error(`Object storage ${res.status}${code ? ` ${code}` : ""}`);
  }
  return res;
}

export async function headBucket(cfg: StorageConfig, bucket: string) {
  await send(cfg, objectUrl(cfg, bucket), { method: "HEAD", timeoutMs: 10_000 });
}

const PART = 32 * 1024 * 1024; // 32 MB per bagian (R2/S3: minimal 5 MB kecuali bagian terakhir)
const SINGLE_MAX = 64 * 1024 * 1024;

/** Unggah berkas lokal; > 64 MB memakai multipart agar tidak memuat seluruh berkas ke memori. */
export async function putFile(
  cfg: StorageConfig,
  bucket: string,
  key: string,
  path: string,
  contentType: string,
) {
  const size = (await stat(path)).size;
  const fh = await open(path, "r");
  try {
    if (size <= SINGLE_MAX) {
      const buf = Buffer.alloc(size);
      await fh.read(buf, 0, size, 0);
      await send(cfg, objectUrl(cfg, bucket, key), {
        method: "PUT",
        body: buf,
        headers: { "content-type": contentType },
        timeoutMs: 10 * 60_000,
      });
      return { size };
    }
    const init = await send(cfg, `${objectUrl(cfg, bucket, key)}?uploads=`, {
      method: "POST",
      headers: { "content-type": contentType },
    });
    const uploadId = (await init.text()).match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
    if (!uploadId) throw new Error("Object storage: UploadId tidak diterima");
    const etags: string[] = [];
    try {
      for (let n = 1, offset = 0; offset < size; n++, offset += PART) {
        const len = Math.min(PART, size - offset);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, offset);
        const res = await send(
          cfg,
          `${objectUrl(cfg, bucket, key)}?partNumber=${n}&uploadId=${encodeURIComponent(uploadId)}`,
          { method: "PUT", body: buf, timeoutMs: 10 * 60_000 },
        );
        const etag = res.headers.get("etag");
        if (!etag) throw new Error(`Object storage: ETag bagian ${n} kosong`);
        etags.push(etag);
      }
      const xml =
        "<CompleteMultipartUpload>" +
        etags
          .map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`)
          .join("") +
        "</CompleteMultipartUpload>";
      const done = await send(
        cfg,
        `${objectUrl(cfg, bucket, key)}?uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: "POST",
          body: xml,
          headers: { "content-type": "application/xml" },
          timeoutMs: 5 * 60_000,
        },
      );
      const text = await done.text();
      if (/<Error>/.test(text))
        throw new Error(`Object storage: gagal menyatukan bagian (${text.slice(0, 120)})`);
    } catch (e) {
      await send(cfg, `${objectUrl(cfg, bucket, key)}?uploadId=${encodeURIComponent(uploadId)}`, {
        method: "DELETE",
      }).catch(() => {});
      throw e;
    }
    return { size };
  } finally {
    await fh.close();
  }
}

/** Unggah isi buffer (unggahan pengguna); > 64 MB memakai multipart. */
export async function putBytes(
  cfg: StorageConfig,
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string,
) {
  if (bytes.length <= SINGLE_MAX) {
    await send(cfg, objectUrl(cfg, bucket, key), {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "content-type": contentType },
      timeoutMs: 10 * 60_000,
    });
    return;
  }
  // Multipart lewat berkas sementara agar logika bagian tidak diduplikasi.
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "xperd-put-"));
  try {
    const tmp = join(dir, "obj");
    await writeFile(tmp, bytes);
    await putFile(cfg, bucket, key, tmp, contentType);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Ambil isi objek; null bila tidak ada (404). */
export async function getObject(
  cfg: StorageConfig,
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  try {
    const res = await send(cfg, objectUrl(cfg, bucket, key), {
      method: "GET",
      timeoutMs: 10 * 60_000,
    });
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (/Object storage 404/.test((e as Error).message)) return null;
    throw e;
  }
}

/** Ukuran objek; null bila tidak ada. */
export async function headObject(
  cfg: StorageConfig,
  bucket: string,
  key: string,
): Promise<number | null> {
  try {
    const res = await send(cfg, objectUrl(cfg, bucket, key), { method: "HEAD", timeoutMs: 20_000 });
    return Number(res.headers.get("content-length") ?? -1);
  } catch (e) {
    if (/Object storage 404/.test((e as Error).message)) return null;
    throw e;
  }
}

export async function deleteObject(cfg: StorageConfig, bucket: string, key: string) {
  await send(cfg, objectUrl(cfg, bucket, key), { method: "DELETE" });
}

/** Total isi bucket (jumlah objek & byte), dengan paginasi ListObjectsV2. */
export async function bucketUsage(cfg: StorageConfig, bucket: string, maxPages = 50) {
  let token = "";
  let count = 0;
  let bytes = 0;
  for (let page = 0; page < maxPages; page++) {
    const qs = `list-type=2&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
    const res = await send(cfg, `${objectUrl(cfg, bucket)}?${qs}`, {
      method: "GET",
      timeoutMs: 20_000,
    });
    const xml = await res.text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
      bytes += Number(m[1]);
      count += 1;
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "";
    if (!truncated || !token) return { count, bytes, partial: false };
  }
  return { count, bytes, partial: true };
}

/** Perkiraan biaya bulanan R2 Standard: $0,015/GB-bulan di atas 10 GB gratis (seluruh akun). */
export function estimateR2Cost(totalBytes: number) {
  const gb = totalBytes / 1024 ** 3;
  const usd = Math.max(0, gb - 10) * 0.015;
  const rate = Number(process.env.USD_IDR_RATE) || 16300;
  return { gb, usd, idr: Math.round(usd * rate), freeGb: 10, rate };
}
