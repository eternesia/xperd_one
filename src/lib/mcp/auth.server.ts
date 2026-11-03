// Autentikasi MCP: token akses pribadi (xpm_…) + OAuth 2.1 (kode + PKCE S256, registrasi klien dinamis, refresh token).
// Semua token disimpan sebagai hash SHA-256; nilai asli hanya ditampilkan sekali. Hanya boleh diimpor dari kode server.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { execute, executeOne, result, uuid } from "@/integrations/mysql/pool";

export const MCP_PATH = "/mcp";
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 60 * 60 * 24 * 30;
export const CODE_TTL_S = 600;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const secret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const sqlTs = (d: Date) => d.toISOString().slice(0, 23).replace("T", " ");

/** Token yang masih berlaku (belum dicabut/kedaluwarsa) milik pengguna aktif. */
export async function authenticateBearer(request: Request): Promise<{ userId: string } | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const row = await executeOne<{
    id: string;
    user_id: string;
    kind: string;
    last_used_at: string | null;
  }>(
    `SELECT t.id, t.user_id, t.kind, t.last_used_at FROM mcp_tokens t JOIN app_users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.kind IN ('pat','access') AND t.revoked_at IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > UTC_TIMESTAMP(6)) LIMIT 1`,
    [sha256(m[1])],
  );
  if (!row) return null;
  // Catat pemakaian paling sering sekali per menit.
  if (
    !row.last_used_at ||
    Date.now() - Date.parse(`${String(row.last_used_at).replace(" ", "T")}Z`) > 60_000
  )
    await execute("UPDATE mcp_tokens SET last_used_at = UTC_TIMESTAMP(6) WHERE id = ?", [row.id]);
  return { userId: row.user_id };
}

/* ---------- Token pribadi ---------- */
export async function createPersonalToken(userId: string, name: string) {
  const token = secret("xpm_");
  const id = uuid();
  await execute(
    "INSERT INTO mcp_tokens (id, user_id, kind, name, token_hash, token_prefix) VALUES (?, ?, 'pat', ?, ?, ?)",
    [id, userId, name.slice(0, 100), sha256(token), token.slice(0, 8)],
  );
  return { id, token };
}

export interface McpConnection {
  id: string;
  kind: "pat" | "oauth";
  name: string;
  prefix: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function listConnections(userId: string): Promise<McpConnection[]> {
  const pats = await execute<Record<string, unknown>>(
    "SELECT id, name, token_prefix, created_at, last_used_at FROM mcp_tokens WHERE user_id = ? AND kind = 'pat' AND revoked_at IS NULL ORDER BY created_at DESC",
    [userId],
  );
  const oauth = await execute<Record<string, unknown>>(
    `SELECT t.client_id AS id, c.client_name AS name, MIN(t.created_at) AS created_at, MAX(t.last_used_at) AS last_used_at
       FROM mcp_tokens t LEFT JOIN oauth_clients c ON c.client_id = t.client_id
      WHERE t.user_id = ? AND t.kind IN ('access','refresh') AND t.revoked_at IS NULL AND t.client_id IS NOT NULL
      GROUP BY t.client_id, c.client_name ORDER BY created_at DESC`,
    [userId],
  );
  const iso = (v: unknown) =>
    v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null;
  return [
    ...pats.map((r) => ({
      id: String(r.id),
      kind: "pat" as const,
      name: String(r.name ?? "Token"),
      prefix: String(r.token_prefix),
      created_at: iso(r.created_at)!,
      last_used_at: iso(r.last_used_at),
    })),
    ...oauth.map((r) => ({
      id: String(r.id),
      kind: "oauth" as const,
      name: String(r.name ?? "Aplikasi AI"),
      prefix: null,
      created_at: iso(r.created_at)!,
      last_used_at: iso(r.last_used_at),
    })),
  ];
}

/** Cabut token pribadi (id token) atau seluruh akses OAuth satu aplikasi (id klien). */
export async function revokeConnection(userId: string, kind: "pat" | "oauth", id: string) {
  const r =
    kind === "pat"
      ? await result(
          "UPDATE mcp_tokens SET revoked_at = UTC_TIMESTAMP(6) WHERE id = ? AND user_id = ? AND kind = 'pat' AND revoked_at IS NULL",
          [id, userId],
        )
      : await result(
          "UPDATE mcp_tokens SET revoked_at = UTC_TIMESTAMP(6) WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL",
          [id, userId],
        );
  return r.affectedRows > 0;
}

/* ---------- OAuth ---------- */
export function validRedirectUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(name: string, redirectUris: string[]) {
  const id = uuid();
  await execute(
    "INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)",
    [id, name.slice(0, 150) || "Aplikasi AI", JSON.stringify(redirectUris)],
  );
  return id;
}

export async function getClient(clientId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const c = await executeOne<{ client_id: string; client_name: string; redirect_uris: unknown }>(
    "SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = ?",
    [clientId],
  );
  if (!c) return null;
  const uris = typeof c.redirect_uris === "string" ? JSON.parse(c.redirect_uris) : c.redirect_uris;
  return {
    id: c.client_id,
    name: c.client_name,
    redirectUris: (Array.isArray(uris) ? uris : []) as string[],
  };
}

export async function createAuthCode(p: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}) {
  const code = secret("xpc_");
  await execute(
    "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      sha256(code),
      p.clientId,
      p.userId,
      p.redirectUri,
      p.codeChallenge,
      sqlTs(new Date(Date.now() + CODE_TTL_S * 1000)),
    ],
  );
  return code;
}

async function issuePair(userId: string, clientId: string, parentId: string | null) {
  const access = secret("xpa_");
  const refresh = secret("xpr_");
  const accessId = uuid();
  await execute(
    "INSERT INTO mcp_tokens (id, user_id, kind, client_id, token_hash, token_prefix, parent_id, expires_at) VALUES (?, ?, 'access', ?, ?, ?, ?, ?)",
    [
      accessId,
      userId,
      clientId,
      sha256(access),
      access.slice(0, 8),
      parentId,
      sqlTs(new Date(Date.now() + ACCESS_TTL_S * 1000)),
    ],
  );
  await execute(
    "INSERT INTO mcp_tokens (id, user_id, kind, client_id, token_hash, token_prefix, parent_id, expires_at) VALUES (?, ?, 'refresh', ?, ?, ?, ?, ?)",
    [
      uuid(),
      userId,
      clientId,
      sha256(refresh),
      refresh.slice(0, 8),
      accessId,
      sqlTs(new Date(Date.now() + REFRESH_TTL_S * 1000)),
    ],
  );
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope: "mcp",
  };
}

const b64url = (b: Buffer) => b.toString("base64url");

export async function exchangeCode(p: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
}) {
  // Klaim kode sekali pakai (atomik) sebelum memeriksa PKCE.
  const row = await executeOne<{
    user_id: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
  }>(
    "SELECT user_id, client_id, redirect_uri, code_challenge FROM oauth_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(6)",
    [sha256(p.code)],
  );
  if (!row) return { error: "invalid_grant" as const };
  const claimed = await result(
    "UPDATE oauth_codes SET used_at = UTC_TIMESTAMP(6) WHERE code_hash = ? AND used_at IS NULL",
    [sha256(p.code)],
  );
  if (!claimed.affectedRows) return { error: "invalid_grant" as const };
  if (row.client_id !== p.clientId || row.redirect_uri !== p.redirectUri)
    return { error: "invalid_grant" as const };
  const expected = Buffer.from(row.code_challenge);
  const actual = Buffer.from(b64url(createHash("sha256").update(p.verifier).digest()));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return { error: "invalid_grant" as const };
  return { tokens: await issuePair(row.user_id, row.client_id, null) };
}

export async function refreshTokens(p: { refreshToken: string; clientId: string }) {
  const row = await executeOne<{ id: string; user_id: string; client_id: string }>(
    `SELECT id, user_id, client_id FROM mcp_tokens WHERE token_hash = ? AND kind = 'refresh' AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP(6)`,
    [sha256(p.refreshToken)],
  );
  if (!row || row.client_id !== p.clientId) return { error: "invalid_grant" as const };
  // Rotasi: refresh token lama hangus; sekali pakai.
  const used = await result(
    "UPDATE mcp_tokens SET revoked_at = UTC_TIMESTAMP(6) WHERE id = ? AND revoked_at IS NULL",
    [row.id],
  );
  if (!used.affectedRows) return { error: "invalid_grant" as const };
  return { tokens: await issuePair(row.user_id, row.client_id, row.id) };
}
