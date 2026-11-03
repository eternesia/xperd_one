-- Integrasi AI (MCP) — BS New 14: token akses pribadi + OAuth 2.1 (PKCE, registrasi klien dinamis) untuk ChatGPT/Claude.
-- Token disimpan sebagai hash SHA-256 (nilai asli hanya tampil sekali). Idempoten.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id char(36) NOT NULL,
  client_name varchar(150) NOT NULL,
  redirect_uris json NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash char(64) NOT NULL,
  client_id char(36) NOT NULL,
  user_id char(36) NOT NULL,
  redirect_uri varchar(500) NOT NULL,
  code_challenge varchar(128) NOT NULL,
  expires_at datetime(6) NOT NULL,
  used_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (code_hash),
  KEY idx_oauth_codes_user (user_id),
  CONSTRAINT fk_oauth_codes_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id char(36) NOT NULL,
  user_id char(36) NOT NULL,
  kind varchar(10) NOT NULL DEFAULT 'pat',            -- pat | access | refresh
  name varchar(100) NULL,
  client_id char(36) NULL,
  token_hash char(64) NOT NULL,
  token_prefix varchar(16) NOT NULL,
  parent_id char(36) NULL,
  expires_at datetime(6) NULL,
  revoked_at datetime(6) NULL,
  last_used_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mcp_token_hash (token_hash),
  KEY idx_mcp_tokens_user (user_id, kind),
  CONSTRAINT fk_mcp_tokens_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
