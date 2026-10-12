/**
 * #54 (BS New 3): hook cron untuk auto-publish postingan sosial yang jatuh tempo.
 *
 * Old tidak punya scheduler internal, jadi endpoint ini dipanggil oleh cron
 * eksternal (systemd timer, container cron, atau layanan scheduler) — polanya
 * sama dengan `docs/INTEROP-BOILERPLATE.md`.
 *
 * Keamanan: bila `SOCIAL_PUBLISH_SECRET` diset, pemanggil harus mengirim
 * `x-webhook-secret` atau `?secret=` yang sama.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/social-publish")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const expected = process.env.SOCIAL_PUBLISH_SECRET;
  if (expected) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (provided !== expected) return new Response("Forbidden", { status: 403 });
  }

  const { publishDuePosts } = await import("@/lib/meta-publish.server");
  try {
    const result = await publishDuePosts(20);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Publish hook failed" },
      { status: 500 },
    );
  }
}
