import { executeOne } from "@/integrations/mysql/pool";
import { DEFAULT_MEDIA_POLICY, type MediaUploadPolicy } from "@/lib/media-upload-policy";

export async function loadMediaPolicy(): Promise<MediaUploadPolicy> {
  const r = await executeOne<Record<string, unknown>>(
    "SELECT * FROM media_upload_settings WHERE singleton = 1",
  );
  if (!r) return DEFAULT_MEDIA_POLICY;
  return {
    photo_mb: Number(r.photo_mb),
    video_mb: Number(r.video_mb),
    image_quality: Number(r.image_quality),
    image_max_edge: Number(r.image_max_edge),
    compress_images: Boolean(Number(r.compress_images)),
    compress_videos: Boolean(Number(r.compress_videos)),
    video_mbps: Number(r.video_mbps),
  };
}

/** Batas ukuran per berkas dari kebijakan Super Admin (foto/video); jenis lain tidak dibatasi di sini. */
export async function assertMediaPolicy(media: { size_bytes: number; mime_type?: string | null }) {
  const p = await loadMediaPolicy();
  const size = Number(media.size_bytes);
  const mime = media.mime_type ?? "";
  if (mime.startsWith("image/") && size > p.photo_mb * 1048576)
    throw new Error("Photo exceeds configured upload limit");
  if (mime.startsWith("video/") && size > p.video_mb * 1048576)
    throw new Error("Video exceeds configured upload limit");
}
