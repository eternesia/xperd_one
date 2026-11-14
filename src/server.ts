import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handlePublicLeadRequest, handleReminderCronRequest } from "./lib/interop.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const SELF_HOSTED_ALLOWED =
  /^\/(app|app-admin|auth|setup|api|production|_serverFn|_server|assets|mcp|oauth|\.well-known)(\/|$)|\.[a-z0-9]{2,5}$/i;

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // ---------------------------------------------------------------------
    // Integrasi pihak ketiga — OPSIONAL / BOILERPLATE, bukan fitur wajib.
    // Kedua handler mengembalikan 404 selama env flag belum diisi
    // (PUBLIC_LEAD_API_ENABLED / CRON_API_ENABLED), jadi perilaku default
    // aplikasi tidak berubah. Lihat docs/INTEROP-BOILERPLATE.md.
    // ---------------------------------------------------------------------
    const path = new URL(request.url).pathname;
    // Scheduler internal (auto-publish & email): mulai sekali saat request pertama.
    void import("./lib/scheduler.server")
      .then((m) => m.ensureScheduler(request.url, request.headers))
      .catch(() => {});
    // Instalasi klien (self-hosted): hanya aplikasi ERP — halaman pemasaran, pendaftaran, dan
    // Qalling dialihkan ke /app.
    if (process.env.XPERD_INSTANCE_MODE === "self_hosted" && !SELF_HOSTED_ALLOWED.test(path))
      return Response.redirect(new URL("/app", request.url), 302);
    if (path === "/api/public/leads") return handlePublicLeadRequest(request);
    if (path === "/api/cron/reminders") return handleReminderCronRequest(request);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
