import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";

import { login } from "./helpers";

/**
 * Super Admin → Website Content (BS New 11, Ronde 47): entri dipisah "Website XPERD" vs "Website Qalling" (section berawalan
 * `qalling.`), dengan jumlah per situs, pencarian, dan pager. Angka dihitung dari SQL; entri uji dihapus di akhir.
 */
function dbConfig() {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* opsional */
  }
  return {
    host: process.env.MYSQL_HOST ?? out.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? out.MYSQL_PORT ?? 3307),
    user: process.env.MYSQL_USER ?? out.MYSQL_USER ?? "xperd",
    password: process.env.MYSQL_PASSWORD ?? out.MYSQL_PASSWORD ?? "xperd",
    database: process.env.MYSQL_DATABASE ?? out.MYSQL_DATABASE ?? "xperd",
  };
}

test("ADMIN content: pemisah Website XPERD / Qalling + pencarian", async ({ page }) => {
  test.setTimeout(120_000);
  const conn = await mysql.createConnection(dbConfig());
  const tag = `e2e-site-${Date.now().toString().slice(-6)}`;
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    await conn.execute(
      "INSERT INTO site_content (id, section, `key`, title_en, title_id, is_published) VALUES (?, ?, ?, ?, ?, 1)",
      [ids[0], `qalling.${tag}`, "k1", `Qalling ${tag}`, `Qalling ${tag}`],
    );
    await conn.execute(
      "INSERT INTO site_content (id, section, `key`, title_en, title_id, is_published) VALUES (?, ?, ?, ?, ?, 1)",
      [ids[1], `home-${tag}`, "k2", `Xperd ${tag}`, `Xperd ${tag}`],
    );
    const count = async (qal: boolean) =>
      Number(
        (
          (await conn.query(
            `SELECT COUNT(*) n FROM site_content WHERE section ${qal ? "LIKE" : "NOT LIKE"} 'qalling.%'`,
          )) as any
        )[0][0].n,
      );
    await login(page);
    await page.goto("/app-admin/content");
    await expect(
      page.getByRole("button", { name: `Website XPERD (${await count(false)})` }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: `Website Qalling (${await count(true)})` }),
    ).toBeVisible();
    await expect(page.getByText("Konten Qalling memakai awalan section")).toBeVisible();
    // tab XPERD: hanya entri non-qalling
    await page.getByPlaceholder("Cari konten…").fill(tag);
    await expect(page.getByText(`home-${tag}`)).toBeVisible();
    await expect(page.getByText(`qalling.${tag}`)).toHaveCount(0);
    // tab Qalling: kebalikannya
    await page.getByRole("button", { name: /^Website Qalling/ }).click();
    await expect(page.getByText(`qalling.${tag}`)).toBeVisible();
    await expect(page.getByText(`home-${tag}`)).toHaveCount(0);
    // entri baru pada tab Qalling diisi awalan `qalling.`
    await page.getByRole("button", { name: "New entry" }).click();
    await expect(page.getByRole("dialog").locator("select").first()).toHaveValue("qalling.hero");
  } finally {
    await conn.execute("DELETE FROM site_content WHERE id IN (?, ?)", ids);
    await conn.end();
  }
});
