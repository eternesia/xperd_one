// Opsi posting per platform (diteruskan ke Tebar sebagai options per akun target). Murni: tanpa DB/jaringan.
import { z } from "zod/v4";

const url = z.string().url().max(2048);

export const platformOptionsSchema = z
  .object({
    instagram: z
      .object({
        format: z.enum(["feed", "story"]),
        share_to_feed: z.boolean(),
        trial: z.enum(["manual", "auto"]),
        collaborators: z.array(z.string().trim().min(1).max(60)).min(1).max(3),
        is_ai_generated: z.boolean(),
      })
      .partial()
      .strict(),
    facebook: z
      .object({ link: url, video_as: z.enum(["reel", "video"]) })
      .partial()
      .strict(),
    threads: z
      .object({
        poll: z.object({ options: z.array(z.string().min(1).max(25)).min(2).max(4) }).strict(),
        topic_tag: z.string().min(1).max(50),
        link_attachment: url,
        text_attachment: z
          .object({ text: z.string().min(1).max(10000), link_url: url.optional() })
          .strict(),
        reply_control: z.enum([
          "everyone",
          "accounts_you_follow",
          "mentioned_only",
          "parent_post_author_only",
          "followers_only",
        ]),
        thread: z.array(z.string().min(1).max(500)).min(1).max(10),
        is_made_with_ai: z.boolean(),
      })
      .partial()
      .strict(),
    linkedin: z
      .object({
        visibility: z.enum(["PUBLIC", "CONNECTIONS"]),
        document: z.object({ title: z.string().min(1).max(200) }).strict(),
        link: url,
      })
      .partial()
      .strict(),
    youtube: z
      .object({
        title: z
          .string()
          .min(1)
          .max(100)
          .refine((v) => !/[<>]/.test(v), "tanpa < atau >"),
        made_for_kids: z.boolean(),
        privacy: z.enum(["public", "unlisted", "private"]),
        tags: z.array(z.string().min(1).max(500)).max(100),
        category_id: z.string().regex(/^\d{1,3}$/),
        contains_synthetic_media: z.boolean(),
        notify_subscribers: z.boolean(),
      })
      .partial()
      .strict(),
    tiktok: z
      .object({
        post_mode: z.enum(["direct", "draft"]),
        privacy_level: z.enum([
          "PUBLIC_TO_EVERYONE",
          "MUTUAL_FOLLOW_FRIENDS",
          "FOLLOWER_OF_CREATOR",
          "SELF_ONLY",
        ]),
        allow_comment: z.boolean(),
        allow_duet: z.boolean(),
        allow_stitch: z.boolean(),
        commercial: z.object({ your_brand: z.boolean(), branded_content: z.boolean() }).strict(),
        photo_title: z.string().min(1).max(90),
        auto_add_music: z.boolean(),
        video_cover_timestamp_ms: z.number().int().min(0),
        is_aigc: z.boolean(),
      })
      .partial()
      .strict(),
    pinterest: z
      .object({ board_id: z.string().min(1).max(64), title: z.string().min(1).max(100), link: url })
      .partial()
      .strict(),
    x: z.object({ made_with_ai: z.boolean() }).partial().strict(),
    telegram: z
      .object({ silent: z.boolean(), protect_content: z.boolean(), no_link_preview: z.boolean() })
      .partial()
      .strict(),
    discord: z.object({ silent: z.boolean(), no_link_preview: z.boolean() }).partial().strict(),
  })
  .partial()
  .strict();

export type PlatformOptions = z.infer<typeof platformOptionsSchema>;

/** Platform dari akun yang dipilih (instagram, facebook, threads, …). */
export function validatePlatformOptions(
  opts: PlatformOptions | null | undefined,
  accounts: { platform: string; source?: string | null }[],
  ctx: {
    singleVideo?: boolean;
    mediaCount?: number;
    hasCaption?: boolean;
    requireYoutubeKids?: boolean;
  } = {},
): string | null {
  if (!opts) return null;
  const selected = new Set(accounts.map((a) => a.platform));
  for (const k of Object.keys(opts))
    if (!selected.has(k)) return `Opsi "${k}" diberikan tetapi tidak ada akun ${k} yang dipilih.`;
  const nonTebar = accounts.find(
    (a) => opts[a.platform as keyof PlatformOptions] && a.source !== "tebar",
  );
  if (nonTebar)
    return `Opsi platform ${nonTebar.platform} hanya didukung untuk akun yang tersambung lewat Tebar.`;
  const t = opts.threads;
  if (t) {
    if ((t.poll || t.link_attachment || t.text_attachment) && (ctx.mediaCount ?? 0) > 0)
      return "Threads: poll, link_attachment, dan text_attachment hanya untuk posting tanpa media.";
    if (t.poll && (t.link_attachment || t.text_attachment))
      return "Threads: poll tidak dapat digabung dengan link_attachment/text_attachment.";
  }
  const ig = opts.instagram;
  if (ig) {
    if (ig.format === "story" && (ctx.mediaCount ?? 0) !== 1)
      return "Instagram story memerlukan tepat satu gambar atau video.";
    if (ig.trial && !ctx.singleVideo) return "Instagram trial reel memerlukan tepat satu video.";
    if (ig.share_to_feed !== undefined && !ctx.singleVideo)
      return "Instagram share_to_feed hanya untuk reel (satu video).";
  }
  const li = opts.linkedin;
  if (li?.document && (ctx.mediaCount ?? 0) < 2)
    return "LinkedIn document (carousel PDF) memerlukan minimal dua gambar.";
  if (opts.pinterest && !opts.pinterest.board_id)
    return "Pinterest: board_id wajib diisi (lihat qalling_list_social_accounts).";
  const yt = opts.youtube;
  if (ctx.requireYoutubeKids && selected.has("youtube") && (!yt || yt.made_for_kids === undefined))
    return "YouTube: made_for_kids wajib diisi secara eksplisit (tanyakan pengguna, jangan diasumsikan).";
  const tk = opts.tiktok;
  if (tk?.commercial?.branded_content && tk.privacy_level === "SELF_ONLY")
    return "TikTok: konten bermerek tidak boleh SELF_ONLY.";
  return null;
}

/** Opsi untuk satu akun target: dasar (komentar pertama/cover) lalu opsi pengguna menimpa. */
export function mergePlatformOptions(
  platform: string,
  base: Record<string, unknown>,
  opts: PlatformOptions | null | undefined,
): Record<string, unknown> {
  const mine = opts?.[platform as keyof PlatformOptions] as Record<string, unknown> | undefined;
  return mine ? { ...base, ...mine } : base;
}

export function parsePlatformOptions(raw: unknown): PlatformOptions | null {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = platformOptionsSchema.safeParse(v);
    return r.success && Object.keys(r.data).length ? r.data : null;
  } catch {
    return null;
  }
}
