#!/usr/bin/env node
/**
 * Audit perilaku per modul (untuk memastikan paritas dengan Lovable).
 *
 * Skrip ini masuk (login), lalu mengunjungi **setiap** submodul berdasarkan
 * `src/lib/modules.ts` pada aplikasi yang diuji, dan mencatat "sidik jari
 * perilaku" tiap halaman: judul, tombol yang tersedia, header tabel, jumlah
 * kontrol form, dan pesan error yang muncul. Hasilnya JSON sehingga dua
 * aplikasi (mis. `xperd-one.lovable.app` vs Old Production lokal) bisa
 * dibandingkan otomatis.
 *
 * Pemakaian:
 *   AUDIT_BASE_URL=https://xperd-one.lovable.app \
 *   AUDIT_EMAIL=... AUDIT_PASSWORD=... \
 *   node scripts/audit-modules.mjs
 *
 *   node scripts/audit-modules.mjs --compare audit/<host-a>.json audit/<host-b>.json
 *
 * Catatan kredensial: isi `AUDIT_EMAIL`/`AUDIT_PASSWORD` lewat environment
 * (mis. `--env-file` atau `export`), **jangan** ditulis di dalam repo.
 * Tanpa kredensial, skrip hanya mengaudit halaman publik.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BASE = (process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3999").replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL ?? "";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "";
const ONLY = process.env.AUDIT_ONLY ?? "";
/**
 * Route tambahan (di luar `src/lib/modules.ts`) untuk diaudit, mis. submodul
 * yang baru ada di aplikasi tujuan:
 *   AUDIT_EXTRA_ROUTES=master-data/currencies,accounting/fx-revaluation,xpro/projects
 */
const EXTRA_ROUTES = (process.env.AUDIT_EXTRA_ROUTES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const HEADLESS = process.env.AUDIT_HEADFUL !== "1";

const host = new URL(BASE).host;
const stamp = new Date().toISOString().slice(0, 10);
const outFile = process.env.AUDIT_OUT ?? path.join(ROOT, "audit", `${host}-${stamp}.json`);

/** Baca daftar modul/submodul dari `src/lib/modules.ts` repo ini. */
async function readModules() {
  const src = await readFile(path.join(ROOT, "src/lib/modules.ts"), "utf8");
  const modules = [];
  let current = null;
  for (const line of src.split("\n")) {
    const mod = line.match(/^\s{4}id: "([a-z0-9-]+)"/);
    if (mod) {
      current = { id: mod[1], submodules: [] };
      modules.push(current);
      continue;
    }
    const sub = line.match(/^\s{6}s\("([a-z0-9-]+)"/);
    if (sub && current) current.submodules.push(sub[1]);
  }
  return modules;
}

/** Sidik jari perilaku satu halaman. */
async function fingerprint(page) {
  return page.evaluate(() => {
    const text = (el) => (el?.textContent ?? "").trim().replace(/\s+/g, " ");
    const headings = [...document.querySelectorAll("h1,h2")].map(text).filter(Boolean).slice(0, 4);
    const buttons = [...document.querySelectorAll("button,[role=button]")]
      .map((el) => (el.getAttribute("aria-label") || text(el)).trim())
      .filter((t) => t && t.length < 60);
    const tableHeaders = [...document.querySelectorAll("table thead th")].map(text).filter(Boolean);
    const controls = {
      combobox: document.querySelectorAll('[role="combobox"]').length,
      textbox: document.querySelectorAll('input:not([type=hidden]),textarea').length,
      checkbox: document.querySelectorAll('[role="checkbox"],input[type=checkbox]').length,
      tabs: document.querySelectorAll('[role="tab"]').length,
    };
    const alert = [...document.querySelectorAll('[role="alert"],[data-sonner-toast]')].map(text).filter(Boolean);
    const bodyText = document.body.innerText;
    return {
      headings,
      buttons: [...new Set(buttons)],
      tableHeaders,
      controls,
      alert,
      empty:
        /No .*found|Belum ada|No data|Tidak ada/i.test(bodyText) ||
        /Loading…|Memuat/i.test(bodyText),
      notFound: /not found|tidak ditemukan|Application error/i.test(bodyText),
    };
  });
}

async function login(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.locator("#password").press("Enter");
  await page.waitForURL(/\/app/, { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function resolveWorkspace(page) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[role="button"]').first();
  await card.waitFor({ timeout: 45_000 });
  await card.click();
  await page.waitForURL(/\/app\/w\/[^/?#]+$/, { timeout: 30_000 });
  return page.url().match(/\/app\/w\/([^/?#]+)/)?.[1] ?? null;
}

async function auditPublic(page, result) {
  for (const route of ["/", "/products", "/pricing", "/register", "/auth", "/qalling"]) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(900);
      result.pages.push({ path: route, ...(await fingerprint(page)) });
    } catch (err) {
      result.pages.push({ path: route, error: String(err).slice(0, 160) });
    }
  }
}

async function auditWorkspace(page, result) {
  const modules = await readModules();
  const ws = await resolveWorkspace(page);
  result.workspaceId = ws;
  if (!ws) throw new Error("Workspace id tidak terdeteksi setelah membuka /app");

  const shotsDir = path.join(path.dirname(outFile), `${host}-shots`);
  await mkdir(shotsDir, { recursive: true });

  const moduleIds = new Set(modules.map((m) => m.id));
  const extras = EXTRA_ROUTES.map((r) => {
    const [module, submodule] = r.split("/");
    return { module, submodule, path: `/app/w/${ws}/${r}` };
  }).filter((r) => r.module && (r.submodule || !moduleIds.has(r.module)));

  for (const mod of modules) {
    if (ONLY && !mod.id.includes(ONLY)) continue;
    const routes = [
      { submodule: null, path: `/app/w/${ws}/${mod.id}` },
      ...mod.submodules.map((s) => ({ submodule: s, path: `/app/w/${ws}/${mod.id}/${s}` })),
    ];
    for (const route of routes) {
      const label = `${mod.id}${route.submodule ? `/${route.submodule}` : ""}`;
      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(1400);
        const fp = await fingerprint(page);
        result.pages.push({ path: route.path, module: mod.id, submodule: route.submodule, ...fp });
        await page.screenshot({ path: path.join(shotsDir, `${label.replace(/\//g, "_")}.png`) }).catch(() => {});
      } catch (err) {
        result.pages.push({ path: route.path, module: mod.id, submodule: route.submodule, error: String(err).slice(0, 160) });
      }
    }
  }

  for (const route of extras) {
    const label = `${route.module}${route.submodule ? `/${route.submodule}` : ""}`;
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(1400);
      const fp = await fingerprint(page);
      result.pages.push({ path: route.path, module: route.module, submodule: route.submodule, extra: true, ...fp });
      await page.screenshot({ path: path.join(shotsDir, `extra_${label.replace(/\//g, "_")}.png`) }).catch(() => {});
    } catch (err) {
      result.pages.push({ path: route.path, module: route.module, submodule: route.submodule, extra: true, error: String(err).slice(0, 160) });
    }
  }
}

async function compare(files) {
  const [a, b] = await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, "utf8"))));
  // Workspace id tiap aplikasi berbeda → samakan dulu agar path bisa dibandingkan.
  const norm = (p) => p.replace(/\/app\/w\/[^/?#]+/, "/app/w/__WS__");
  const byPath = (doc) => new Map(doc.pages.map((p) => [norm(p.path), p]));
  const ma = byPath(a);
  const mb = byPath(b);
  const paths = [...new Set([...ma.keys(), ...mb.keys()])].sort();
  let diffs = 0;
  console.log(`# Bandingkan ${a.host} (A) vs ${b.host} (B)\n`);
  for (const p of paths) {
    const x = ma.get(p);
    const y = mb.get(p);
    if (!x || !y) {
      diffs += 1;
      console.log(`- ${p}: hanya ada di ${!x ? "B" : "A"}`);
      continue;
    }
    const lines = [];
    const setDiff = (name, arrA = [], arrB = []) => {
      const onlyA = arrA.filter((v) => !arrB.includes(v));
      const onlyB = arrB.filter((v) => !arrA.includes(v));
      if (onlyA.length || onlyB.length) lines.push(`${name}: A-only=[${onlyA.join(" | ")}] B-only=[${onlyB.join(" | ")}]`);
    };
    setDiff("judul", x.headings, y.headings);
    setDiff("tombol", x.buttons, y.buttons);
    setDiff("header tabel", x.tableHeaders, y.tableHeaders);
    if (JSON.stringify(x.controls) !== JSON.stringify(y.controls)) {
      lines.push(`kontrol: A=${JSON.stringify(x.controls)} B=${JSON.stringify(y.controls)}`);
    }
    if (Boolean(x.notFound) !== Boolean(y.notFound)) lines.push(`error page: A=${x.notFound} B=${y.notFound}`);
    if (lines.length) {
      diffs += 1;
      console.log(`- ${p}`);
      for (const l of lines) console.log(`    ${l}`);
    }
  }
  console.log(`\n${diffs} halaman berbeda dari ${paths.length} halaman.`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--compare") {
    await compare(argv.slice(1));
    return;
  }

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));

  const result = { host, base: BASE, capturedAt: new Date().toISOString(), authenticated: false, pages: [] };
  try {
    if (EMAIL && PASSWORD) {
      await login(page);
      result.authenticated = true;
      await auditWorkspace(page, result);
    } else {
      console.log("[audit] AUDIT_EMAIL/AUDIT_PASSWORD tidak diisi → hanya halaman publik.");
    }
    await auditPublic(page, result);
  } finally {
    await browser.close();
  }

  result.consoleErrors = [...new Set(errors)].slice(0, 50);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[audit] ${result.pages.length} halaman → ${path.relative(ROOT, outFile)}`);
  if (!result.authenticated) {
    console.log("[audit] Untuk audit area workspace, isi AUDIT_EMAIL & AUDIT_PASSWORD.");
  }
}

await main();
