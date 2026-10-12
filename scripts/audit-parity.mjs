#!/usr/bin/env node
/**
 * Audit parity **UI + behaviour** antara aplikasi live (xperd-one.lovable.app)
 * dan Old Production lokal — per modul, per halaman.
 *
 * Tujuan: pengembangan modul selalu dibandingkan dengan perilaku nyata aplikasi
 * live (bukan hasil membayangkan kode Lovable). Alurnya:
 *
 *   1. `discover` — masuk ke live, enumerasi SEMUA halaman dari navigasi nyata:
 *      launcher → modul (Dashboard) → submodul, lalu simpan sebagai daftar path
 *      relatif (`audit/parity-routes.json`).
 *   2. `capture --side live|old` — kunjungi tiap path di sisi tersebut dan ambil
 *      "sidik jari" perilaku (judul, tombol, header tabel, kontrol, alert,
 *      status kosong/terkunci/error) + tangkapan layar.
 *   3. `report` — bandingkan dua hasil capture → `audit/parity-report.md` berisi
 *      status per halaman (sama / beda / belum ada) + rincian bedanya.
 *
 * Pemakaian:
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs discover
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs capture --side live
 *   AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs capture --side old
 *   node scripts/audit-parity.mjs report
 *
 * Environment:
 *   LIVE_BASE   (default https://xperd-one.lovable.app)
 *   OLD_BASE    (default http://127.0.0.1:3999)
 *   AUDIT_WORKSPACE_NAME — nama workspace yang punya akses penuh (default DNICORP)
 *   AUDIT_ONLY  — hanya path yang mengandung string ini
 *   AUDIT_HEADFUL=1 — tampilkan browser
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIT_DIR = path.join(ROOT, "audit");

const LIVE_BASE = (process.env.LIVE_BASE ?? "https://xperd-one.lovable.app").replace(/\/$/, "");
const OLD_BASE = (process.env.OLD_BASE ?? "http://127.0.0.1:3999").replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL ?? "";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "";
const WS_NAME = process.env.AUDIT_WORKSPACE_NAME ?? "DNICORP";
const ONLY = process.env.AUDIT_ONLY ?? "";
const HEADLESS = process.env.AUDIT_HEADFUL !== "1";

const ROUTES_FILE = path.join(AUDIT_DIR, "parity-routes.json");
const captureFile = (side) => path.join(AUDIT_DIR, `parity-${side}.json`);
const shotsDir = (side) => path.join(AUDIT_DIR, `parity-${side}-shots`);
const REPORT_FILE = path.join(AUDIT_DIR, "parity-report.md");

const log = (...a) => console.log("[parity]", ...a);
const slug = (p) => (p === "" ? "_launcher" : p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""));

async function gotoRetry(page, url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return true;
    } catch (e) {
      log(`  goto gagal (${i + 1}/${tries}) ${url}: ${String(e).split("\n")[0].slice(0, 80)}`);
      await page.waitForTimeout(3_000);
    }
  }
  return false;
}

async function login(page, base) {
  await gotoRetry(page, `${base}/auth`);
  await page.locator("#email").waitFor({ timeout: 60_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/ }).last().click();
  await page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
}

/** Pilih workspace berdasarkan nama; fallback ke kartu pertama. */
async function pickWorkspace(page, base) {
  await gotoRetry(page, `${base}/app`);
  const cards = page.locator('[role="button"]');
  await cards.first().waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1_500);
  const n = await cards.count();
  let index = 0;
  for (let i = 0; i < n; i++) {
    const t = (await cards.nth(i).innerText()).toUpperCase();
    if (t.includes(WS_NAME.toUpperCase())) {
      index = i;
      break;
    }
  }
  await cards.nth(index).click();
  await page.waitForURL(/\/app\/w\//, { timeout: 45_000 });
  await page.waitForTimeout(3_000);
  return page.url().match(/\/app\/w\/([^/?#]+)/)?.[1] ?? "";
}

/** Sidik jari perilaku satu halaman + struktur submodul yang tampak. */
async function fingerprint(page) {
  return page.evaluate(() => {
    const text = (el) => (el?.textContent ?? "").trim().replace(/\s+/g, " ");
    const headings = [...document.querySelectorAll("h1,h2")].map(text).filter(Boolean).slice(0, 5);
    const buttons = [...document.querySelectorAll("button,[role=button]")]
      .map((el) => (el.getAttribute("aria-label") || text(el)).trim())
      .filter((t) => t && t.length < 60);
    const tableHeaders = [...document.querySelectorAll("table thead th")].map(text).filter(Boolean);
    const tabs = [...document.querySelectorAll('[role="tab"]')].map(text).filter(Boolean);
    const navLinks = [...document.querySelectorAll('a[href*="/app/w/"]')]
      .map((a) => `${a.getAttribute("href").split("/app/w/")[1]?.split("/").slice(1).join("/")} :: ${text(a)}`)
      .filter((v) => v.includes("::"));
    const controls = {
      combobox: document.querySelectorAll('[role="combobox"],select').length,
      inputs: document.querySelectorAll('input:not([type=hidden]),textarea').length,
      checkbox: document.querySelectorAll('[role="checkbox"],input[type=checkbox]').length,
      tabs: document.querySelectorAll('[role="tab"]').length,
    };
    const alerts = [...document.querySelectorAll('[role="alert"],[data-sonner-toast]')].map(text).filter(Boolean);
    const body = document.body.innerText;
    const main = document.querySelector("main")?.innerText ?? body;
    return {
      headings,
      buttons: [...new Set(buttons)],
      tableHeaders,
      tabs,
      navLinks: [...new Set(navLinks)],
      controls,
      alerts,
      empty: /No .*found|Belum ada|No data|Tidak ada|No records/i.test(body),
      locked: /restricted|does not have access|not active|paid add-on|Module access/i.test(body),
      notFound: /not found|tidak ditemukan|Application error|Something went wrong/i.test(body),
      text: main.replace(/\s+/g, " ").slice(0, 400),
    };
  });
}

async function discover(page) {
  await login(page, LIVE_BASE);
  const wsId = await pickWorkspace(page, LIVE_BASE);
  if (!wsId) throw new Error("workspace live tidak ditemukan");
  log(`workspace live: ${wsId}`);

  const routes = new Set([""]);
  await gotoRetry(page, `${LIVE_BASE}/app/w/${wsId}`);
  await page.waitForTimeout(3_000);
  const moduleHrefs = await page.evaluate((ws) =>
    [...new Set(
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && h.startsWith(`/app/w/${ws}/`))
        .map((h) => h.split(`/app/w/${ws}/`)[1].replace(/\/$/, ""))
        .filter((p) => p && !p.includes("?")),
    )],
  wsId);
  log(`modul ditemukan: ${moduleHrefs.length}`);

  for (const mod of moduleHrefs) {
    routes.add(mod);
    await gotoRetry(page, `${LIVE_BASE}/app/w/${wsId}/${mod}`);
    await page.waitForTimeout(2_500);
    const subs = await page.evaluate((ws) =>
      [...new Set(
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href"))
          .filter((h) => h && h.startsWith(`/app/w/${ws}/`))
          .map((h) => h.split(`/app/w/${ws}/`)[1].replace(/\/$/, ""))
          .filter((p) => p.split("/").length === 2),
      )],
    wsId);
    for (const s of subs) routes.add(s);
    log(`  ${mod}: ${subs.length} submodul`);
  }

  const list = [...routes].sort();
  await writeFile(ROUTES_FILE, JSON.stringify({ liveWorkspaceId: wsId, routes: list }, null, 2));
  log(`${list.length} halaman disimpan ke ${path.relative(ROOT, ROUTES_FILE)}`);
}

async function capture(page, side, base) {
  const saved = JSON.parse(await readFile(ROUTES_FILE, "utf8"));
  let routes = saved.routes;
  if (ONLY) routes = routes.filter((r) => r.includes(ONLY));
  await login(page, base);
  const wsId = await pickWorkspace(page, base);
  if (!wsId) throw new Error(`workspace ${side} tidak ditemukan`);
  log(`workspace ${side}: ${wsId} — ${routes.length} halaman`);
  await mkdir(shotsDir(side), { recursive: true });

  const out = {};
  for (const route of routes) {
    const url = `${base}/app/w/${wsId}${route ? `/${route}` : ""}`;
    const ok = await gotoRetry(page, url);
    await page.waitForTimeout(2_500);
    if (!ok) {
      out[route] = { error: "navigation failed" };
      log(`  ✗ ${route} (navigasi gagal)`);
      continue;
    }
    // Tunggu konten utama benar-benar tergambar (SSR/route lazy-load bisa lambat),
    // lalu beri jeda kecil supaya tabel/kartu selesai dirender.
    await page
      .locator("main h1, main h2, main table, main [data-testid], main button")
      .first()
      .waitFor({ timeout: 25_000 })
      .catch(() => {});
    await page.waitForTimeout(1_500);
    const fp = await fingerprint(page);
    fp.blank = (fp.text ?? "").trim().length < 40;
    out[route] = fp;
    await page.screenshot({ path: path.join(shotsDir(side), `${slug(route)}.png`), fullPage: false }).catch(() => {});
    log(`  · ${route || "(launcher)"} → ${fp.headings[0] ?? "(tanpa judul)"}${fp.locked ? " [TERKUNCI]" : ""}`);
  }
  await writeFile(captureFile(side), JSON.stringify({ base, workspaceId: wsId, pages: out }, null, 2));
  log(`hasil ${side} → ${path.relative(ROOT, captureFile(side))}`);
}

/** Chrome yang selalu ada di aplikasi (bukan bagian halaman) — diabaikan saat membandingkan. */
const CHROME = [
  /^Dismiss$/i,
  /^Edit with$/i,
  /^Edit$/i,
  /^Search modules/i,
  /^Guide and XPERD Assistant$/i,
  /^Notifications?$/i,
  /^Language$/i,
  /^Toggle theme$/i,
  /^Account$/i,
  /^Open module menu$/i,
  /workspace/i,
  /Digital Niaga International/i,
  /XPERD Demo/i,
  /^\d+$/,
];

const cleanList = (list = []) => [...new Set(list.filter((b) => !CHROME.some((re) => re.test(b))))];

const diffLists = (a = [], b = []) => {
  const A = cleanList(a);
  const B = cleanList(b);
  return { onlyA: A.filter((x) => !B.includes(x)), onlyB: B.filter((x) => !A.includes(x)) };
};

const moduleOf = (route) => (route ? route.split("/")[0] : "(launcher)");

async function report() {
  const liveAll = JSON.parse(await readFile(captureFile("live"), "utf8")).pages;
  const oldAll = JSON.parse(await readFile(captureFile("old"), "utf8")).pages;
  const routes = [...new Set([...Object.keys(liveAll), ...Object.keys(oldAll)])].sort();

  const results = [];
  for (const route of routes) {
    const l = liveAll[route];
    const o = oldAll[route];
    const label = route === "" ? "(launcher)" : route;
    if (!l) {
      results.push({ route, label, status: "extra-old", notes: ["hanya ada di Old"] });
      continue;
    }
    if (!o || o.error) {
      results.push({
        route,
        label,
        status: "missing",
        notes: [l.locked ? "live terkunci (add-on/role) — isi belum bisa dibandingkan" : "belum ada di Old"],
        live: l,
        old: null,
      });
      continue;
    }
    // Old belum punya modulnya sama sekali (mis. add-on xpro) → hitung sebagai belum ada.
    const oldMissing = o.notFound || /module not found|application error/i.test((o.headings || []).join(" "));
    if (oldMissing) {
      results.push({
        route,
        label,
        status: l.locked ? "addon" : "missing",
        notes: [l.locked ? "add-on belum aktif di live (acuan) & belum ada di Old" : "belum ada di Old"],
        live: l,
        old: null,
      });
      continue;
    }
    if (l.locked) {
      results.push({ route, label, status: "addon", notes: ["live terkunci (add-on/role); Old punya halamannya"] });
      continue;
    }

    const headingDiff = JSON.stringify(cleanList(l.headings)) !== JSON.stringify(cleanList(o.headings));
    const buttons = diffLists(l.buttons, o.buttons);
    const th = diffLists(l.tableHeaders, o.tableHeaders);
    const tabs = diffLists(l.tabs, o.tabs);
    const controls = ["combobox", "inputs", "checkbox", "tabs"].filter(
      (k) => (l.controls?.[k] ?? 0) !== (o.controls?.[k] ?? 0),
    );
    const flags = ["empty", "locked", "notFound"].filter((k) => Boolean(l[k]) !== Boolean(o[k]));
    const clean = !headingDiff && !buttons.onlyA.length && !buttons.onlyB.length && !th.onlyA.length && !th.onlyB.length && !tabs.onlyA.length && !tabs.onlyB.length && !controls.length && !flags.length;

    if (clean) {
      results.push({ route, label, status: "same", notes: [] });
      continue;
    }
    const notes = [];
    if (headingDiff) notes.push(`judul: live ${JSON.stringify(cleanList(l.headings))} vs Old ${JSON.stringify(cleanList(o.headings))}`);
    if (buttons.onlyA.length) notes.push(`tombol hanya live: ${buttons.onlyA.slice(0, 6).join(", ")}`);
    if (buttons.onlyB.length) notes.push(`tombol hanya Old: ${buttons.onlyB.slice(0, 6).join(", ")}`);
    if (th.onlyA.length) notes.push(`kolom hanya live: ${th.onlyA.slice(0, 6).join(", ")}`);
    if (th.onlyB.length) notes.push(`kolom hanya Old: ${th.onlyB.slice(0, 6).join(", ")}`);
    if (tabs.onlyA.length) notes.push(`tab hanya live: ${tabs.onlyA.join(", ")}`);
    if (tabs.onlyB.length) notes.push(`tab hanya Old: ${tabs.onlyB.join(", ")}`);
    if (controls.length) notes.push(`jumlah kontrol beda (${controls.join(", ")}): live ${JSON.stringify(l.controls)} vs Old ${JSON.stringify(o.controls)}`);
    if (flags.length) notes.push(`status beda (${flags.join(", ")})`);
    results.push({ route, label, status: "diff", notes, live: l, old: o });
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  const byModule = new Map();
  for (const r of results) {
    const m = moduleOf(r.route);
    const cur = byModule.get(m) ?? { same: 0, diff: 0, missing: 0, addon: 0, "extra-old": 0 };
    cur[r.status]++;
    byModule.set(m, cur);
  }

  const badge = {
    same: "✅ sama",
    diff: "⚠️ beda",
    missing: "❌ belum ada di Old",
    addon: "🎫 add-on (live terkunci)",
    "extra-old": "➕ hanya di Old",
  };

  const md = [
    "# Laporan parity **live** ↔ **Old Production** (per halaman)",
    "",
    `Dihasilkan \`scripts/audit-parity.mjs\` — ${new Date().toISOString().slice(0, 19)}.`,
    "",
    `- Live: ${LIVE_BASE} (workspace **${WS_NAME}**)`,
    `- Old: ${OLD_BASE}`,
    `- Halaman: **${results.length}** — ✅ ${count("same")} sama · ⚠️ ${count("diff")} beda · ❌ ${count("missing")} belum ada · 🎫 ${count("addon")} add-on terkunci di live · ➕ ${count("extra-old")} hanya di Old`,
    "",
    "Perbandingan memakai *sidik jari perilaku*: judul (h1/h2), tombol, tab, kolom tabel,",
    "jumlah kontrol, dan status kosong/terkunci/error. Chrome aplikasi (pencarian modul,",
    "notifikasi, bahasa, tombol Lovable “Dismiss/Edit with”, nama workspace) diabaikan.",
    "",
    "## Ringkasan per modul",
    "",
    "| Modul | ✅ sama | ⚠️ beda | ❌ belum ada | 🎫 add-on | ➕ hanya Old |",
    "|---|---|---|---|---|---|",
    ...[...byModule.entries()].sort().map(([m, c]) => `| ${m} | ${c.same} | ${c.diff} | ${c.missing} | ${c.addon} | ${c["extra-old"]} |`),
    "",
    "## Daftar halaman",
    "",
    "| Halaman | Judul (live) | Status | Catatan |",
    "|---|---|---|---|",
    ...results.map((r) => {
      const title = r.live?.headings?.[0] ?? (r.status === "missing" || r.status === "addon" ? "—" : "—");
      return `| \`${r.label}\` | ${String(title).slice(0, 42)} | ${badge[r.status]} | ${r.notes.join("; ").slice(0, 160)} |`;
    }),
    "",
    "## Rincian halaman yang belum ada / berbeda",
    "",
    ...(results.filter((r) => r.status === "missing" || r.status === "diff").length
      ? results
          .filter((r) => r.status === "missing" || r.status === "diff")
          .map((r) => {
            const parts = [`### \`${r.label}\``, "", ...r.notes.map((n) => `- ${n}`)];
            if (r.live) parts.push(`- screenshot live: \`audit/parity-live-shots/${slug(r.route)}.png\``);
            if (r.old) parts.push(`- screenshot Old: \`audit/parity-old-shots/${slug(r.route)}.png\``);
            return parts.join("\n");
          })
      : ["(tidak ada)"]),
    "",
    "## Cara memakai",
    "",
    "1. Kerjakan **❌ belum ada di Old** (modul/halaman yang hilang) lebih dulu.",
    "2. Lanjut **⚠️ beda** per modul: buka dua screenshot di atas, samakan UI/alurnya.",
    "3. **🎫 add-on** baru bisa dibandingkan isinya setelah add-on diaktifkan di workspace live",
    "   (minta pemilik produk mengaktifkan), atau bandingkan dengan kode ekspor BS New 10.",
    "4. Jalankan ulang `capture` + `report` setelah tiap perbaikan sebagai bukti.",
    "",
  ].join("\n");

  await writeFile(REPORT_FILE, md);
  log(`laporan → ${path.relative(ROOT, REPORT_FILE)}`);
  console.log(
    `\n✅ ${count("same")} sama · ⚠️ ${count("diff")} beda · ❌ ${count("missing")} belum ada · 🎫 ${count("addon")} add-on · ➕ ${count("extra-old")} hanya Old (dari ${results.length} halaman)`,
  );
}

// ------------------------------------------------------------------ CLI ------
const argv = process.argv.slice(2);
const cmd = argv[0] ?? "help";
const sideIdx = argv.indexOf("--side");
const side = sideIdx >= 0 ? argv[sideIdx + 1] : "";

const browser = cmd === "report" ? null : await chromium.launch({ channel: "chrome", headless: HEADLESS, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = browser ? await browser.newPage() : null;

try {
  if (cmd !== "report" && (!EMAIL || !PASSWORD)) {
    throw new Error("AUDIT_EMAIL/AUDIT_PASSWORD wajib diisi untuk discover/capture");
  }
  if (cmd === "discover") {
    await mkdir(AUDIT_DIR, { recursive: true });
    await discover(page);
  } else if (cmd === "capture") {
    if (side !== "live" && side !== "old") throw new Error("--side live|old wajib");
    await mkdir(AUDIT_DIR, { recursive: true });
    await capture(page, side, side === "live" ? LIVE_BASE : OLD_BASE);
  } else if (cmd === "report") {
    await mkdir(AUDIT_DIR, { recursive: true });
    await report();
  } else {
    console.log("Pakai: discover | capture --side live|old | report");
  }
} finally {
  await browser?.close();
}
