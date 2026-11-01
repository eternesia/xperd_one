/** Mulai login Google: simpan `state` acak di cookie httpOnly lalu alihkan ke layar persetujuan Google. */
import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";

const back = (code: string) =>
  new Response(null, { status: 302, headers: { Location: `/qalling/login?google_error=${code}` } });

export const Route = createFileRoute("/api/public/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/google-oauth.server");
        const cfg = await g.loadGoogleConfig();
        if (!cfg.enabled) return back("disabled");
        if (!cfg.clientId || !cfg.secret) return back("not_configured");
        const { publicOrigin } = await import("@/lib/crm-media.server");
        const state = randomBytes(24).toString("hex");
        const url = new URL(g.googleUrls().auth);
        url.search = new URLSearchParams({
          client_id: cfg.clientId,
          redirect_uri: g.googleRedirectUri(publicOrigin(request.url)),
          response_type: "code",
          scope: "openid email profile",
          state,
          prompt: "select_account",
        }).toString();
        const headers = new Headers({ Location: url.href });
        headers.append("Set-Cookie", `${g.GOOGLE_STATE_COOKIE}=${state}; ${g.cookieAttrs(600)}`);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
