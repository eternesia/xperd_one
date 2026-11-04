export type EnhancementAccount = { id: string; platform: string; source?: string };
export type FirstCommentOutcome = {
  status: string;
  comment_id?: string;
  error_message?: string;
  error_code?: string;
};
export const COMMENT_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 8000,
  tiktok: 150,
};
export const COVER_PLATFORMS = ["instagram", "tiktok", "youtube"];
export const supportsFirstComment = (a: EnhancementAccount) =>
  a.source === "tebar" && !!COMMENT_LIMITS[a.platform];
export const supportsVideoCover = (a: EnhancementAccount) =>
  a.source === "tebar" && COVER_PLATFORMS.includes(a.platform);

export function validateEnhancements(
  accounts: EnhancementAccount[],
  comment: string,
  cover: string | null,
  hasSingleVideo: boolean,
) {
  if (comment.trim()) {
    const eligible = accounts.filter(supportsFirstComment);
    if (!eligible.length)
      throw new Error("Komentar pertama belum didukung untuk akun yang dipilih");
    for (const a of eligible) {
      if (comment.trim().length > COMMENT_LIMITS[a.platform])
        throw new Error(
          `${a.platform}: komentar pertama maksimal ${COMMENT_LIMITS[a.platform]} karakter`,
        );
      if (a.platform === "instagram" && (comment.match(/#[^\s#]+/g) ?? []).length > 30)
        throw new Error("Instagram: maksimal 30 hashtag di komentar pertama");
    }
  }
  if (cover) {
    if (!accounts.some(supportsVideoCover))
      throw new Error("Cover video belum didukung untuk akun yang dipilih");
    if (!hasSingleVideo) throw new Error("Cover memerlukan satu video, bukan gambar atau carousel");
  }
}

export function targetEnhancementOptions(
  platform: string,
  comment: string,
  coverMediaId?: string,
  title = "Video",
) {
  const options: Record<string, unknown> = {};
  if (COMMENT_LIMITS[platform] && comment.trim()) options.first_comment = comment.trim();
  if (COVER_PLATFORMS.includes(platform) && coverMediaId) options.cover_media_id = coverMediaId;
  if (platform === "youtube") {
    options.title = title.slice(0, 100) || "Video";
    options.made_for_kids = false;
  }
  return options;
}
