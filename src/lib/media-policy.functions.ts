// Kebijakan unggah media (BS New 16): batas foto/video, kualitas & kompresi. Super Admin mengatur; pengunggah bersama (browser)
// membaca kebijakan lalu memvalidasi/mengompres sebelum unggah; server menegakkan batas ukuran pada setiap baris `crm_media`.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { mediaUploadSchema, type MediaUploadPolicy } from "@/lib/media-upload-policy";

export const getMediaPolicy = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<MediaUploadPolicy> => {
    const { loadMediaPolicy } = await import("@/lib/media-policy.server");
    return loadMediaPolicy();
  });

export const saveMediaPolicy = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: unknown) => mediaUploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute(
      `INSERT INTO media_upload_settings (singleton, photo_mb, video_mb, image_quality, image_max_edge, compress_images, compress_videos, video_mbps)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE photo_mb = VALUES(photo_mb), video_mb = VALUES(video_mb), image_quality = VALUES(image_quality),
         image_max_edge = VALUES(image_max_edge), compress_images = VALUES(compress_images), compress_videos = VALUES(compress_videos),
         video_mbps = VALUES(video_mbps)`,
      [
        data.photo_mb,
        data.video_mb,
        data.image_quality,
        data.image_max_edge,
        data.compress_images ? 1 : 0,
        data.compress_videos ? 1 : 0,
        data.video_mbps,
      ],
    );
    return { ok: true };
  });
