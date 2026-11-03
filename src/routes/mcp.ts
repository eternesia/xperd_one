// Endpoint MCP (Streamable HTTP, respons JSON): POST /mcp dengan Authorization: Bearer <token pribadi atau token OAuth>.
import { createFileRoute } from "@tanstack/react-router";

const methodNotAllowed = async () => {
  const { CORS } = await import("@/lib/mcp/http.server");
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, OPTIONS", ...CORS },
  });
};

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/mcp/http.server")).preflight(),
      GET: methodNotAllowed,
      DELETE: methodNotAllowed,
      POST: async ({ request }) => {
        const h = await import("@/lib/mcp/http.server");
        const { authenticateBearer } = await import("@/lib/mcp/auth.server");
        const auth = await authenticateBearer(request);
        if (!auth)
          return h.json(
            { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
            401,
            {
              "WWW-Authenticate": `Bearer resource_metadata="${h.resourceMetadataUrl(request)}"`,
            },
          );
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return h.json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
            400,
          );
        }
        const [{ handleMcp }, { default: mcp }] = await Promise.all([
          import("@/lib/mcp/framework"),
          import("@/lib/mcp"),
        ]);
        const out = await handleMcp(mcp, body, {
          userId: auth.userId,
          isAuthenticated: () => true,
          getToken: () => request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
        });
        if (out === null) return new Response(null, { status: 202, headers: h.CORS });
        return h.json(out);
      },
    },
  },
});
