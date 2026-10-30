/** Autentikasi panggilan cron: rahasia bersama `CRON_SECRET` (atau `SOCIAL_PUBLISH_SECRET`); tanpa rahasia = tertutup. */
import { timingSafeEqual } from "node:crypto";

export function authenticateCronRequest(request: Request): Response | null {
  const expected = process.env.CRON_SECRET ?? process.env.SOCIAL_PUBLISH_SECRET;
  if (!expected) return new Response("Cron secret is not configured", { status: 403 });
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("x-webhook-secret") ??
    url.searchParams.get("secret") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("Forbidden", { status: 403 });
  return null;
}
