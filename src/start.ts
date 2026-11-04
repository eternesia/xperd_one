import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { qallingLegacyRedirect } from "./lib/qalling-urls";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Opsional (QALLING_LEGACY_REDIRECT=1): alihkan permanen alamat lama `/qalling/*` di domain Qalling ke alamat bersih. JANGAN aktifkan selama proxy
// masih menulis ulang path ke /qalling/* (akan berputar): hapus dulu aturan rewrite di proxy, cukup teruskan Host/X-Forwarded-Host.
const qallingRedirectMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (
    process.env.QALLING_LEGACY_REDIRECT === "1" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const url = new URL(request.url);
    const host = (
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      url.host
    )
      .split(",")[0]
      .trim()
      .split(":")[0];
    const target = qallingLegacyRedirect(host, url.pathname, url.search);
    if (target) return new Response(null, { status: 301, headers: { location: target } });
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Auth now relies on the httpOnly `xperd_token` cookie, which the browser sends
// automatically on same-origin serverFn RPCs — no global function middleware
// (like the old Supabase bearer attacher) is needed.
export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware: [errorMiddleware, qallingRedirectMiddleware, csrfMiddleware],
}));
