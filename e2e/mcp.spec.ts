import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { ADMIN, login, resolveWorkspaceId } from "./helpers";

/**
 * Integrasi AI (MCP) — BS New 14: server MCP sendiri (JSON-RPC, tanpa paket Lovable), token pribadi (hash di DB) dan OAuth 2.1
 * (PKCE S256, registrasi klien dinamis, kode sekali pakai, refresh dirotasi). Tool dibatasi fitur `mcp_api` dan keanggotaan workspace.
 * Semua efek dicek di SQL; data uji dan paket dikembalikan di akhir.
 */
test.use({ storageState: { cookies: [], origins: [] } });

function envFromFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
const env = envFromFile();
const DB_CONFIG = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
  timezone: "Z",
};
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

const TAG = `E2EMCP${Date.now().toString().slice(-6)}`;
let ws = "";
let addonRow: RowDataPacket | null = null;

test.afterAll(async () => {
  if (!conn) return;
  await conn.execute("DELETE FROM crm_leads WHERE name LIKE ?", [`${TAG}%`]);
  await conn
    .execute("DELETE FROM crm_ideas WHERE title LIKE ?", [`${TAG}%`])
    .catch(() => undefined);
  await conn.execute(
    "DELETE FROM mcp_tokens WHERE name LIKE ? OR client_id IN (SELECT client_id FROM oauth_clients WHERE client_name LIKE ?)",
    [`${TAG}%`, `${TAG}%`],
  );
  await conn.execute("DELETE FROM oauth_clients WHERE client_name LIKE ?", [`${TAG}%`]);
  if (addonRow)
    await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [
      addonRow.tier_id,
      addonRow.id,
    ]);
  await conn.end();
});

const b64url = (b: Buffer) => b.toString("base64url");

test("MCP: token pribadi, tool, batas paket, OAuth PKCE, pencabutan", async ({ page, request }) => {
  test.setTimeout(300_000);
  conn = await mysql.createConnection(DB_CONFIG);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  addonRow = (
    await q(
      "SELECT ta.id, ta.tier_id FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'",
      [w.tenant_id],
    )
  )[0];
  expect(addonRow).toBeTruthy();
  const setTier = (code: string) =>
    conn.execute(
      "UPDATE tenant_addons SET tier_id = (SELECT id FROM addon_tiers WHERE code = ?) WHERE id = ?",
      [code, addonRow!.id],
    );
  await setTier("qalling_agency");

  const rpc = async (
    token: string | null,
    method: string,
    params?: Record<string, unknown>,
    id: number | null = 1,
  ) =>
    request.post("/mcp", {
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      data: {
        jsonrpc: "2.0",
        ...(id === null ? {} : { id }),
        method,
        ...(params ? { params } : {}),
      },
    });
  const call = async (token: string, name: string, args: Record<string, unknown>) => {
    const r = await rpc(token, "tools/call", { name, arguments: args });
    expect(r.status()).toBe(200);
    return (await r.json()).result as {
      isError?: boolean;
      content: { text: string }[];
      structuredContent?: any;
    };
  };

  /* ---------- tanpa token: 401 + petunjuk OAuth; metadata ---------- */
  const anon = await rpc(null, "tools/list");
  expect(anon.status()).toBe(401);
  expect(anon.headers()["www-authenticate"]).toMatch(
    /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource"/,
  );
  const prm = await (await request.get("/.well-known/oauth-protected-resource")).json();
  expect(prm.resource).toMatch(/\/mcp$/);
  const prm2 = await request.get("/.well-known/oauth-protected-resource/mcp");
  expect(prm2.status()).toBe(200);
  const asm = await (await request.get("/.well-known/oauth-authorization-server")).json();
  expect(asm).toMatchObject({
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
  expect((await request.get("/mcp")).status()).toBe(405);

  /* ---------- UI: buat token pribadi (nilai asli tampil sekali, DB hanya hash) ---------- */
  await page.goto("/qalling/app/ai");
  await expect(page.getByRole("heading", { name: "Integrasi AI" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("code").first()).toContainText("/mcp");
  await page.getByLabel("Nama token").fill(`${TAG} Claude`);
  await page.getByRole("button", { name: "Buat token" }).click();
  const token = (await page.getByTestId("mcp-new-token").innerText()).trim();
  expect(token).toMatch(/^xpm_[A-Za-z0-9_-]{40,}$/);
  const [row] = await q("SELECT token_hash, token_prefix, kind FROM mcp_tokens WHERE name = ?", [
    `${TAG} Claude`,
  ]);
  expect(row.kind).toBe("pat");
  expect(row.token_hash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
  expect(JSON.stringify(row)).not.toContain(token);
  await expect(page.getByText(`${TAG} Claude`).first()).toBeVisible();

  /* ---------- protokol ---------- */
  const init = await (
    await rpc(token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    })
  ).json();
  expect(init.result).toMatchObject({
    protocolVersion: "2025-06-18",
    serverInfo: { name: "xperd-one" },
    capabilities: { tools: {} },
  });
  expect((await rpc(token, "notifications/initialized", undefined, null)).status()).toBe(202);
  expect((await (await rpc(token, "ping")).json()).result).toEqual({});
  const list = (await (await rpc(token, "tools/list")).json()).result.tools as {
    name: string;
    inputSchema: any;
  }[];
  expect(list.map((t) => t.name).sort()).toEqual(
    [
      "get_financial_summary",
      "get_workspace_summary",
      "list_items",
      "list_purchase_documents",
      "list_sales_documents",
      "list_workspaces",
      "qalling_create_idea",
      "qalling_create_lead",
      "qalling_create_post",
      "qalling_like_comments",
      "qalling_get_lead",
      "qalling_update_lead",
      "qalling_add_lead_activity",
      "qalling_list_activities",
      "qalling_complete_activity",
      "qalling_convert_conversation_to_lead",
      "qalling_get_crm_summary",
      "qalling_list_templates",
      "qalling_list_contacts",
      "qalling_get_contact",
      "qalling_save_contact",
      "qalling_list_conversations",
      "qalling_get_conversation",
      "qalling_send_dm",
      "qalling_set_conversation_status",
      "qalling_reply_to_comment",
      "qalling_list_automations",
      "qalling_create_automation",
      "qalling_update_automation",
      "qalling_get_account_insights",
      "qalling_get_post_insights",
      "qalling_get_best_times",
      "qalling_get_platform_rules",
      "qalling_get_publishing_limits",
      "qalling_get_post",
      "qalling_update_post",
      "qalling_cancel_scheduled_post",
      "qalling_retry_post",
      "qalling_list_ideas",
      "qalling_update_idea",
      "qalling_list_comments",
      "qalling_list_media",
      "qalling_list_posts",
      "qalling_list_social_accounts",
      "qalling_publish_post_now",
      "qalling_search_leads",
      "qalling_upload_media",
      "search_items",
    ].sort(),
  );
  const createLeadSchema = list.find((t) => t.name === "qalling_create_lead")!.inputSchema;
  expect(createLeadSchema).toMatchObject({
    type: "object",
    required: expect.arrayContaining(["workspace_id", "name"]),
  });
  expect((await (await rpc(token, "nope")).json()).error.code).toBe(-32601);

  /* ---------- tool: baca/tulis nyata + validasi + batas akses ---------- */
  const wsl = await call(token, "list_workspaces", {});
  expect(JSON.parse(wsl.content[0].text).map((x: { id: string }) => x.id)).toContain(ws);
  const lead = await call(token, "qalling_create_lead", {
    workspace_id: ws,
    name: `${TAG} Lead`,
    phone: "0812",
    estimated_value: 1500000,
  });
  expect(lead.isError).toBeFalsy();
  const [dbLead] = await q(
    "SELECT code, name, estimated_value FROM crm_leads WHERE workspace_id = ? AND name = ?",
    [ws, `${TAG} Lead`],
  );
  expect(Number(dbLead.estimated_value)).toBe(1500000);
  const found = await call(token, "qalling_search_leads", { workspace_id: ws, query: TAG });
  expect(found.content[0].text).toContain(`${TAG} Lead`);
  const idea = await call(token, "qalling_create_idea", {
    workspace_id: ws,
    title: `${TAG} Ide`,
    body: "dari AI",
  });
  expect(idea.isError).toBeFalsy();
  expect(
    (
      await q("SELECT title FROM crm_ideas WHERE workspace_id = ? AND title = ?", [
        ws,
        `${TAG} Ide`,
      ])
    ).length,
  ).toBe(1);
  const bad = await call(token, "qalling_create_lead", { workspace_id: "not-a-uuid", name: "" });
  expect(bad.isError).toBe(true);
  expect(bad.content[0].text).toContain("Invalid arguments");
  const stranger = await call(token, "qalling_list_posts", { workspace_id: crypto.randomUUID() });
  expect(stranger.isError).toBe(true);
  expect(stranger.content[0].text).toContain("Access denied");

  /* ---------- batas paket: tanpa mcp_api (Pro) semuanya ditolak ---------- */
  await setTier("qalling_pro");
  const pro = await call(token, "qalling_list_posts", { workspace_id: ws });
  expect(pro.isError).toBe(true);
  expect(pro.content[0].text).toContain("does not include AI integration");
  expect(
    JSON.parse((await call(token, "list_workspaces", {})).content[0].text).map(
      (x: { id: string }) => x.id,
    ),
  ).not.toContain(ws);
  await setTier("qalling_agency");

  /* ---------- OAuth: registrasi, persetujuan, kode sekali pakai, PKCE, refresh ---------- */
  const redirect = "https://client.example/cb";
  const reg = await request.post("/oauth/register", {
    data: { client_name: `${TAG} ChatGPT`, redirect_uris: [redirect] },
  });
  expect(reg.status()).toBe(201);
  const clientId = (await reg.json()).client_id as string;
  expect(
    (
      await request.post("/oauth/register", {
        data: { client_name: "x", redirect_uris: ["http://evil.example/cb"] },
      })
    ).status(),
  ).toBe(400);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const authUrl = (extra: Record<string, string> = {}) =>
    `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "st-1", ...extra })}`;
  // tanpa sesi: dialihkan ke login; redirect_uri tak dikenal: halaman galat, tidak dialihkan
  const noSess = await request.get(authUrl(), { maxRedirects: 0 });
  expect(noSess.status()).toBe(401);
  const noSessHtml = await noSess.text();
  expect(noSessHtml).toMatch(/href="\/qalling\/login\?next=%2Foauth%2Fauthorize/);
  expect(noSessHtml).toMatch(/href="\/auth\?next=%2Foauth%2Fauthorize/);
  const evil = await request.get(authUrl({ redirect_uri: "https://evil.example/cb" }), {
    maxRedirects: 0,
  });
  expect(evil.status()).toBe(400);
  const noPkce = await request.get(authUrl({ code_challenge_method: "plain" }), {
    maxRedirects: 0,
  });
  expect(noPkce.status()).toBe(400);

  // sesi masuk: tolak -> access_denied
  const hits: string[] = [];
  await page.route("https://client.example/**", (r) => {
    hits.push(r.request().url());
    return r.fulfill({ status: 200, body: "ok" });
  });
  await page.goto(authUrl());
  await expect(page.getByRole("heading", { name: new RegExp(`${TAG} ChatGPT`) })).toBeVisible();
  await page.getByRole("button", { name: "Tolak" }).click();
  await expect
    .poll(() => hits.at(-1) ?? "", { timeout: 15_000 })
    .toMatch(/error=access_denied.*state=st-1|state=st-1.*error=access_denied/);
  // izinkan
  await page.goto(authUrl());
  await page.getByRole("button", { name: "Izinkan" }).click();
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(2);
  const cb = new URL(hits[1]);
  expect(cb.searchParams.get("state")).toBe("st-1");
  const code = cb.searchParams.get("code")!;
  expect(code).toMatch(/^xpc_/);
  const tok = (form: Record<string, string>) => request.post("/oauth/token", { form });
  // verifier salah -> ditolak (dan kode hangus)
  const wrong = await tok({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirect,
    code_verifier: b64url(crypto.randomBytes(32)),
  });
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).error).toBe("invalid_grant");
  // kode baru: tukar dengan benar
  await page.goto(authUrl());
  await page.getByRole("button", { name: "Izinkan" }).click();
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(3);
  const code2 = new URL(hits[2]).searchParams.get("code")!;
  const ok = await tok({
    grant_type: "authorization_code",
    client_id: clientId,
    code: code2,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  expect(ok.status()).toBe(200);
  const pair = await ok.json();
  expect(pair).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  expect(
    (
      await tok({
        grant_type: "authorization_code",
        client_id: clientId,
        code: code2,
        redirect_uri: redirect,
        code_verifier: verifier,
      })
    ).status(),
  ).toBe(400); // sekali pakai
  expect((await rpc(pair.access_token, "tools/list")).status()).toBe(200);
  // refresh dirotasi
  const ref = await tok({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: pair.refresh_token,
  });
  expect(ref.status()).toBe(200);
  const pair2 = await ref.json();
  expect(pair2.access_token).not.toBe(pair.access_token);
  expect(
    (
      await tok({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: pair.refresh_token,
      })
    ).status(),
  ).toBe(400);
  // kedaluwarsa: token akses kadaluarsa ditolak
  await conn.execute(
    "UPDATE mcp_tokens SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 MINUTE) WHERE token_hash = ?",
    [crypto.createHash("sha256").update(pair2.access_token).digest("hex")],
  );
  expect((await rpc(pair2.access_token, "tools/list")).status()).toBe(401);

  /* ---------- UI: cabut aplikasi OAuth dan token pribadi ---------- */
  expect((await rpc(pair.access_token, "tools/list")).status()).toBe(200); // access lama (belum kedaluwarsa) masih sah
  await page.goto("/qalling/app/ai");
  await expect(page.getByText(`${TAG} ChatGPT`).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: `Cabut ${TAG} ChatGPT` }).click();
  await expect
    .poll(async () => (await rpc(pair.access_token, "tools/list")).status(), { timeout: 15_000 })
    .toBe(401);
  expect(
    (
      await tok({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: pair2.refresh_token,
      })
    ).status(),
  ).toBe(400);
  await page.getByRole("button", { name: `Cabut ${TAG} Claude` }).click();
  await expect
    .poll(async () => (await rpc(token, "tools/list")).status(), { timeout: 15_000 })
    .toBe(401);
});

test("MCP: halaman persetujuan meminta login lalu kembali ke persetujuan", async ({ page }) => {
  test.setTimeout(120_000);
  conn = await mysql.createConnection(DB_CONFIG);
  const clientId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)",
    [clientId, `${TAG} Login`, JSON.stringify(["https://client.example/cb"])],
  );
  const challenge = b64url(crypto.createHash("sha256").update("v".repeat(43)).digest());
  await page.goto(
    `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://client.example/cb", code_challenge: challenge, code_challenge_method: "S256", state: "s" })}`,
  );
  await expect(page.getByRole("link", { name: /Masuk dengan akun Qalling/ })).toBeVisible();
  await page.getByRole("link", { name: /Masuk dengan email & kata sandi XPERD/ }).click();
  await expect(page).toHaveURL(/\/auth\?next=/, { timeout: 30_000 });
  // isi form di halaman yang sama (helper login() membuka /auth polos sehingga parameter next hilang)
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.locator("#password").press("Enter");
  await expect(page.getByRole("heading", { name: new RegExp(`${TAG} Login`) })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/oauth\/authorize\?/);
  // sudah masuk: halaman login Qalling juga meneruskan ke persetujuan (bukan beranda Qalling)
  const here = new URL(page.url());
  await page.goto(`/qalling/login?next=${encodeURIComponent(here.pathname + here.search)}`);
  await expect(page).toHaveURL(/\/oauth\/authorize\?/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: new RegExp(`${TAG} Login`) })).toBeVisible();
});
