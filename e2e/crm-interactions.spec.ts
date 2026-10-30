import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Qalling **Inbox / Comments / Automations** (Meta native) — BS New 11, Ronde 39.
 * Tidak ada pesan sungguhan: data masuk lewat webhook **bertanda tangan HMAC** (seperti Meta),
 * dan jalur kirim diuji lewat penolakan sebelum jaringan (token tidak ada) — tanpa trafik ke Meta.
 * Dibuktikan lewat DB: keamanan webhook (handshake, tanda tangan, payload), ingest idempoten,
 * ringkasan percakapan (unread, jendela 24 jam), automasi dengan klaim durable (tidak ganda saat
 * webhook diulang), dan UI (daftar, selesaikan/buka lagi, catatan, balas komentar).
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
  // sama dengan pool aplikasi: DATETIME UTC sebagai string
  dateStrings: true,
  timezone: "Z",
};

const APP_SECRET = "e2e-app-secret-0123456789";
const VERIFY = "e2e-verify-token-0123456789";
const PAGE_ID = "e2e-page-100200300";
const PSID = "e2e-psid-777";

let conn: Connection;
let ws = "";
let accountId = "";
let priorSettings: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const sign = (raw: string, secret = APP_SECRET) =>
  `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;

const dmPayload = (mid: string, text: string, at = Date.now()) =>
  JSON.stringify({
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PSID },
            recipient: { id: PAGE_ID },
            timestamp: at,
            message: { mid, text },
          },
        ],
      },
    ],
  });
const commentPayload = (commentId: string, text: string) =>
  JSON.stringify({
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        changes: [
          {
            field: "feed",
            value: {
              item: "comment",
              verb: "add",
              comment_id: commentId,
              post_id: "e2e-post-9",
              from: { id: "e2e-user-1", name: "Siti E2E" },
              message: text,
            },
          },
        ],
      },
    ],
  });

async function cleanup() {
  if (!ws) return;
  await conn.execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND external_id = ?", [
    ws,
    PAGE_ID,
  ]); // cascade: percakapan, komentar, aturan, token
  if (priorSettings) {
    await conn.execute(
      "UPDATE crm_meta_settings SET native_social_enabled = ?, webhook_verify_token = ?, app_secret = ?, app_id = ? WHERE workspace_id = ?",
      [
        priorSettings.native_social_enabled,
        priorSettings.webhook_verify_token,
        priorSettings.app_secret,
        priorSettings.app_id,
        ws,
      ],
    );
  } else {
    await conn.execute(
      "DELETE FROM crm_meta_settings WHERE workspace_id = ? AND app_id = '10000000001'",
      [ws],
    );
  }
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("CRM Meta native: webhook aman, ingest idempoten, Inbox, Comments, Automations", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();
  priorSettings =
    (await q("SELECT * FROM crm_meta_settings WHERE workspace_id = ?", [ws]))[0] ?? null;

  /* ---------- fixture: setting Meta native + akun Meta (tanpa token) ---------- */
  if (priorSettings) {
    await conn.execute(
      "UPDATE crm_meta_settings SET native_social_enabled = 1, webhook_verify_token = ?, app_secret = ? WHERE workspace_id = ?",
      [VERIFY, APP_SECRET, ws],
    );
  } else {
    await conn.execute(
      "INSERT INTO crm_meta_settings (id, workspace_id, app_id, app_secret, status, native_social_enabled, webhook_verify_token) VALUES (UUID(), ?, '10000000001', ?, 'verified', 1, ?)",
      [ws, APP_SECRET, VERIFY],
    );
  }
  accountId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'facebook', 'E2E Page', ?, 'meta', 'connected')",
    [accountId, ws, PAGE_ID],
  );

  /* ---------- 1. keamanan webhook ---------- */
  const hook = "/api/public/meta/webhook";
  expect(
    (
      await request.get(`${hook}?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=abc`)
    ).status(),
  ).toBe(403);
  const ok = await request.get(
    `${hook}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=tantangan-123`,
  );
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("tantangan-123");
  const body1 = dmPayload("e2e-mid-1", "Halo, berapa harga paketnya?");
  expect(
    (
      await request.post(hook, { data: body1, headers: { "content-type": "application/json" } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(hook, {
        data: body1,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sign(body1, "secret-lain-0123456789"),
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(hook, {
        data: "{bukan json",
        headers: { "content-type": "application/json", "x-hub-signature-256": sign("{bukan json") },
      })
    ).status(),
  ).toBe(400);
  expect(await q("SELECT 1 FROM crm_conversations WHERE account_id = ?", [accountId])).toHaveLength(
    0,
  );

  /* ---------- 2. ingest DM: bertanda tangan valid, idempoten ---------- */
  const at = Date.now();
  const send = (raw: string) =>
    request.post(hook, {
      data: raw,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) },
    });
  const dm1 = dmPayload("e2e-mid-1", "Halo, berapa harga paketnya?", at);
  const r1 = await send(dm1);
  expect(r1.status()).toBe(200);
  expect(await r1.text()).toBe("EVENT_RECEIVED");
  await send(dm1); // webhook diulang
  const [conv] = await q("SELECT * FROM crm_conversations WHERE account_id = ?", [accountId]);
  expect(conv.participant_id).toBe(PSID);
  expect(conv.status).toBe("open");
  expect(conv.last_message).toBe("Halo, berapa harga paketnya?");
  expect(Number(conv.unread_count)).toBe(1);
  expect((await q("SELECT 1 FROM crm_messages WHERE conversation_id = ?", [conv.id])).length).toBe(
    1,
  );
  const windowMs = Date.parse(String(conv.reply_window_expires_at).replace(" ", "T") + "Z") - at;
  expect(Math.abs(windowMs - 24 * 3600 * 1000)).toBeLessThan(2000);
  // pesan kedua → unread 2
  await send(dmPayload("e2e-mid-2", "Ada diskon?", at + 1000));
  expect(
    Number(
      (await q("SELECT unread_count FROM crm_conversations WHERE id = ?", [conv.id]))[0]
        .unread_count,
    ),
  ).toBe(2);

  /* ---------- 3. Inbox UI ---------- */
  await page.goto(`/app/w/${ws}/crm/inbox`);
  await expect(page.getByRole("heading", { name: "Inbox Terpadu" })).toBeVisible({
    timeout: 60_000,
  });
  const row = page.getByRole("button", { name: new RegExp(PSID) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Ada diskon?");
  await expect(row.getByText("2", { exact: true })).toBeVisible(); // badge belum dibaca
  await row.click();
  await expect(page.getByText("Halo, berapa harga paketnya?")).toBeVisible();
  await expect
    .poll(
      async () =>
        Number(
          (await q("SELECT unread_count FROM crm_conversations WHERE id = ?", [conv.id]))[0]
            .unread_count,
        ),
      { timeout: 30_000 },
    )
    .toBe(0);
  await expect(page.getByText(/hours left/)).toBeVisible();

  // catatan internal: tersimpan sebagai 'note', tidak ada pengiriman ke Meta
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Catatan internal").fill("Follow up besok pagi");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT direction, status FROM crm_messages WHERE conversation_id = ? AND body = 'Follow up besok pagi'",
            [conv.id],
          )
        )[0]?.status,
      { timeout: 30_000 },
    )
    .toBe("note");
  // balasan tanpa token: ditolak sebelum jaringan, tidak ada pesan outbound tersimpan
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByLabel("Balasan pesan").fill("Paket mulai Rp 99.000");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Hubungkan ulang akun Meta.").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await q("SELECT 1 FROM crm_messages WHERE conversation_id = ? AND direction = 'outbound'", [
      conv.id,
    ]),
  ).toHaveLength(0);

  // selesaikan → hilang dari filter "Open"; buka lagi
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await q("SELECT status FROM crm_conversations WHERE id = ?", [conv.id]))[0].status,
      { timeout: 30_000 },
    )
    .toBe("resolved");
  await expect(page.getByRole("button", { name: new RegExp(PSID) })).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(PSID) })).toBeVisible();
  // jendela balasan ditutup → kolom balasan nonaktif
  await conn.execute(
    "UPDATE crm_conversations SET reply_window_expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
    [conv.id],
  );
  await page
    .getByRole("button", { name: "Segarkan Inbox" })
    .or(page.getByRole("button", { name: "Refresh Inbox" }))
    .first()
    .click();
  await page.getByRole("button", { name: new RegExp(PSID) }).click();
  await expect(page.getByText("Reply window closed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Balasan pesan")).toBeDisabled();

  /* ---------- 4. Automations: aturan, klaim durable ---------- */
  await page.goto(`/app/w/${ws}/crm/automations`);
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Aturan", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama aturan").fill("Balas harga");
  await dialog.getByLabel("Kata kunci (opsional)").fill("harga");
  await dialog.getByLabel("Balasan").fill("Terima kasih, paket mulai Rp 99.000");
  await dialog.getByRole("switch").click();
  await dialog.getByRole("button", { name: "Simpan aturan" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  const [rule] = await q(
    "SELECT * FROM crm_automation_rules WHERE workspace_id = ? AND name = 'Balas harga'",
    [ws],
  );
  expect(rule.trigger_type).toBe("dm");
  expect(rule.keyword).toBe("harga");
  expect(Number(rule.enabled)).toBe(1);
  expect(rule.account_id).toBe(accountId);

  // pesan cocok kata kunci → satu eksekusi (gagal karena tanpa token; tidak ada trafik); ulang → tidak ganda
  const match = dmPayload("e2e-mid-3", "Info HARGA lengkap dong", Date.now());
  await send(match);
  await send(match);
  const runs = await q("SELECT status, error FROM crm_automation_runs WHERE rule_id = ?", [
    rule.id,
  ]);
  expect(runs).toHaveLength(1);
  expect(runs[0].status).toBe("failed");
  expect(runs[0].error).toMatch(/jangan kirim ulang/);
  // pesan tak cocok → tidak ada eksekusi baru
  await send(dmPayload("e2e-mid-4", "Terima kasih", Date.now()));
  expect(await q("SELECT 1 FROM crm_automation_runs WHERE rule_id = ?", [rule.id])).toHaveLength(1);
  // riwayat eksekusi tampil di UI
  await page.reload();
  await page.getByRole("tab", { name: "Riwayat eksekusi" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Balas harga" })).toContainText("failed");
  // matikan aturan via switch
  await page.getByRole("tab", { name: "Aturan" }).click();
  await page.getByLabel("Aktifkan Balas harga").click();
  await expect
    .poll(
      async () =>
        Number(
          (await q("SELECT enabled FROM crm_automation_rules WHERE id = ?", [rule.id]))[0].enabled,
        ),
      { timeout: 30_000 },
    )
    .toBe(0);

  /* ---------- 5. Comments ---------- */
  const cm = commentPayload("e2e-comment-1", "Berapa harganya kak?");
  expect((await send(cm)).status()).toBe(200);
  await send(cm);
  expect(
    await q("SELECT 1 FROM crm_social_comments WHERE account_id = ?", [accountId]),
  ).toHaveLength(1);
  await page.goto(`/app/w/${ws}/crm/comments`);
  await expect(page.getByRole("heading", { name: "Komentar" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("E2E Page · Post e2e-post-9")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Berapa harganya kak?")).toBeVisible();
  await page.getByRole("button", { name: "Balas", exact: true }).click();
  await page.getByLabel("Balasan komentar").fill("Halo Siti, cek DM ya");
  await page.getByRole("button", { name: "Kirim balasan" }).click();
  // tanpa token: status 'failed' (peringatan), balasan tercatat, tombol Balas nonaktif
  await expect(page.getByText(/Status balasan: failed/)).toBeVisible({ timeout: 30_000 });
  const [cmt] = await q("SELECT status, reply FROM crm_social_comments WHERE account_id = ?", [
    accountId,
  ]);
  expect(cmt.status).toBe("failed");
  expect(cmt.reply).toBe("Halo Siti, cek DM ya");
  await expect(page.getByRole("button", { name: "Balas", exact: true })).toBeDisabled();
});
