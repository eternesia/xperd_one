import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * DOKU Checkout (BS New 13): Super Admin menambah gateway DOKU (Client ID + Secret Key tulis-saja), uji checkout (sandbox),
 * tenant top-up lewat DOKU, webhook bertanda tangan HMAC (body mentah + path), tombol "Cek", idempotensi. Server DOKU tiruan
 * di :4596 (container memakai DOKU_API_BASE). Angka dihitung ulang dari SQL; tanda tangan dihitung ulang di mock:
 *   Signature = HMACSHA256(secret, "Client-Id:…\nRequest-Id:…\nRequest-Timestamp:…\nRequest-Target:<path>[\nDigest:<sha256 b64 body>]")
 * Saldo/top-up/invoice dev dipulihkan di akhir; gateway uji dihapus.
 */
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
const WEBHOOK_PATH = "/api/public/webhooks/wallet-doku";
const sig = (
  clientId: string,
  requestId: string,
  ts: string,
  path: string,
  secret: string,
  body?: string,
) => {
  const lines = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${ts}`,
    `Request-Target:${path}`,
  ];
  if (body !== undefined)
    lines.push(`Digest:${crypto.createHash("sha256").update(body).digest("base64")}`);
  return `HMACSHA256=${crypto.createHmac("sha256", secret).update(lines.join("\n")).digest("base64")}`;
};

let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
let tenantId = "";
let gwId = "";
let snap: { at: string; balance: number } | null = null;
let mock: http.Server | null = null;

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (mock) await new Promise((r) => mock!.close(r));
  if (!conn) return;
  if (snap && tenantId) {
    for (const t of ["wallet_ledger", "invoices", "topups", "billing_operations"])
      await conn.execute(`DELETE FROM ${t} WHERE tenant_id = ? AND created_at > ?`, [
        tenantId,
        snap.at,
      ]);
    await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
      snap.balance,
      tenantId,
    ]);
    await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [
      snap.balance,
      tenantId,
    ]);
  }
  await conn.execute("DELETE FROM payment_gateways WHERE display_name = 'E2E DOKU' OR id = ?", [
    gwId || "-",
  ]);
  await conn.end();
});

test("DOKU: gateway dari admin (kunci tulis-saja), uji checkout, top-up, webhook HMAC, Cek, idempoten", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const CLIENT_ID = `BRN-${crypto.randomInt(1000, 9999)}-${Date.now()}`;
  const SECRET = `SK-${crypto.randomBytes(10).toString("hex")}`;

  /* ---------- server DOKU tiruan ---------- */
  const checkouts: {
    invoice: string;
    amount: number;
    body: Record<string, any>;
    sigOk: boolean;
  }[] = [];
  const status = new Map<string, string>();
  let statusHits = 0;
  const seen: string[] = [];
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const h = req.headers;
      const path = req.url ?? "";
      const ok =
        h["client-id"] === CLIENT_ID &&
        h.signature ===
          sig(
            CLIENT_ID,
            String(h["request-id"]),
            String(h["request-timestamp"]),
            path,
            SECRET,
            req.method === "POST" ? raw : undefined,
          );
      res.setHeader("Content-Type", "application/json");
      if (!ok) {
        res.statusCode = 401;
        return res.end("{}");
      }
      if (req.method === "POST" && path === "/checkout/v1/payment") {
        const body = JSON.parse(raw);
        checkouts.push({
          invoice: body.order.invoice_number,
          amount: body.order.amount,
          body,
          sigOk: true,
        });
        return res.end(
          JSON.stringify({
            response: {
              payment: {
                url: `http://host.docker.internal:4596/pay/${body.order.invoice_number}`,
              },
            },
          }),
        );
      }
      const m = path.match(/^\/orders\/v1\/status\/(.+)$/);
      if (req.method === "GET" && m) {
        const ref = decodeURIComponent(m[1]);
        statusHits++;
        const c = checkouts.find((x) => x.invoice === ref);
        return res.end(
          JSON.stringify({
            order: { invoice_number: ref, amount: c?.amount ?? 0 },
            transaction: { status: status.get(ref) ?? "PENDING" },
          }),
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => mock!.listen(4596, "0.0.0.0", r));
  // Browser host tidak mengenal host.docker.internal: halaman bayar tiruan dijawab langsung.
  await page.route("http://host.docker.internal:4596/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>DOKU checkout tiruan</h1>" }),
  );
  page.on("response", async (r) => {
    if (r.url().includes("/_serverFn/")) seen.push(await r.text().catch(() => ""));
  });

  await login(page);
  const ws = await resolveWorkspaceId(page);
  tenantId = String((await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]))[0].tenant_id);
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  snap = {
    at: String((await q("SELECT NOW(6) AS n"))[0].n),
    balance: Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  };

  /* ---------- 1. Super Admin menambah gateway DOKU ---------- */
  await page.goto("/app-admin/payments");
  await page.getByRole("button", { name: "Add gateway" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("select").first().selectOption("doku");
  // form khusus DOKU: Client ID + Secret Key; tanpa Client key / nama secret env
  await expect(dlg.getByText("DOKU Client ID", { exact: true })).toBeVisible();
  await expect(dlg.getByText("DOKU Secret Key", { exact: true })).toBeVisible();
  await expect(dlg.getByText("Client key (publishable)")).toHaveCount(0);
  await expect(dlg.getByText("Server key secret name")).toHaveCount(0);
  await expect(dlg.locator("input[readonly]")).toHaveValue(/\/api\/public\/webhooks\/wallet-doku$/);
  await dlg.locator("input:not([type])").nth(0).fill("E2E DOKU");
  const idField = dlg
    .locator("div.space-y-2")
    .filter({ hasText: /^DOKU Client ID/ })
    .locator("input");
  await idField.fill(CLIENT_ID);
  // tanpa Secret Key: aktif ditolak
  await dlg.getByLabel("Active for tenant checkout").click();
  await dlg.getByRole("button", { name: "Save gateway" }).click();
  await expect(
    page.getByText("Isi Client ID dan Secret Key DOKU sebelum mengaktifkan gateway.").first(),
  ).toBeVisible({ timeout: 15_000 });
  await dlg.locator("#gw-server-key").fill(SECRET);
  await dlg.locator("textarea").fill("Bayar dengan DOKU Checkout.");
  await dlg.getByRole("button", { name: "Save gateway" }).click();
  await expect
    .poll(
      async () =>
        (await q("SELECT id FROM payment_gateways WHERE display_name = 'E2E DOKU'")).length,
      {
        timeout: 30_000,
      },
    )
    .toBe(1);
  const [gw] = await q("SELECT * FROM payment_gateways WHERE display_name = 'E2E DOKU'");
  gwId = String(gw.id);
  expect(gw).toMatchObject({
    provider: "doku",
    merchant_id: CLIENT_ID,
    server_key: SECRET,
    mode: "sandbox",
  });
  expect(Number(gw.is_active)).toBe(1);

  // uji checkout (hanya sandbox): tautan checkout contoh, saldo tidak berubah
  await page.goto("/app-admin/payments");
  const gwRow = page.getByRole("row").filter({ hasText: "E2E DOKU" });
  await gwRow.getByRole("button", { name: "Uji checkout" }).click();
  await page
    .waitForURL(/host\.docker\.internal:4596\/pay\/TEST-/, { timeout: 30_000 })
    .catch(() => undefined);
  await expect.poll(() => checkouts.length, { timeout: 30_000 }).toBe(1);
  expect(checkouts[0].invoice).toMatch(/^TEST-/);
  expect(checkouts[0].amount).toBe(10000);
  expect(checkouts[0].body.order.auto_redirect).toBe(false); // uji tanpa tujuan kembali
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(snap.balance);
  expect(seen.join("\n")).not.toContain(SECRET);

  /* ---------- 2. tenant top-up lewat DOKU ---------- */
  const [settings] = await q("SELECT min_topup_idr FROM wallet_settings");
  const amount = Number(settings.min_topup_idr) + 12_345;
  const topupVia = async (note: string) => {
    await page.goto(`/app/w/${ws}/billing`);
    await expect(page.getByRole("heading", { name: "Deposit balance" })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Top up", exact: true }).click();
    const d = page.getByRole("dialog");
    await d.locator("#wallet-amount").fill(String(amount));
    await d.getByRole("combobox").click();
    await page.getByRole("option", { name: /E2E DOKU/ }).click();
    await d.locator("#wallet-note").fill(note);
    await d.getByRole("button", { name: "Request top-up" }).click();
    await page
      .waitForURL(/host\.docker\.internal:4596\/pay\/WAL-/, { timeout: 30_000 })
      .catch(() => undefined);
    await expect
      .poll(async () => (await q("SELECT id FROM topups WHERE note = ?", [note])).length, {
        timeout: 30_000,
      })
      .toBe(1);
    return (await q("SELECT * FROM topups WHERE note = ?", [note]))[0];
  };
  const t1 = await topupVia("E2E DOKU satu");
  expect(t1).toMatchObject({ gateway: "doku", status: "pending", gateway_ref: `WAL-${t1.id}` });
  expect(Number(t1.amount_idr)).toBe(amount);
  expect(t1.checkout_started_at).not.toBeNull();
  expect(t1.expires_at).not.toBeNull();
  expect(String(t1.payment_url)).toBe(`http://host.docker.internal:4596/pay/WAL-${t1.id}`);
  const c1 = checkouts.find((c) => c.invoice === `WAL-${t1.id}`)!;
  expect(c1.amount).toBe(amount);
  // tujuan kembali: hanya halaman billing; browser tidak pernah mengkredit saldo
  expect(c1.body.order.auto_redirect).toBe(true);
  expect(new URL(c1.body.order.callback_url).pathname).toBe(`/app/w/${ws}/billing`);
  expect(c1.body.order.callback_url_result).toBe(c1.body.order.callback_url);
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(snap.balance);

  /* ---------- 3. webhook: tanda tangan, nominal, status, idempoten ---------- */
  const hook = async (
    payload: unknown,
    o: { secret?: string; clientId?: string; unsigned?: boolean; raw?: string } = {},
  ) => {
    const body = o.raw ?? JSON.stringify(payload);
    const rid = crypto.randomUUID();
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!o.unsigned) {
      headers["Client-Id"] = o.clientId ?? CLIENT_ID;
      headers["Request-Id"] = rid;
      headers["Request-Timestamp"] = ts;
      headers.Signature = sig(
        o.clientId ?? CLIENT_ID,
        rid,
        ts,
        WEBHOOK_PATH,
        o.secret ?? SECRET,
        body,
      );
    }
    return (await request.post(WEBHOOK_PATH, { headers, data: body })).status();
  };
  const notice = (ref: string, amt: number, st: string) => ({
    order: { invoice_number: ref, amount: amt },
    transaction: { status: st },
  });
  const balance = async () =>
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    );
  const ref1 = `WAL-${t1.id}`;
  expect(await hook(null, { raw: "bukan json" })).toBe(400);
  expect(await hook({ order: {} })).toBe(400);
  expect(await hook(notice(ref1, amount, "SUCCESS"), { unsigned: true })).toBe(401);
  expect(await hook(notice(ref1, amount, "SUCCESS"), { secret: "kunci-salah" })).toBe(401);
  expect(await hook(notice(ref1, amount, "SUCCESS"), { clientId: "BRN-lain" })).toBe(401);
  expect(await hook(notice("WAL-tidak-ada", amount, "SUCCESS"))).toBe(401);
  expect(await hook(notice(ref1, amount - 1, "SUCCESS"))).toBe(400); // nominal beda (tanda tangan benar)
  expect(await hook(notice(ref1, amount, "PENDING"))).toBe(200); // belum lunas: tidak ada saldo
  expect(await hook(notice(ref1, amount, "FAILED"))).toBe(200); // kanal gagal: order tetap bisa dibayar
  expect((await q("SELECT status FROM topups WHERE id = ?", [t1.id]))[0].status).toBe("pending");
  expect(await balance()).toBe(snap.balance);

  expect(await hook(notice(ref1, amount, "SUCCESS"))).toBe(200);
  expect((await q("SELECT status FROM topups WHERE id = ?", [t1.id]))[0].status).toBe("paid");
  expect(await balance()).toBe(snap.balance + amount);
  const [led] = await q(
    "SELECT * FROM wallet_ledger WHERE tenant_id = ? AND entry_type = 'topup' AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    [tenantId, snap.at],
  );
  expect(Number(led.amount_idr)).toBe(amount);
  expect(Number(led.balance_after)).toBe(snap.balance + amount);
  expect(
    (await q("SELECT COUNT(*) AS n FROM invoices WHERE invoice_number = ?", [`TOP-${t1.id}`]))[0].n,
  ).toBe(1);
  // notifikasi ulang: idempoten, saldo tidak berganda
  expect(await hook(notice(ref1, amount, "SUCCESS"))).toBe(200);
  expect(await balance()).toBe(snap.balance + amount);
  expect(
    (
      await q(
        "SELECT COUNT(*) AS n FROM wallet_ledger WHERE tenant_id = ? AND entry_type = 'topup' AND created_at > ?",
        [tenantId, snap.at],
      )
    )[0].n,
  ).toBe(1);

  /* ---------- 4. tombol "Cek": status dibaca dari DOKU ---------- */
  const t2 = await topupVia("E2E DOKU dua");
  const ref2 = `WAL-${t2.id}`;
  await page.goto(`/app/w/${ws}/billing`);
  const row2 = page.getByRole("row").filter({ hasText: String(t2.id).slice(0, 8) });
  await expect(row2).toBeVisible({ timeout: 60_000 });
  await row2.getByRole("button", { name: "Check" }).click(); // masih PENDING di DOKU
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE id = ?", [t2.id]))[0].status)
    .toBe("pending");
  expect(await balance()).toBe(snap.balance + amount);
  await expect.poll(() => statusHits, { timeout: 30_000 }).toBeGreaterThan(0); // permintaan status pertama sudah dijawab PENDING
  status.set(ref2, "SUCCESS");
  await page.goto(`/app/w/${ws}/billing`);
  await page
    .getByRole("row")
    .filter({ hasText: String(t2.id).slice(0, 8) })
    .getByRole("button", { name: "Check" })
    .click();
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE id = ?", [t2.id]))[0].status, {
      timeout: 30_000,
    })
    .toBe("paid");
  expect(await balance()).toBe(snap.balance + 2 * amount);
});
