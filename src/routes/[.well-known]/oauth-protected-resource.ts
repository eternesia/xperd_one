import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
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
