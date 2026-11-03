// Registrasi klien dinamis (RFC 7591) — klien publik (tanpa secret), PKCE wajib saat otorisasi.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/mcp/http.server")).preflight(),
      POST: async ({ request }) => {
        const h = await import("@/lib/mcp/http.server");
        const a = await import("@/lib/mcp/auth.server");
        let b: { client_name?: unknown; redirect_uris?: unknown };
        try {
          b = await request.json();
        } catch {
          return h.json({ error: "invalid_client_metadata" }, 400);
        }
        const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
        if (!uris.length || uris.length > 10 || !uris.every(a.validRedirectUri))
          return h.json(
            {
              error: "invalid_redirect_uri",
              error_description: "redirect_uris harus HTTPS (atau localhost).",
            },
            400,
          );
        const name = typeof b.client_name === "string" ? b.client_name : "Aplikasi AI";
        const client_id = await a.registerClient(name, uris);
        return h.json(
          {
            client_id,
            client_name: name.slice(0, 150),
            redirect_uris: uris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
          201,
        );
      },
    },
  },
});
