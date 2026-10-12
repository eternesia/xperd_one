#!/usr/bin/env node
/**
 * Audit **detail DOM** halaman: membandingkan isi halaman yang di laporan
 * `audit-parity.mjs` masih berstatus ⚠️ — header tabel, isi sel terakhir
 * (tempat aksi hidup), dan semua tombol beserta `title`/`aria-label`/teksnya.
 *
 * Kenapa perlu: sidik jari halaman hanya mencatat ringkasan (judul/tombol/
 * header). Untuk memutuskan apakah sebuah ⚠️ itu **celah nyata** atau hanya
 * **beda data** (live belum punya dokumen sehingga tombol per baris tidak
 * muncul), perlu DOM kedua sisi.
 *
 * Pemakaian:
 *   ROUTES="cash-bank/cash-in,accounting/period-closing" \
 *     AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-page-detail.mjs
 *
 * Env: ROUTES (wajib, dipisah koma, path relatif setelah `/app/w/<id>/`),
 *      AUDIT_EMAIL, AUDIT_PASSWORD, AUDIT_WORKSPACE_NAME (live: DNICORP),
 *      AUDIT_WORKSPACE_NAME_OLD (old: XPERD), LIVE_BASE, OLD_BASE, AUDIT_HEADFUL=1.
 */
import { chromium } from "@playwright/test";

const LIVE_BASE = (process.env.LIVE_BASE ?? "https://xperd-one.lovable.app").replace(/\/$/, "");
const OLD_BASE = (process.env.OLD_BASE ?? "http://127.0.0.1:3999").replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL ?? "";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "";
const ROUTES = (process.env.ROUTES ?? "").split(",").filter(Boolean);
const HEADLESS = process.env.AUDIT_HEADFUL !== "1";

if (!ROUTES.length) {
  console.error('ROUTES kosong — contoh: ROUTES="cash-bank/cash-in" node scripts/audit-page-detail.mjs');
  process.exit(1);
}

async function gotoRetry(page, url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return true;
    } catch {
      await page.waitForTimeout(3_000);
    }
  }
  return false;
}

async function open(page, base, wsName) {
  await gotoRetry(page, `${base}/auth`);
  await page.locator("#email").waitFor({ timeout: 60_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/ }).last().click();
  await page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2_500);
  await gotoRetry(page, `${base}/app`);
  const cards = page.locator('[role="button"]');
  await cards.first().waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1_200);
  const n = await cards.count();
  let idx = 0;
  for (let i = 0; i < n; i++) {
    if ((await cards.nth(i).innerText()).toUpperCase().includes(wsName.toUpperCase())) {
      idx = i;
      break;
    }
  }
  await cards.nth(idx).click();
  await page.waitForURL(/\/app\/w\//, { timeout: 45_000 });
  return page.url().match(/\/app\/w\/([^/?#]+)/)?.[1] ?? "";
}

const probe = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const table = main.querySelector("table");
    const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    return {
      headers: [...(table?.querySelectorAll("thead th") ?? [])].map((th) => clean(th.textContent)),
      lastCells: [...(table?.querySelectorAll("tbody tr") ?? [])].slice(0, 2).map((tr) => {
        const tds = [...tr.querySelectorAll("td")];
        const last = tds[tds.length - 1];
        return clean(last?.innerHTML).slice(0, 300);
      }),
      buttons: [...main.querySelectorAll("button,a[role='button']")].map((b) => ({
        t: clean(b.textContent).slice(0, 40),
        title: b.getAttribute("title") ?? "",
        aria: b.getAttribute("aria-label") ?? "",
        role: b.getAttribute("role") ?? "",
      })).slice(-18),
      checkboxes: main.querySelectorAll("input[type=checkbox]").length,
      radios: main.querySelectorAll("input[type=radio]").length,
      inputs: main.querySelectorAll("input").length,
      mainText: clean(main.innerText).slice(0, 700),
    };
  });

const browser = await chromium.launch({
  channel: "chrome",
  headless: HEADLESS,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = {};
for (const [side, base, wsName] of [
  ["live", LIVE_BASE, process.env.AUDIT_WORKSPACE_NAME ?? "DNICORP"],
  ["old", OLD_BASE, process.env.AUDIT_WORKSPACE_NAME_OLD ?? "XPERD"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  try {
    const wsId = await open(page, base, wsName);
    results[side] = {};
    for (const route of ROUTES) {
      await gotoRetry(page, `${base}/app/w/${wsId}/${route}`);
      await page.waitForTimeout(3_500);
      results[side][route] = await probe(page);
      console.log(`[page] ${side} ${route} ok`);
    }
  } catch (e) {
    console.log(`[page] ${side} GAGAL:`, e.message);
  }
  await ctx.close();
}
for (const route of ROUTES) {
  console.log(`\n===== ${route} =====`);
  for (const side of ["live", "old"]) {
    const p = results[side]?.[route];
    if (!p) continue;
    console.log(`-- ${side}`);
    console.log(`   headers: ${JSON.stringify(p.headers)}`);
    console.log(`   lastCells: ${JSON.stringify(p.lastCells)}`);
    console.log(`   buttons: ${JSON.stringify(p.buttons)}`);
    console.log(`   inputs=${p.inputs} checkbox=${p.checkboxes} radio=${p.radios}`);
    console.log(`   text: ${p.mainText.slice(0, 320)}`);
  }
}
await browser.close();
