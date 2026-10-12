#!/usr/bin/env node
/**
 * Audit **perilaku aksi per baris** (Ronde 32): untuk tiap halaman, buka aksi
 * baris pertama (detail / ubah / bukti) di **kedua sisi** (live + Old) lalu
 * rekam struktur yang muncul: judul dialog, label field, tipe & wajib input,
 * header tabel di dalam dialog, dan tombol aksinya.
 *
 * Aman: hanya tombol pembuka yang diklik (`detail|lihat|view|eye|pencil|edit|
 * ubah|proof|bukti|print|cetak`), sedangkan tombol destruktif
 * (`delete|hapus|remove|void|batal|storno|roll back|lock|unlock|post|approve`)
 * **tidak pernah** diklik — jadi data di sisi live tidak berubah.
 *
 * Pemakaian:
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-row-actions.mjs
 *   ROUTES="sales/pos,crm/leads" … node scripts/audit-row-actions.mjs
 *
 * Env: ROUTES (opsional, dipisah koma), AUDIT_EMAIL, AUDIT_PASSWORD,
 *      AUDIT_WORKSPACE_NAME (live: DNICORP), AUDIT_WORKSPACE_NAME_OLD (old: XPERD),
 *      LIVE_BASE, OLD_BASE, AUDIT_HEADFUL=1.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "audit");

const LIVE_BASE = (process.env.LIVE_BASE ?? "https://xperd-one.lovable.app").replace(/\/$/, "");
const OLD_BASE = (process.env.OLD_BASE ?? "http://127.0.0.1:3999").replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL ?? "";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "";
const LIVE_WS_NAME = process.env.AUDIT_WORKSPACE_NAME ?? "DNICORP";
const OLD_WS_NAME = process.env.AUDIT_WORKSPACE_NAME_OLD ?? "XPERD";
const HEADLESS = process.env.AUDIT_HEADFUL !== "1";

const DEFAULT_ROUTES = [
  "master-data/items",
  "master-data/categories",
  "master-data/uom",
  "master-data/customers",
  "master-data/suppliers",
  "master-data/warehouses",
  "master-data/taxes",
  "master-data/coa",
  "master-data/currencies",
  "master-data/exchange-rates",
  "sales/pos",
  "sales/quotations",
  "sales/sales-orders",
  "sales/delivery-orders",
  "sales/ar-invoices",
  "procurement/purchase-requests",
  "procurement/purchase-orders",
  "procurement/goods-receipts",
  "procurement/ap-invoices",
  "inventory/stock-in",
  "inventory/stock-out",
  "inventory/transfers",
  "inventory/stock-opname",
  "fixed-asset/assets",
  "accounting/journals",
  "cash-bank/cash-in",
  "crm/leads",
  "hr/employees",
];
const ROUTES = (process.env.ROUTES ?? "").split(",").filter(Boolean).length
  ? process.env.ROUTES.split(",").filter(Boolean)
  : DEFAULT_ROUTES;

/** Hanya pembuka yang aman (tidak mengubah data). */
const OPEN_RE = /detail|lihat|view|eye|pencil|edit|ubah|proof|bukti|print|cetak|rekam|riwayat/i;
/** Tombol destruktif / yang mengubah status — JANGAN diklik. */
const DENY_RE = /delete|hapus|remove|void|batal|storno|roll ?back|lock|unlock|post|posting|approve|setuju|save|simpan|submit|kirim|reopen|buka kembali|convert|konversi/i;

const log = (...a) => console.log("[row]", ...a);

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

async function login(page, base, wsName) {
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

/** Rekam isi dialog/popover yang sedang terbuka. */
const dialogFingerprint = (page) =>
  page.evaluate(() => {
    const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    const root =
      document.querySelector('[role="dialog"]') ??
      document.querySelector('[role="alertdialog"]') ??
      document.querySelector("[data-radix-popper-content-wrapper]");
    if (!root) return null;
    const fields = [...root.querySelectorAll("input,select,textarea")].map((el) => {
      const wrap = el.closest("div");
      const labelEl = wrap?.querySelector("label");
      return {
        type: el.getAttribute("type") ?? el.tagName.toLowerCase(),
        label: clean(labelEl?.textContent) || clean(el.getAttribute("placeholder")),
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        readonly: el.hasAttribute("readonly") || el.getAttribute("aria-readonly") === "true",
        disabled: el.hasAttribute("disabled"),
      };
    });
    return {
      title: clean(root.querySelector("h1,h2,h3,[data-slot='dialog-title']")?.textContent),
      labels: fields.map((f) => f.label).filter(Boolean),
      fields,
      selects: root.querySelectorAll('[role="combobox"],select').length,
      tableHeaders: [...root.querySelectorAll("table thead th")].map((th) => clean(th.textContent)).filter(Boolean),
      buttons: [...root.querySelectorAll("button")].map((b) => clean(b.textContent) || clean(b.getAttribute("aria-label"))).filter(Boolean),
      text: clean(root.innerText).slice(0, 300),
    };
  });

/** Daftar aksi baris pertama (yang aman diklik) pada tabel utama. */
const rowActions = (page) =>
  page.evaluate(
    ({ openSrc, denySrc }) => {
      const open = new RegExp(openSrc, "i");
      const deny = new RegExp(denySrc, "i");
      const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
      const main = document.querySelector("main") ?? document.body;
      // Baris empty-state ("No documents match…", "Belum ada…") bukan data.
      const EMPTY_RE = /no .*match|nothing|belum ada|no data|no transaction|no records|tidak ada|no .*yet|\u2014$/i;
      const rows = [...main.querySelectorAll("table tbody tr")]
        .filter((tr) => tr.querySelector("td"))
        .filter((tr) => {
          const cells = tr.querySelectorAll("td");
          const txt = clean(tr.innerText);
          const single = cells.length === 1 && (cells[0].hasAttribute("colspan") || cells[0].getAttribute("colspan"));
          return !(single && EMPTY_RE.test(txt)) && !(cells.length <= 2 && EMPTY_RE.test(txt));
        });
      if (!rows.length) return { rowCount: 0, actions: [] };
      // baris pertama yang punya tombol aksi (bukan baris "kosong")
      let target = null;
      for (const tr of rows) {
        if (tr.querySelector("button,[role='button'],a[href]")) {
          target = tr;
          break;
        }
      }
      if (!target) return { rowCount: rows.length, actions: [] };
      const actions = [...target.querySelectorAll("button,[role='button'],a[href]")]
        .map((el) => {
          const name = clean(el.getAttribute("aria-label")) || clean(el.getAttribute("title")) || clean(el.textContent);
          return { name, tag: el.tagName.toLowerCase(), allowed: !!name && open.test(name) && !deny.test(name) };
        })
        .filter((a) => a.name);
      return { rowCount: rows.length, actions };
    },
    { openSrc: OPEN_RE.source, denySrc: DENY_RE.source },
  );

async function closeOverlay(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator('[role="dialog"],[data-radix-popper-content-wrapper]').count())) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(400);
}

/** Sidik jari halaman detail dokumen (tujuan Preview/Print). */
const pageFingerprint = (page, base) =>
  page.evaluate((baseUrl) => {
    const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    const main = document.querySelector("main") ?? document.body;
    return {
      path: location.pathname.replace(/^\/app\/w\/[^/]+/, "").replace(baseUrl, ""),
      search: location.search,
      headings: [...main.querySelectorAll("h1,h2,h3")].map((h) => clean(h.textContent)).filter(Boolean).slice(0, 8),
      tableHeaders: [...main.querySelectorAll("table thead th")].map((th) => clean(th.textContent)).filter(Boolean),
      buttons: [...main.querySelectorAll("button")].map((b) => clean(b.textContent) || clean(b.getAttribute("aria-label"))).filter(Boolean).slice(0, 12),
      text: clean(main.innerText).slice(0, 260),
    };
  }, base);

/** Aksi yang boleh berbeda karena status dokumen berbeda (bukan celah parity). */
const STATE_ACTIONS = {
  "procurement/purchase-requests": {
    note: "baris dev Old masih draft → Edit draft/Delete memang tampil (di kode New 10 pun hanya untuk status draft)",
    actions: ["Edit draft", "Delete"],
  },
};

async function auditSide(browser, side, base, wsName) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const out = {};
  try {
    const wsId = await login(page, base, wsName);
    for (const route of ROUTES) {
      await gotoRetry(page, `${base}/app/w/${wsId}/${route}`);
      // tunggu tabel berhenti "memuat" supaya jumlah baris tidak salah baca
      await page
        .locator("table tbody tr, main table")
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(() => {});
      await page.waitForTimeout(3_500);
      const { rowCount, actions } = await rowActions(page);
      const opened = [];
      for (const action of actions) {
        if (!action.allowed) continue;
        if (opened.length >= 3) break;
        // Aksi yang memang hanya muncul untuk status tertentu di sisi ini tidak
        // perlu dibuka (sudah dijelaskan STATE_ACTIONS) — hemat slot pembanding.
        if ((STATE_ACTIONS[route]?.actions ?? []).includes(action.name)) continue;
        // Print: buka langsung URL cetak dari halaman detail yang sudah diketahui
        // (± deterministic; klik Print kadang membuka tab yang langsung menutup).
        if (/print|cetak/i.test(action.name)) {
          const detail = opened.find((o) => o.page?.path)?.page?.path;
          if (detail) {
            await gotoRetry(page, `${base}/app/w/${wsId}${detail}?print=1`);
            await page.waitForTimeout(2_500);
            const pf = await pageFingerprint(page, base);
            opened.push({ action: action.name, opened: true, fingerprint: null, page: pf, viaUrl: true });
            await gotoRetry(page, `${base}/app/w/${wsId}/${route}`);
            await page.waitForTimeout(2_000);
            continue;
          }
        }
        try {
          const btn = page
            .locator("table tbody tr")
            .filter({ has: page.locator("td") })
            .first()
            .getByRole(action.tag === "a" ? "link" : "button", { name: action.name, exact: false })
            .first();
          // Preview/Print biasanya `<Link>` → tab baru (halaman detail dokumen).
          const [popup] = await Promise.all([
            page.waitForEvent("page", { timeout: 2_500 }).catch(() => null),
            btn.click({ timeout: 8_000 }),
          ]);
          const target = popup ?? page;
          await target.waitForLoadState("domcontentloaded").catch(() => {});
          await target.waitForTimeout(2_000);
          const fp = await dialogFingerprint(target);
          const pageFp = fp ? null : await pageFingerprint(target, base);
          opened.push({ action: action.name, opened: !!(fp || pageFp), fingerprint: fp, page: pageFp });
          if (popup) await popup.close().catch(() => {});
          else if (pageFp) await page.keyboard.press("Escape").catch(() => {});
          await closeOverlay(page);
          if (!page.url().includes(route)) await gotoRetry(page, `${base}/app/w/${wsId}/${route}`), await page.waitForTimeout(2_000);
        } catch (e) {
          opened.push({ action: action.name, error: e.message.slice(0, 120) });
          await closeOverlay(page);
        }
      }
      out[route] = { rowCount, actions, opened };
      log(`${side} ${route} → baris=${rowCount}, aksi=${actions.length}, dibuka=${opened.length}`);
    }
  } catch (e) {
    log(`${side} GAGAL:`, e.message);
  }
  await ctx.close();
  return out;
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: HEADLESS,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const result = { live: await auditSide(browser, "live", LIVE_BASE, LIVE_WS_NAME), old: await auditSide(browser, "old", OLD_BASE, OLD_WS_NAME) };
await browser.close();

const file = path.join(OUT_DIR, "row-actions-parity.json");
await writeFile(file, JSON.stringify(result, null, 1));

const DOCNO_RE = /^[A-Z0-9][A-Z0-9\/\-]*\d[A-Z0-9\/\-]*$/i;
const normPath = (p) => (p ?? "").replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/<docId>");
const normHead = (h) => (!/\s/.test(h) && /\d/.test(h) && DOCNO_RE.test(h) ? "<docNumber>" : h);
/** Ringkas satu aksi yang dibuka (dialog atau halaman detail) untuk dibandingkan. */
const summarize = (opened) =>
  (opened ?? []).map((x) => {
    if (x.fingerprint) return [x.action, "dialog", x.fingerprint.title, x.fingerprint.labels];
    if (x.page)
      return [
        x.action,
        "page",
        normPath(x.page.path),
        x.page.search,
        (x.page.headings ?? []).map(normHead),
        x.page.tableHeaders,
        x.page.buttons,
      ];
    return [x.action, null];
  });

let same = 0;
let diff = 0;
let cannot = 0;
let expected = 0;
for (const route of ROUTES) {
  const l = result.live[route];
  const o = result.old[route];
  if (!l || !o) continue;
  const lAct = (l.actions ?? []).map((a) => a.name).join("|");
  const oAct = (o.actions ?? []).map((a) => a.name).join("|");
  const known = STATE_ACTIONS[route];
  const lActN = (l.actions ?? []).filter((a) => !known?.actions.includes(a.name)).map((a) => a.name).join("|");
  const oActN = (o.actions ?? []).filter((a) => !known?.actions.includes(a.name)).map((a) => a.name).join("|");
  const lFp = JSON.stringify(summarize(l.opened).filter((x) => !known?.actions.includes(x[0])));
  const oFp = JSON.stringify(summarize(o.opened).filter((x) => !known?.actions.includes(x[0])));
  if (!l.rowCount || !o.rowCount) {
    cannot++;
    console.log(`🎫 ${route}: tidak bisa dibanding (baris data live=${l.rowCount}, old=${o.rowCount})`);
    continue;
  }
  if (lActN === oActN && lFp === oFp) {
    if (lAct !== oAct) {
      expected++;
      console.log(`ℹ️ ${route}: sama; beda aksi karena status dokumen (${known?.note ?? "-"})`);
    } else {
      same++;
      console.log(`✅ ${route}: aksi & dialog/halaman detail sama`);
    }
    continue;
  }
  diff++;
  console.log(`⚠️ ${route}:`);
  if (lActN !== oActN) {
    console.log(`   aksi live: ${lActN || "—"}`);
    console.log(`   aksi old : ${oActN || "—"}`);
  }
  if (lFp !== oFp) {
    console.log(`   live: ${lFp}`);
    console.log(`   old : ${oFp}`);
  }
}
console.log(`\nhasil: ${same} sama · ${expected} sama (beda status) · ${diff} beda · ${cannot} tidak bisa dibanding → ${path.relative(ROOT, file)}`);
