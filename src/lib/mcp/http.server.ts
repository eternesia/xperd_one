// Helper HTTP untuk endpoint MCP/OAuth: CORS terbuka (token dibawa lewat header Authorization, bukan cookie) dan origin publik.
import { requestOrigin } from "@/lib/google-oauth.server";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra },
  });

export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const origin = (request: Request) => requestOrigin(request);
export const resourceMetadataUrl = (request: Request) =>
  `${origin(request)}/.well-known/oauth-protected-resource`;

export function protectedResourceMetadata(request: Request) {
  const o = origin(request);
  return {
    resource: `${o}/mcp`,
    authorization_servers: [o],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}

export function authorizationServerMetadata(request: Request) {
  const o = origin(request);
  return {
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}
