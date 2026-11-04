import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import http from "node:http";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Port ringan BS New 16 (Ronde 56): Sumber daftar tenant, kebijakan media (batas foto/video ditegakkan server), komentar pertama + cover postingan
 * (validasi server, opsi target Tebar), dan pager Tebar berbasis kursor. Tebar tiruan :4597 (`TEBAR_API_BASE`). Data & pengaturan dipulihkan.
 */
test.use({ storageState: "e2e/lang-en.storage.json" });

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

const TAG = `E2E16${Date.now().toString().slice(-6)}`;
const KEY = "tb_e2e_new16_key";
let ws = "";
let tebar: http.Server | undefined;
let priorTebar: RowDataPacket | null = null;
let priorMedia: RowDataPacket | null = null;
type Call = { method: string; path: string; body: any };
const calls: Call[] = [];
const ACCOUNTS = Array.from({ length: 7 }, (_, i) => ({
  id: `${TAG}-acc${i + 1}`,
  platform: i % 2 ? "facebook" : "instagram",
  name: `Akun ${TAG} ${i + 1}`,
  username: `u${i + 1}`,
}));

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  priorTebar = (await q("SELECT * FROM tebar_settings WHERE id = 'platform'"))[0] ?? null;
  priorMedia = (await q("SELECT * FROM media_upload_settings WHERE singleton = 1"))[0] ?? null;
  await new Promise<void>((resolve) => {
    tebar = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://x");
        let body: any = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          /* ignore */
        }
        calls.push({ method: req.method ?? "", path: url.pathname + url.search, body });
        const send = (j: unknown) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(j));
        };
        const p = url.pathname;
        if (req.method === "GET" && p === "/accounts") {
          // halaman tetap 3 akun, kursor = indeks awal berikutnya
          const start = Number(url.searchParams.get("cursor") ?? 0);
          const slice = ACCOUNTS.slice(start, start + 3);
          return send({
            data: slice,
            next_cursor: start + 3 < ACCOUNTS.length ? String(start + 3) : null,
          });
        }
        if (req.method === "GET" && p.startsWith("/accounts/"))
          return send({ data: { id: p.split("/")[2], profile_id: "prof-e2e" } });
        if (req.method === "POST" && p === "/media/from-url")
          return send({ data: { id: `media-${calls.length}` } });
        if (req.method === "POST" && p === "/posts")
          return send({
            data: {
              id: `${TAG}-post`,
              targets: (body.targets ?? []).map((t: any) => ({
                account_id: t.account_id,
                status: "published",
                permalink: "https://ig.example/p/1",
                first_comment: t.options?.first_comment
                  ? { status: "published", comment_id: "fc1" }
                  : undefined,
              })),
            },
          });
        return send({ data: [] });
      });
    });
    tebar!.listen(4597, "0.0.0.0", resolve);
  });
});

test.afterAll(async () => {
  tebar?.close();
  if (!conn) return;
  if (ws) {
    await conn.execute("DELETE FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE ?", [
      ws,
      `${TAG}%`,
    ]);
    await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE ?", [
      ws,
      `${TAG}%`,
    ]);
    await conn.execute(
      "DELETE FROM crm_social_accounts WHERE workspace_id = ? AND account_name LIKE ?",
      [ws, `${TAG}%`],
    );
  }
  await conn.execute("DELETE FROM tenants WHERE name LIKE ?", [`${TAG}%`]);
  if (priorTebar)
    await conn.execute("UPDATE tebar_settings SET api_key = ?, status = ? WHERE id = 'platform'", [
      priorTebar.api_key,
      priorTebar.status,
    ]);
  else await conn.execute("DELETE FROM tebar_settings WHERE id = 'platform'");
  if (priorMedia)
    await conn.execute(
      "UPDATE media_upload_settings SET photo_mb = ?, video_mb = ?, image_quality = ?, image_max_edge = ?, compress_images = ?, compress_videos = ?, video_mbps = ? WHERE singleton = 1",
      [
        priorMedia.photo_mb,
        priorMedia.video_mb,
        priorMedia.image_quality,
        priorMedia.image_max_edge,
        priorMedia.compress_images,
        priorMedia.compress_videos,
        priorMedia.video_mbps,
      ],
    );
  await conn.end();
});

test("NEW 16 ringan: sumber daftar, kebijakan media, komentar pertama + cover, pager Tebar", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const call = <T>(mod: string, fn: string, data: unknown) =>
    page.evaluate(
      async ({ mod, fn, data }) => {
        const m = await import(/* @vite-ignore */ mod);
        try {
          return { ok: true, v: (await m[fn]({ data })) as unknown };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      { mod, fn, data },
    ) as Promise<{ ok: boolean; v?: any; error?: string }>;

  /* ---------- Sumber daftar ---------- */
  const [t0] = await q("SELECT id FROM tenants WHERE signup_source IS NULL LIMIT 1");
  const made = await call("/src/lib/platform.functions.ts", "adminSave", {
    table: "tenants",
    data: {
      name: `${TAG} Tenant`,
      subdomain: `e2e16-${Date.now().toString().slice(-6)}`,
      status: "trial",
      signup_source: "qalling",
    },
  });
  expect(made.ok, made.error).toBe(true);
  expect(
    (await q("SELECT signup_source FROM tenants WHERE name = ?", [`${TAG} Tenant`]))[0]
      .signup_source,
  ).toBe("admin"); // diisi server, tidak bisa dipalsukan dari form
  await page.goto("/app-admin/tenancy");
  await expect(page.getByRole("columnheader", { name: "Sumber daftar" })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByPlaceholder(/Search|Cari/)
    .first()
    .fill(`${TAG} Tenant`);
  await expect(page.getByRole("row").filter({ hasText: `${TAG} Tenant` })).toContainText(
    "Super Admin",
  );
  if (t0)
    expect(["qalling", "xperd", "admin", null]).toContain(
      (await q("SELECT signup_source FROM tenants WHERE id = ?", [t0.id]))[0].signup_source,
    );

  /* ---------- Kebijakan media ---------- */
  await page.goto("/app-admin/storage");
  await expect(page.getByRole("heading", { name: "Unggahan & kualitas media" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#media-photo_mb").fill("1");
  await page.locator("#media-video_mb").fill("2");
  await page.locator("#media-image_quality").fill("80"); // di luar 85–100 → ditolak
  await page.getByRole("button", { name: "Simpan pengaturan media" }).click();
  // validasi bawaan form: nilai di luar 85–100 tidak dikirim
  expect(
    await page
      .locator("#media-image_quality")
      .evaluate((el: HTMLInputElement) => el.validity.valid),
  ).toBe(false);
  await page.locator("#media-image_quality").fill("90");
  await page.getByRole("button", { name: "Simpan pengaturan media" }).click();
  await expect(page.getByText("Pengaturan media tersimpan").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await q(
      "SELECT photo_mb, video_mb, image_quality FROM media_upload_settings WHERE singleton = 1",
    ),
  ).toMatchObject([{ photo_mb: 1, video_mb: 2, image_quality: 90 }]);
  // server menegakkan batas (foto 2 MB > 1 MB, video 3 MB > 2 MB) walau UI dilewati
  const rowData = (mime: string, size: number, i: number) => ({
    table: "crm_media",
    workspaceId: ws,
    data: {
      name: `${TAG} m${i}`,
      file_path: `${ws}/${TAG}-${i}.bin`,
      mime_type: mime,
      size_bytes: size,
    },
  });
  const bigPhoto = await call(
    "/src/lib/data.functions.ts",
    "saveWorkspaceRow",
    rowData("image/png", 2 * 1048576, 1),
  );
  expect(bigPhoto.ok).toBe(false);
  expect(bigPhoto.error).toContain("Photo exceeds configured upload limit");
  const bigVideo = await call(
    "/src/lib/data.functions.ts",
    "saveWorkspaceRow",
    rowData("video/mp4", 3 * 1048576, 2),
  );
  expect(bigVideo.error).toContain("Video exceeds configured upload limit");
  expect(
    (await call("/src/lib/data.functions.ts", "saveWorkspaceRow", rowData("image/png", 500_000, 3)))
      .ok,
  ).toBe(true);
  // UI Media: teks batas mengikuti kebijakan, berkas terlalu besar ditolak di klien
  await page.goto("/qalling/app/media");
  await expect(page.getByText("Photos up to 1 MB · Videos up to 2 MB")).toBeVisible({
    timeout: 60_000,
  });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "besar.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(1_200_000, 1),
    });
  await expect(page.getByText(/besar\.png: .*1 MB/).first()).toBeVisible({ timeout: 30_000 });
  expect(
    await q("SELECT 1 FROM crm_media WHERE workspace_id = ? AND name = 'besar.png'", [ws]),
  ).toHaveLength(0);

  /* ---------- Komentar pertama + cover ---------- */
  const igId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, external_id, source, status) VALUES (?, ?, 'instagram', ?, 'e2e', ?, 'tebar', 'connected')",
    [igId, ws, `${TAG} IG`, `${TAG}-igext`],
  );
  const coverPath = `${ws}/${TAG}-cover.png`;
  const videoPath = `${ws}/${TAG}-video.mp4`;
  await conn.execute(
    "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes) VALUES (UUID(), ?, ?, ?, 'image/png', 1000), (UUID(), ?, ?, ?, 'video/mp4', 1000)",
    [ws, `${TAG} cover`, coverPath, ws, `${TAG} video`, videoPath],
  );
  const mkPost = async (
    title: string,
    extra: { comment?: string | null; cover?: string | null; paths: string[] },
  ) => {
    const id = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, media_paths, account_ids, scheduled_at, status, source, first_comment, cover_path) VALUES (?, ?, ?, 'caption e2e', ?, ?, UTC_TIMESTAMP(6), 'scheduled', 'manual', ?, ?)",
      [
        id,
        ws,
        title,
        JSON.stringify(extra.paths),
        JSON.stringify([igId]),
        extra.comment ?? null,
        extra.cover ?? null,
      ],
    );
    return id;
  };
  // validasi server pada simpan: komentar > 8000 dan cover bukan milik workspace ditolak
  const post0 = await mkPost(`${TAG} p0`, { paths: [videoPath] });
  const tooLong = await call("/src/lib/data.functions.ts", "saveWorkspaceRow", {
    table: "crm_scheduled_posts",
    workspaceId: ws,
    id: post0,
    data: { first_comment: "x".repeat(8001) },
  });
  expect(tooLong.error).toContain("terlalu panjang");
  const badCover = await call("/src/lib/data.functions.ts", "saveWorkspaceRow", {
    table: "crm_scheduled_posts",
    workspaceId: ws,
    id: post0,
    data: { cover_path: `${crypto.randomUUID()}/orang-lain.png` },
  });
  expect(badCover.error).toContain("milik workspace ini");
  expect(
    (
      await call("/src/lib/data.functions.ts", "saveWorkspaceRow", {
        table: "crm_scheduled_posts",
        workspaceId: ws,
        id: post0,
        data: { cover_path: coverPath, first_comment: "Hashtag #a" },
      })
    ).ok,
  ).toBe(true);

  // UI composer: bidang komentar pertama + cover muncul untuk akun Tebar Instagram; simpan draf menyimpan keduanya
  await page.goto("/qalling/app/post-scheduler");
  await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Create post" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg
    .getByPlaceholder("Write your caption, hashtags and call to action…")
    .fill(`${TAG} draf`);
  await expect(dlg.getByText("Automatic first comment")).toBeVisible();
  await expect(dlg.getByText("Video cover / thumbnail")).toBeVisible();
  await dlg.getByPlaceholder("Hashtags, links or an extra message…").fill("Komentar pertama e2e");
  await expect(dlg.getByText(/Instagram · 20\/2200/)).toBeVisible();
  await dlg.getByRole("button", { name: "Save draft" }).click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT first_comment FROM crm_scheduled_posts WHERE workspace_id = ? AND caption = ?",
            [ws, `${TAG} draf`],
          )
        )[0]?.first_comment,
      { timeout: 30_000 },
    )
    .toBe("Komentar pertama e2e");

  // kirim lewat Tebar: media + cover diunggah, opsi target memuat first_comment & cover_media_id, hasil komentar tersimpan
  await conn.execute(
    "INSERT INTO tebar_settings (id, api_key, status) VALUES ('platform', ?, 'verified') ON DUPLICATE KEY UPDATE api_key = VALUES(api_key), status = 'verified'",
    [KEY],
  );
  const post1 = await mkPost(`${TAG} p1`, {
    paths: [videoPath],
    cover: coverPath,
    comment: "Komentar via Tebar #promo",
  });
  calls.length = 0;
  const sent = await call("/src/lib/meta-social.functions.ts", "publishPostNow", { postId: post1 });
  expect(sent.ok, sent.error).toBe(true);
  expect(calls.filter((c) => c.path === "/media/from-url")).toHaveLength(2);
  const posted = calls.find((c) => c.method === "POST" && c.path === "/posts")!;
  expect(posted.body.targets[0]).toMatchObject({
    account_id: `${TAG}-igext`,
    options: { first_comment: "Komentar via Tebar #promo" },
  });
  expect(String(posted.body.targets[0].options.cover_media_id)).toMatch(/^media-/);
  const [row] = await q("SELECT status, results FROM crm_scheduled_posts WHERE id = ?", [post1]);
  expect(row.status).toBe("published");
  expect(
    (typeof row.results === "string" ? JSON.parse(row.results) : row.results)[0].first_comment,
  ).toMatchObject({ status: "published", comment_id: "fc1" });
  // tanpa video tunggal, cover ditolak; >30 hashtag di Instagram ditolak (tidak ada panggilan /posts)
  const post2 = await mkPost(`${TAG} p2`, { paths: [], cover: coverPath });
  calls.length = 0;
  const noVideo = await call("/src/lib/meta-social.functions.ts", "publishPostNow", {
    postId: post2,
  });
  expect(noVideo.error ?? "").toMatch(/Cover memerlukan satu video|not available|tidak/i);
  const post3 = await mkPost(`${TAG} p3`, {
    paths: [videoPath],
    comment: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "),
  });
  expect(
    (await call("/src/lib/meta-social.functions.ts", "publishPostNow", { postId: post3 })).error ??
      "",
  ).toMatch(/30 hashtag/);
  expect(calls.filter((c) => c.path === "/posts")).toHaveLength(0);

  /* ---------- Pager Tebar berbasis kursor ---------- */
  await page.goto("/app-admin/tebar");
  await expect(page.getByText(/^Halaman 1 · 3 akun$/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: `${TAG} 1` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();
  calls.length = 0;
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(page.getByText(/^Halaman 2 · 3 akun$/)).toBeVisible({ timeout: 30_000 });
  expect(calls.some((c) => c.path.startsWith("/accounts?") && c.path.includes("cursor=3"))).toBe(
    true,
  );
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(page.getByText(/^Halaman 3 · 1 akun$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Halaman berikutnya" })).toBeDisabled(); // tanpa kursor lanjutan
  await page.getByRole("button", { name: "Halaman sebelumnya" }).click();
  await expect(page.getByText(/^Halaman 2 · 3 akun$/)).toBeVisible();
  await page.getByPlaceholder("Cari di halaman ini…").fill(`${TAG} 6`);
  await expect(page.getByRole("row").filter({ hasText: `${TAG} 4` })).toHaveCount(0); // pencarian hanya pada halaman aktif
  await expect(page.getByRole("row").filter({ hasText: `${TAG} 6` })).toBeVisible();
});
