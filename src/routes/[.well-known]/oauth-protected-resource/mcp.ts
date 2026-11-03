import { createFileRoute } from "@tanstack/react-router";

// RFC 9728: klien boleh meminta metadata dengan akhiran path resource (/mcp).
export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/mcp/http.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/mcp/http.server");
        return h.json(h.protectedResourceMetadata(request));
      },
    },
  },
});
