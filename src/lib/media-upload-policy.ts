import { z } from "zod";

export const mediaUploadSchema = z.object({
  photo_mb: z.number().int().min(1).max(50),
  video_mb: z.number().int().min(1).max(500),
  image_quality: z.number().int().min(85).max(100),
  image_max_edge: z.number().int().min(1920).max(4096),
  compress_images: z.boolean(),
  compress_videos: z.boolean(),
  video_mbps: z.number().int().min(8).max(30),
});
export type MediaUploadPolicy = z.infer<typeof mediaUploadSchema>;
export const DEFAULT_MEDIA_POLICY: MediaUploadPolicy = {
  photo_mb: 5, video_mb: 100, image_quality: 92, image_max_edge: 2560,
  compress_images: true, compress_videos: true, video_mbps: 10,
};
export function validateMediaFile(
  file: { type: string; size: number },
  policy: MediaUploadPolicy,
  lang: "id" | "en" = "en",
) {
  const id = lang === "id";
  if (!/^(image|video)\//.test(file.type))
    throw new Error(id ? "Hanya foto atau video" : "images or videos only");
  const mb = file.type.startsWith("image/") ? policy.photo_mb : policy.video_mb;
  if (file.size > mb * 1048576) throw new Error(id ? `Maksimal ${mb} MB` : `Maximum ${mb} MB`);
}
export function scaledDimensions(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / width, edge / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}