import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/mcp/http.server")).preflight(),
      POST: async ({ request }) => {
        const h = await import("@/lib/mcp/http.server");
        const a = await import("@/lib/mcp/auth.server");
        const f = new URLSearchParams(await request.text());
        const clientId = f.get("client_id") ?? "";
        if (!(await a.getClient(clientId))) return h.json({ error: "invalid_client" }, 401);
        const grant = f.get("grant_type");
        const out =
          grant === "authorization_code"
            ? await a.exchangeCode({
                code: f.get("code") ?? "",
                clientId,
                redirectUri: f.get("redirect_uri") ?? "",
                verifier: f.get("code_verifier") ?? "",
              })
            : grant === "refresh_token"
              ? await a.refreshTokens({ refreshToken: f.get("refresh_token") ?? "", clientId })
              : { error: "unsupported_grant_type" as const };
        if ("error" in out) return h.json({ error: out.error }, 400);
        return h.json(out.tokens);
      },
    },
  },
});
