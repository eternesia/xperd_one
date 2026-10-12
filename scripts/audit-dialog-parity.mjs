#!/usr/bin/env node
/**
 * Audit **behaviour per modul**: bandingkan isi form/dialog antara aplikasi live
 * (xperd-one.lovable.app) dan Old Production.
 *
 * Sidik jari halaman (scripts/audit-parity.mjs) hanya melihat tampilan daftar.
 * Skrip ini membuka tombol **New** di setiap submodul lalu mencatat struktur
 * formnya: judul dialog, label tiap field, jenis input, wajib/tidak, opsi select,
 * dan tombol aksi. Perbedaan di sini = perbedaan perilaku yang dirasakan user.
 *
 * Pemakaian:
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-dialog-parity.mjs --module master-data
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-dialog-parity.mjs --module procurement --side-by-side
 *
 * Env: AUDIT_EMAIL, AUDIT_PASSWORD, AUDIT_WORKSPACE_NAME (live: DNICORP, old: XPERD),
 *      LIVE_BASE, OLD_BASE, AUDIT_HEADFUL=1.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const argv = process.argv.slice(2);
const moduleArg = argv.includes("--module") ? argv[argv.indexOf("--module") + 1] : "";
const routesArg = argv.includes("--routes")
  ? (argv[argv.indexOf("--routes") + 1] ?? "").split(",").filter(Boolean)
  : [];

const log = (...a) => console.log("[dialog]", ...a);

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
  // pilih workspace berdasarkan nama
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
  await page.waitForTimeout(2_500);
  return page.url().match(/\/app\/w\/([^/?#]+)/)?.[1] ?? "";
}

/** Daftar submodul dari sidebar halaman modul. */
async function submodulesOf(page, base, wsId, moduleId) {
  await gotoRetry(page, `${base}/app/w/${wsId}/${moduleId}`);
  await page.waitForTimeout(3_000);
  const subs = await page.evaluate(
    ({ ws, mod }) =>
      [...new Set(
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href"))
          .filter((h) => h && h.startsWith(`/app/w/${ws}/`))
          .map((h) => h.split(`/app/w/${ws}/`)[1].replace(/\/$/, ""))
          .filter((p) => p.startsWith(`${mod}/`) && p.split("/").length === 2),
      )],
    { ws: wsId, mod: moduleId },
  );
  return subs;
}

/** Struktur form/dialog "New" pada satu halaman (null bila tidak ada tombol/dialog). */
async function captureNewDialog(page, base, wsId, route) {
  await gotoRetry(page, `${base}/app/w/${wsId}/${route}`);
  await page.waitForTimeout(2_500);

  const newBtn = page
    .getByRole("button", { name: /^(new|create new|tambah|baru|add|add .+|new .+|tambah .+)$/i })
    .first();
  if (!(await newBtn.count()) || !(await newBtn.isVisible().catch(() => false)) || !(await newBtn.isEnabled().catch(() => false))) {
    return { hasNewButton: false };
  }
  await newBtn.click();
  const dialog = page.getByRole("dialog").first();
  const appeared = await dialog.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  if (!appeared) return { hasNewButton: true, hasDialog: false };

  await page.waitForTimeout(1_200);
  const detail = await dialog.evaluate((root) => {
    const txt = (el) => (el?.textContent ?? "").trim().replace(/\s+/g, " ");
    const labels = [...root.querySelectorAll("label")].map(txt).filter(Boolean);
    const fields = [...root.querySelectorAll("input,textarea,select,[role=combobox]")].map((el) => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") || (tag === "select" ? "select" : tag);
      const placeholder = el.getAttribute("placeholder") || "";
      const label =
        el.getAttribute("aria-label") ||
        (el.id ? txt(root.querySelector(`label[for="${el.id}"]`)) : "") ||
        "";
      return {
        type,
        placeholder: placeholder.slice(0, 40),
        label: label.slice(0, 40),
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        readonly: el.hasAttribute("readonly") || el.getAttribute("aria-readonly") === "true",
        disabled: el.hasAttribute("disabled"),
      };
    });
    const buttons = [...root.querySelectorAll("button")].map(txt).filter((t) => t && t.length < 40);
    const headings = [...root.querySelectorAll("h2,h3,[role=heading]")].map(txt).filter(Boolean).slice(0, 3);
    const help = [...root.querySelectorAll("p")].map(txt).filter((t) => t.length > 15).slice(0, 6);
    return { headings, labels, fields, buttons: [...new Set(buttons)], help };
  });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
  return { hasNewButton: true, hasDialog: true, ...detail };
}

/** Nomor dokumen otomatis (PO/202610/0003) dinormalisasi — bedanya cuma data. */
const normNum = (t) => String(t ?? "").replace(/\d{2,}/g, "#");

function diffFields(live, old) {
  const key = (f) =>
    `${normNum(f.label || f.placeholder || f.type)}|${f.type}|${f.required ? "req" : ""}`;
  const L = (live ?? []).map(key);
  const O = (old ?? []).map(key);
  const onlyLive = L.filter((x) => !O.includes(x));
  const onlyOld = O.filter((x) => !L.includes(x));
  return { onlyLive, onlyOld };
}

async function main() {
  if (!moduleArg && !routesArg.length) throw new Error("--module <id> atau --routes a,b,c wajib");
  if (!EMAIL || !PASSWORD) throw new Error("AUDIT_EMAIL/AUDIT_PASSWORD wajib diisi");

  const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const livePage = await browser.newPage();
  const oldPage = await browser.newPage();

  const liveWs = await login(livePage, LIVE_BASE, LIVE_WS_NAME);
  const oldWs = await login(oldPage, OLD_BASE, OLD_WS_NAME);
  log(`workspace live=${liveWs} old=${oldWs}`);

  // Submodul: daftar eksplisit → sidebar modul → hasil discovery (fallback),
  // supaya modul yang menunya tidak terbuka (mis. add-on) tetap bisa diuji.
  let subs = routesArg;
  if (!subs.length) subs = await submodulesOf(livePage, LIVE_BASE, liveWs, moduleArg);
  if (!subs.length && moduleArg) {
    try {
      const parsed = JSON.parse(await readFile(path.join(OUT_DIR, "parity-routes.json"), "utf8"));
      const all = Array.isArray(parsed) ? parsed : (parsed.routes ?? []);
      subs = all
        .map((p) => (typeof p === "string" ? p : (p.path ?? "")))
        .filter((p) => p.startsWith(`${moduleArg}/`));
      log(`sidebar kosong → fallback ${subs.length} rute dari parity-routes.json`);
    } catch {
      /* biarkan kosong */
    }
  }
  log(`submodul ${moduleArg || "(custom)"}: ${subs.length} → ${subs.join(", ")}`);

  const result = { module: moduleArg, generatedAt: new Date().toISOString(), pages: {} };
  for (const route of subs) {
    log(`\n=== ${route}`);
    const live = await captureNewDialog(livePage, LIVE_BASE, liveWs, route);
    const old = await captureNewDialog(oldPage, OLD_BASE, oldWs, route);
    result.pages[route] = { live, old };

    if (!live.hasDialog && !old.hasDialog) {
      log(`  (tidak ada dialog New di kedua sisi)`);
      continue;
    }
    log(`  live: ${live.hasDialog ? `${live.labels?.length ?? 0} label, ${live.fields?.length ?? 0} field` : "tanpa dialog"}`);
    log(`  old : ${old.hasDialog ? `${old.labels?.length ?? 0} label, ${old.fields?.length ?? 0} field` : "tanpa dialog"}`);
    if (live.hasDialog && old.hasDialog) {
      const d = diffFields(live.fields, old.fields);
      if (d.onlyLive.length) log(`  ⚠️ field hanya live: ${d.onlyLive.slice(0, 8).join(" · ")}`);
      if (d.onlyOld.length) log(`  ⚠️ field hanya Old: ${d.onlyOld.slice(0, 8).join(" · ")}`);
      const onlyLiveBtns = (live.buttons ?? []).filter((b) => !(old.buttons ?? []).includes(b));
      const onlyOldBtns = (old.buttons ?? []).filter((b) => !(live.buttons ?? []).includes(b));
      if (onlyLiveBtns.length) log(`  tombol dialog hanya live: ${onlyLiveBtns.join(", ")}`);
      if (onlyOldBtns.length) log(`  tombol dialog hanya Old: ${onlyOldBtns.join(", ")}`);
      if (!d.onlyLive.length && !d.onlyOld.length && !onlyLiveBtns.length && !onlyOldBtns.length) log("  ✅ struktur form sama");
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `dialog-parity-${moduleArg || "custom"}.json`);
  await writeFile(outFile, JSON.stringify(result, null, 2));
  log(`\nhasil → ${path.relative(ROOT, outFile)}`);
  await browser.close();
}

await main();
