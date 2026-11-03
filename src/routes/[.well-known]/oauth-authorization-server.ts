import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/mcp/http.server")).preflight(),
      GET: async ({ request }) => {
        const h = await import("@/lib/mcp/http.server");
        return h.json(h.authorizationServerMetadata(request));
      },
    },
  },
});
