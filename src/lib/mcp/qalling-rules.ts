// Aturan murni tool posting Qalling (BS New 17): skema input, waktu jadwal, target akun, CDN media yang diizinkan, izin per bagian.
import { z } from "zod/v4";
import { validateScheduleTime } from "../post-delivery-rules";

export const postInputSchema = z
  .object({
    workspace_id: z.string().uuid(),
    account_ids: z.array(z.string().uuid()).min(1).max(10),
    title: z.string().trim().min(1).max(150),
    caption: z.string().max(5000).default(""),
    first_comment: z.string().trim().max(2200).optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    publish_mode: z.enum(["draft", "scheduled"]).default("draft"),
    media_ids: z.array(z.string().uuid()).max(10).default([]),
    media_urls: z.array(z.string().url()).max(10).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.media_ids.length + input.media_urls.length > 10)
      ctx.addIssue({ code: "custom", message: "Maximum 10 media attachments in total." });
    if (!input.caption.trim() && !input.media_ids.length && !input.media_urls.length)
      ctx.addIssue({ code: "custom", message: "Add a caption or media." });
    if (input.publish_mode === "scheduled" && !input.scheduled_at)
      ctx.addIssue({ code: "custom", message: "scheduled_at is required when scheduling." });
  });

export function postTime(mode: "draft" | "scheduled", time: string | undefined, now: number) {
  if (mode === "scheduled") return validateScheduleTime(time ?? "", now);
  return time ?? new Date(now).toISOString();
}

type Account = { platform: string; source: string | null; status: string };
export function validatePostTargets(accounts: Account[], types: string[], sending: boolean) {
  if (accounts.some((a) => !["tebar", "meta"].includes(a.source ?? "") || a.status !== "connected"))
    throw new Error("Select connected accounts in this workspace.");
  if (types.length > 1 && types.some((t) => !t.startsWith("image/")))
    throw new Error("Multiple attachments must be images; attach a video separately.");
  if (
    types.length &&
    accounts.some((a) => a.source === "meta") &&
    (types.length > 1 || types.some((t) => !t.startsWith("image/")))
  )
    throw new Error(
      "Native Meta currently supports one image only; use a Tebar-connected account for carousel or video.",
    );
  if (
    sending &&
    !types.length &&
    accounts.some((a) => ["instagram", "tiktok", "youtube", "pinterest"].includes(a.platform))
  )
    throw new Error("The selected platform requires an image or video.");
  if (
    sending &&
    accounts.some((a) => a.source === "meta" && !["instagram", "facebook"].includes(a.platform))
  )
    throw new Error("This native platform does not support publishing.");
}

// Hanya CDN media yang dikenal (bukan host sembarang, IP literal, atau redirect) — mencegah SSRF/DNS-rebinding.
export const MEDIA_HOSTS = [
  "oaidalleapiprodscus.blob.core.windows.net",
  "oaiusercontent.com",
  "storage.googleapis.com",
  "res.cloudinary.com",
  "images.unsplash.com",
  "replicate.delivery",
  "fal.media",
];
export function remoteMediaUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !MEDIA_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  )
    throw new Error(
      "Use a supported HTTPS media CDN (OpenAI, Google Storage, Cloudinary, Unsplash, Replicate or Fal), or upload in Qalling and pass media_ids.",
    );
  return url.href;
}

type Permission = { canView: boolean; canEdit: boolean };
export function allowsSection(
  role: string,
  permissions: Map<string, Permission>,
  section: string,
  write: boolean,
) {
  if (role === "owner") return true;
  if (write && role === "viewer") return false;
  return ["crm", "crm/ai", `crm/${section}`].every((key) => {
    const p = permissions.get(key);
    return write ? (p?.canEdit ?? role !== "viewer") : (p?.canView ?? true);
  });
}
