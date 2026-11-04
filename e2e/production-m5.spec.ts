import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import http from "node:http";
import type mysql from "mysql2/promise";
import type { Locator, Page } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";
import { createTestWorkspace, dropTestWorkspace, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M5 (mutu): spesifikasi QC (batas min/maks), inspeksi per lot, hasil dievaluasi SERVER (lulus/gagal, deviasi otomatis bernomor),
 * rilis/tolak lot hanya oleh QA manager dengan e-sign (kode email 6 digit: hash, 5 menit, 5 percobaan, sekali pakai, terikat aksi+entitas+pelaku, 1/menit),
 * deviasi/CAPA (tutup butuh akar masalah + CAPA + e-sign), audit. Email diterima server Brevo tiruan di :4599 (isi email nyata → kode),
 * gateway platform disimpan lalu dipulihkan. Angka dicocokkan dengan SQL; workspace uji dihapus setelah selesai.
 */
const TAG = `m5${Date.now().toString().slice(-6)}`;
const PW = "Passw0rd!234";
const QA = { email: `e2e-m5-qa-${TAG}@example.com`, password: PW };
const QC = { email: `e2e-m5-qc-${TAG}@example.com`, password: PW };
const PLAIN = { email: `e2e-m5-plain-${TAG}@example.com`, password: PW };
const field = (scope: Page | Locator, label: string): Locator =>
  scope.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input,select").first();
const uid = () => crypto.randomUUID();

type Mail = { body: Record<string, any> };
const mails: Mail[] = [];
let mailServer: http.Server;
let c: mysql.Connection;
let ws = "";
let revoke: (() => Promise<void>) | null = null;
let gwSnap: Record<string, unknown> | null = null;

const call = (page: Page, mod: string, fn: string, data: unknown) =>
  page.evaluate(
    async ({ mod, fn, data }) => {
      const m = await import(/* @vite-ignore */ `/src/lib/${mod}.ts`);
      try {
        return { ok: true, v: await (m as any)[fn]({ data }) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    { mod, fn, data },
  ) as Promise<{ ok: boolean; v?: any; error?: string }>;
const lastCode = (to: string) => {
  const m = [...mails].reverse().find((x) => x.body.to?.[0]?.email === to);
  return m ? /\b(\d{6})\b/.exec(String(m.body.textContent))![1] : null;
};

test.beforeAll(async () => {
  c = await mfgConn();
  const [snap] = await sql(c, "SELECT * FROM email_gateway_settings WHERE scope_key = 'platform'");
  gwSnap = snap ?? null;
  await new Promise<void>((resolve) => {
    mailServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (x) => (raw += x));
      req.on("end", () => {
        try {
          mails.push({ body: JSON.parse(raw || "{}") });
        } catch {
          /* abaikan */
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"messageId":"e2e"}');
      });
    });
    mailServer.listen(4599, "0.0.0.0", resolve);
  });
});

test.afterAll(async () => {
  mailServer?.close();
  if (!c) return;
  if (revoke) await revoke();
  await c.execute("DELETE FROM email_gateway_settings WHERE scope_key = 'platform'");
  if (gwSnap) {
    const g = gwSnap as any;
    await c.execute(
      "INSERT INTO email_gateway_settings (id, scope_key, workspace_id, enabled, provider, from_name, from_email, reply_to, smtp_host, smtp_port, smtp_user, smtp_secure, secret, events) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [g.id, g.scope_key, g.workspace_id, g.enabled, g.provider, g.from_name, g.from_email, g.reply_to, g.smtp_host, g.smtp_port, g.smtp_user, g.smtp_secure, g.secret, typeof g.events === "string" ? g.events : JSON.stringify(g.events)],
    );
  }
  const users = [QA.email, QC.email, PLAIN.email];
  await c.execute(`DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM app_users WHERE email IN (${users.map(() => "?").join(",")}))`, users);
  await c.execute(`DELETE FROM profiles WHERE email IN (${users.map(() => "?").join(",")})`, users);
  await c.execute(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email IN (${users.map(() => "?").join(",")}))`, users);
  await c.execute(`DELETE FROM app_users WHERE email IN (${users.map(() => "?").join(",")})`, users);
  if (ws) await dropTestWorkspace(c, ws);
  await c.end();
});

test("PRODUCTION M5: spesifikasi, inspeksi, hasil server, rilis lot + e-sign, deviasi/CAPA, gerbang akses", async ({ page, browser }) => {
  test.setTimeout(480_000);
  await login(page);
  const baseWs = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, baseWs, TAG);
  const item = uid(), foreignItem = uid();
  await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?,?,?)", [uid(), ws, "kg", "Kilogram"]);
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [item, ws, "FG-QC", "Produk QC"]);
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [foreignItem, baseWs, `E2E-M5-FOREIGN-${TAG}`, "Item Lain"]);
  const lotA = uid(), lotB = uid(), lotC = uid();
  for (const [id, no] of [[lotA, "QA-A"], [lotB, "QA-B"], [lotC, "QA-C"]] as const)
    await c.execute("INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, expiry_date, qc_status) VALUES (?,?,?,?, '2035-01-01', 'quarantine')", [id, ws, item, no]);

  // gateway email platform → server tiruan
  await c.execute("DELETE FROM email_gateway_settings WHERE scope_key = 'platform'");
  await c.execute(
    "INSERT INTO email_gateway_settings (id, scope_key, enabled, provider, from_name, from_email, secret, events) VALUES (UUID(), 'platform', 1, 'brevo', 'E2E', 'noreply@e2e.example', 'e2e-secret', '{}')",
  );

  /* ---------- tanpa entitlement (hanya bila tidak ada spec lain yang sedang memberi add-on pada tenant yang sama) ---------- */
  await page.goto(`/app/w/${ws}`);
  const shared = Number((await sql(c, "SELECT COUNT(*) n FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN workspaces w ON w.tenant_id = ta.tenant_id WHERE a.code = 'manufacturing' AND w.id = ?", [ws]))[0].n);
  if (shared === 0) {
    const denied = await call(page, "production-quality.functions", "getProductionQuality", { workspaceId: ws });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/Production tidak tersedia/);
    expect((await call(page, "production-esign.functions", "sendProductionSignCode", { workspaceId: ws, entityTable: "mfg_lots", entityId: lotA, action: "lot_released" })).ok).toBe(false);
    expect(await sql(c, "SELECT 1 FROM mfg_esign_challenges WHERE workspace_id = ?", [ws])).toHaveLength(0);
  }
  revoke = await grantProduction(c, ws);

  /* ---------- pengguna ---------- */
  const [adm] = await sql(c, "SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
  await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'owner')", [ws, adm.id]);
  for (const u of [QA, QC, PLAIN]) {
    const r = await call(page, "team.functions", "createWorkspaceUser", { workspaceId: ws, email: u.email, password: u.password, fullName: u.email.split("@")[0], role: "staff" });
    expect(r.ok, r.error).toBe(true);
  }
  const uidOf = async (e: string) => (await sql(c, "SELECT id FROM app_users WHERE email = ?", [e]))[0].id as string;
  await c.execute("INSERT INTO mfg_workspace_roles (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'qa_manager'), (UUID(), ?, ?, 'qc_analyst')", [ws, await uidOf(QA.email), ws, await uidOf(QC.email)]);

  /* ---------- spesifikasi lewat UI ---------- */
  await page.goto(`/app/w/${ws}/manufacturing/quality`);
  await expect(page.getByRole("heading", { name: "Quality", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Spesifikasi", exact: true }).click();
  await page.getByRole("button", { name: "Spesifikasi baru" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("select").first().selectOption(item);
  await field(dlg, "Kode").fill(`SPEC-${TAG}`);
  await field(dlg, "Nama").fill("Spesifikasi rilis akhir");
  await dlg.getByLabel("Parameter", { exact: true }).fill("Kadar AI");
  await dlg.getByLabel("Satuan").fill("%");
  await dlg.getByLabel("Min").fill("95");
  await dlg.getByLabel("Maks").fill("100");
  await dlg.getByRole("button", { name: "Parameter", exact: true }).click();
  await dlg.getByLabel("Parameter", { exact: true }).nth(1).fill("pH");
  await dlg.getByLabel("Min").nth(1).fill("5");
  await dlg.getByLabel("Maks").nth(1).fill("7");
  await field(dlg, "Alasan perubahan").fill("Spesifikasi uji UI");
  await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Spesifikasi tersimpan").first()).toBeVisible({ timeout: 30_000 });
  const [spec] = await sql(c, "SELECT * FROM mfg_qc_specs WHERE workspace_id = ? AND code = ?", [ws, `SPEC-${TAG}`]);
  expect(spec.stage).toBe("incoming");
  const params = await sql(c, "SELECT * FROM mfg_qc_spec_params WHERE spec_id = ? AND is_active = 1 ORDER BY sequence", [spec.id]);
  expect(params.map((p) => [p.param, Number(p.min_value), Number(p.max_value)])).toEqual([["Kadar AI", 95, 100], ["pH", 5, 7]]);
  // validasi spesifikasi
  const specIn = (over: Record<string, unknown> = {}, params2?: unknown[]) => ({
    workspaceId: ws, id: null, reason: "uji",
    values: { item_id: item, bom_version_id: "", stage: "final", code: `S2-${TAG}`, name: "Spec 2", is_active: true, ...over },
    params: params2 ?? [{ param: "Kadar", method: "", unit: "%", min_value: 90, max_value: 100, is_critical: true }],
  });
  const saveSpec = (d: unknown) => call(page, "production-quality.functions", "saveQcSpec", d);
  expect((await saveSpec(specIn({ code: `SPEC-${TAG}` }))).ok).toBe(false); // kode ganda
  expect((await saveSpec(specIn({ item_id: foreignItem }))).ok).toBe(false); // item lintas-workspace
  expect((await saveSpec(specIn({}, []))).ok).toBe(false); // tanpa parameter
  expect((await saveSpec(specIn({}, [{ param: "X", method: "", unit: "", min_value: null, max_value: null, is_critical: false }]))).ok).toBe(false); // tanpa batas
  expect((await saveSpec(specIn({}, [{ param: "X", method: "", unit: "", min_value: 10, max_value: 5, is_critical: false }]))).ok).toBe(false); // max<min
  expect((await saveSpec({ ...specIn(), reason: " " })).ok).toBe(false);
  const s2 = await saveSpec(specIn());
  expect(s2.ok, s2.error).toBe(true);

  /* ---------- inspeksi ---------- */
  const mkIns = (lotId: string, sample: string, key = uid(), specId = spec.id) =>
    call(page, "production-quality.functions", "createQcInspection", { workspaceId: ws, specId, lotId, orderId: null, sampleId: sample, key, reason: "pengambilan sampel" });
  const kIns = uid();
  const insA = await mkIns(lotA, "SMP-A", kIns);
  expect(insA.ok, insA.error).toBe(true);
  expect((await mkIns(lotA, "SMP-A", kIns)).v.id).toBe(insA.v.id); // idempoten
  expect(await sql(c, "SELECT 1 FROM mfg_qc_inspections WHERE workspace_id = ?", [ws])).toHaveLength(1);
  const foreignLotItem = uid();
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [foreignLotItem, ws, "OTHER-QC", "Item Lain QC"]);
  const lotX = uid();
  await c.execute("INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no) VALUES (?,?,?,?)", [lotX, ws, foreignLotItem, "QA-X"]);
  expect((await mkIns(lotX, "SMP-X")).ok).toBe(false); // spesifikasi tidak cocok item lot
  expect((await call(page, "production-quality.functions", "createQcInspection", { workspaceId: ws, specId: spec.id, lotId: null, orderId: null, sampleId: "N", key: uid(), reason: "x" })).ok).toBe(false); // tanpa lot/order
  expect(spec.id).toBeTruthy();
  // spesifikasi yang sudah dipakai tidak bisa diubah
  expect((await saveSpec({ ...specIn(), id: spec.id })).ok).toBe(false);

  /* ---------- hasil: dievaluasi server ---------- */
  const [pKadar, pPh] = params;
  const rec = (inspId: string, vals: [string, number][], reason = "hasil analisis") =>
    call(page, "production-quality.functions", "recordQcResults", { workspaceId: ws, inspectionId: inspId, reason, results: vals.map(([pid, value]) => ({ param_id: pid, value, method_note: "", instrument_id: "" })) });
  expect((await rec(insA.v.id, [[pKadar.id, 98]])).ok).toBe(false); // parameter kurang
  expect((await rec(insA.v.id, [[pKadar.id, 98], [pKadar.id, 98]])).ok).toBe(false); // ganda
  expect((await rec(insA.v.id, [[pKadar.id, 98], [pPh.id, 6]], " ")).ok).toBe(false); // alasan kosong
  expect(await sql(c, "SELECT 1 FROM mfg_qc_results WHERE inspection_id = ?", [insA.v.id])).toHaveLength(0); // semua-atau-tidak-sama-sekali
  // lot A: kadar 94 (< 95) → gagal + deviasi otomatis
  const rA = await rec(insA.v.id, [[pKadar.id, 94], [pPh.id, 6]]);
  expect(rA.ok, rA.error).toBe(true);
  expect(rA.v.status).toBe("failed");
  expect((await sql(c, "SELECT status FROM mfg_qc_inspections WHERE id = ?", [insA.v.id]))[0].status).toBe("failed");
  const results = await sql(c, "SELECT param_id, value, pass FROM mfg_qc_results WHERE inspection_id = ?", [insA.v.id]);
  expect(results.find((r) => r.param_id === pKadar.id)).toMatchObject({ pass: 0 });
  expect(results.find((r) => r.param_id === pPh.id)).toMatchObject({ pass: 1 });
  const devs = await sql(c, "SELECT * FROM mfg_deviations WHERE workspace_id = ?", [ws]);
  expect(devs).toHaveLength(1);
  expect(devs[0]).toMatchObject({ source: "qc_failure", status: "open", lot_id: lotA, inspection_id: insA.v.id });
  expect(devs[0].deviation_no).toMatch(new RegExp(`^DEV-${new Date().getFullYear()}-0001$`));
  expect((await rec(insA.v.id, [[pKadar.id, 98], [pPh.id, 6]])).ok).toBe(false); // sudah dievaluasi

  // lot B: lulus (batas inklusif)
  const insB = await mkIns(lotB, "SMP-B");
  const rB = await rec(insB.v.id, [[pKadar.id, 95], [pPh.id, 7]]);
  expect(rB.v.status).toBe("passed");
  expect((await sql(c, "SELECT inspector_id FROM mfg_qc_inspections WHERE id = ?", [insB.v.id]))[0].inspector_id).toBe(adm.id);
  expect(await sql(c, "SELECT 1 FROM mfg_deviations WHERE workspace_id = ?", [ws])).toHaveLength(1);

  // UI: input hasil lot C lewat dialog (server menilai)
  const insC = await mkIns(lotC, "SMP-C");
  await page.goto(`/app/w/${ws}/manufacturing/quality`);
  await page.getByRole("row", { name: /SMP-C/ }).getByRole("button", { name: "Input hasil" }).click();
  const ed = page.getByRole("dialog");
  await ed.getByLabel("Kadar AI").fill("101");
  await ed.getByLabel("pH").fill("6");
  await expect(ed.getByText("Di luar").first()).toBeVisible();
  await ed.getByLabel("Kadar AI").fill("99.5");
  await field(ed, "Alasan").fill("Hasil lot C");
  await ed.getByRole("button", { name: "Simpan hasil" }).click();
  await expect(page.getByText("Inspeksi lulus").first()).toBeVisible({ timeout: 30_000 });
  expect((await sql(c, "SELECT status FROM mfg_qc_inspections WHERE id = ?", [insC.v.id]))[0].status).toBe("passed");
  expect(Number((await sql(c, "SELECT value FROM mfg_qc_results WHERE inspection_id = ? AND param_id = ?", [insC.v.id, pKadar.id]))[0].value)).toBe(99.5);

  /* ---------- rilis lot: peran + e-sign ---------- */
  const decide = (p: Page, lotId: string, status: string, signature: string) => call(p, "production-quality.functions", "decideLot", { workspaceId: ws, lotId, status, signature, reason: "keputusan QA" });
  const send = (p: Page, entityTable: string, entityId: string, action: string) => call(p, "production-esign.functions", "sendProductionSignCode", { workspaceId: ws, entityTable, entityId, action });
  const verify = (p: Page, challengeId: string, code: string) => call(p, "production-esign.functions", "verifyProductionSignCode", { workspaceId: ws, challengeId, code });

  const ctxQa = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const qa = await ctxQa.newPage();
  await login(qa, QA);
  await qa.goto(`/app/w/${ws}`);
  const ctxQc = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const qc = await ctxQc.newPage();
  await login(qc, QC);
  await qc.goto(`/app/w/${ws}`);
  const ctxPlain = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const plain = await ctxPlain.newPage();
  await login(plain, PLAIN);
  await plain.goto(`/app/w/${ws}`);

  // peran: analis & staff polos & owner non-QA tidak bisa mengambil keputusan/kode tanda tangan
  expect((await send(qc, "mfg_lots", lotB, "lot_released")).ok).toBe(false);
  expect((await send(plain, "mfg_lots", lotB, "lot_released")).ok).toBe(false);
  expect((await decide(page, lotB, "released", uid())).ok).toBe(false); // admin/owner bukan QA manager
  const qd = await call(qc, "production-quality.functions", "getProductionQuality", { workspaceId: ws });
  expect(qd.v).toMatchObject({ canWrite: true, isQaManager: false });
  expect((await call(plain, "production-quality.functions", "getProductionQuality", { workspaceId: ws })).v.canWrite).toBe(false);
  expect((await call(plain, "production-quality.functions", "saveQcSpec", specIn({ code: "PL-1" }))).ok).toBe(false);
  expect((await call(plain, "production-quality.functions", "createQcInspection", { workspaceId: ws, specId: spec.id, lotId: lotB, orderId: null, sampleId: "P", key: uid(), reason: "x" })).ok).toBe(false);
  const qad = await call(qa, "production-quality.functions", "getProductionQuality", { workspaceId: ws });
  expect(qad.v.isQaManager).toBe(true);

  // tanpa tanda tangan / tanda tangan palsu ditolak
  expect((await decide(qa, lotB, "released", uid())).ok).toBe(false);
  expect((await sql(c, "SELECT qc_status FROM mfg_lots WHERE id = ?", [lotB]))[0].qc_status).toBe("quarantine");

  // kirim kode → ambil dari email nyata
  const sig1 = await send(qa, "mfg_lots", lotB, "lot_released");
  expect(sig1.ok, sig1.error).toBe(true);
  const [ch] = await sql(c, "SELECT * FROM mfg_esign_challenges WHERE id = ?", [sig1.v.id]);
  const code1 = lastCode(QA.email)!;
  expect(code1).toMatch(/^\d{6}$/);
  expect(ch.code_hash).toBe(crypto.createHash("sha256").update(`${sig1.v.id}:${code1}`).digest("hex")); // hash, bukan kode
  expect(ch.code_hash).not.toContain(code1);
  expect(new Date(ch.expires_at).getTime() - new Date(ch.created_at).getTime()).toBeLessThanOrEqual(300_000 + 2000);
  // batas kirim 1/menit
  expect((await send(qa, "mfg_lots", lotB, "lot_released")).ok).toBe(false);
  // kode salah ×; pelaku lain tak bisa memverifikasi; kode benar
  const wrong = String((Number(code1) + 1) % 1_000_000).padStart(6, "0");
  expect((await verify(qa, sig1.v.id, wrong)).ok).toBe(false);
  expect((await verify(qc, sig1.v.id, code1)).ok).toBe(false); // bukan pelaku
  expect(Number((await sql(c, "SELECT attempts FROM mfg_esign_challenges WHERE id = ?", [sig1.v.id]))[0].attempts)).toBe(1);
  // tantangan belum terverifikasi tak bisa dipakai
  expect((await decide(qa, lotB, "released", sig1.v.id)).ok).toBe(false);
  expect((await verify(qa, sig1.v.id, code1)).ok, "kode benar").toBe(true);
  // terikat aksi: tanda tangan 'lot_released' tak bisa dipakai untuk 'rejected' atau lot lain
  expect((await decide(qa, lotB, "rejected", sig1.v.id)).ok).toBe(false);
  expect((await decide(qa, lotC, "released", sig1.v.id)).ok).toBe(false);
  expect((await sql(c, "SELECT consumed_at FROM mfg_esign_challenges WHERE id = ?", [sig1.v.id]))[0].consumed_at).toBeNull();
  // rilis sukses
  const rel = await decide(qa, lotB, "released", sig1.v.id);
  expect(rel.ok, rel.error).toBe(true);
  expect((await sql(c, "SELECT qc_status FROM mfg_lots WHERE id = ?", [lotB]))[0].qc_status).toBe("released");
  expect((await sql(c, "SELECT consumed_at FROM mfg_esign_challenges WHERE id = ?", [sig1.v.id]))[0].consumed_at).not.toBeNull();
  const relAudit = await sql(c, "SELECT * FROM mfg_audit_log WHERE workspace_id = ? AND entity_table = 'mfg_lots' AND entity_id = ? AND action = 'UPDATE'", [ws, lotB]);
  expect(relAudit[0]).toMatchObject({ reason: "keputusan QA", signature_method: "otp" });
  expect(relAudit[0].signed_at).not.toBeNull();
  // sekali pakai: tidak bisa dipakai lagi
  expect((await decide(qa, lotB, "hold", sig1.v.id)).ok).toBe(false);
  expect((await verify(qa, sig1.v.id, code1)).ok).toBe(false);

  // tantangan kedaluwarsa & batas percobaan (tambah mundur created_at supaya lolos batas 1/menit)
  const aged = async () => c.execute("UPDATE mfg_esign_challenges SET created_at = DATE_SUB(created_at, INTERVAL 5 MINUTE) WHERE actor = ?", [await uidOf(QA.email)]);
  await aged();
  const sig2 = await send(qa, "mfg_lots", lotC, "lot_released");
  const code2 = lastCode(QA.email)!;
  await c.execute("UPDATE mfg_esign_challenges SET expires_at = DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE id = ?", [sig2.v.id]);
  expect((await verify(qa, sig2.v.id, code2)).ok).toBe(false); // kedaluwarsa
  await aged();
  const sig3 = await send(qa, "mfg_lots", lotC, "lot_released");
  const code3 = lastCode(QA.email)!;
  const w3 = String((Number(code3) + 7) % 1_000_000).padStart(6, "0");
  for (let i = 0; i < 5; i++) expect((await verify(qa, sig3.v.id, w3)).ok).toBe(false);
  expect((await verify(qa, sig3.v.id, code3)).ok).toBe(false); // 5 percobaan habis → kode benar pun ditolak

  // lot A: inspeksi terakhir gagal → rilis ditolak walau tanda tangan sah; deviasi terbuka juga memblokir
  await aged();
  const sigA = await send(qa, "mfg_lots", lotA, "lot_released");
  expect((await verify(qa, sigA.v.id, lastCode(QA.email)!)).ok).toBe(true);
  const relA = await decide(qa, lotA, "released", sigA.v.id);
  expect(relA.ok).toBe(false);
  expect((await sql(c, "SELECT qc_status FROM mfg_lots WHERE id = ?", [lotA]))[0].qc_status).toBe("quarantine");
  expect((await sql(c, "SELECT consumed_at FROM mfg_esign_challenges WHERE id = ?", [sigA.v.id]))[0].consumed_at).toBeNull(); // penolakan tak mengonsumsi tanda tangan
  // tolak lot A memakai tanda tangan itu? aksi berbeda → ditolak; buat tanda tangan 'lot_rejected'
  await aged();
  const sigR = await send(qa, "mfg_lots", lotA, "lot_rejected");
  expect((await verify(qa, sigR.v.id, lastCode(QA.email)!)).ok).toBe(true);
  const rej = await decide(qa, lotA, "rejected", sigR.v.id);
  expect(rej.ok, rej.error).toBe(true);
  expect((await sql(c, "SELECT qc_status FROM mfg_lots WHERE id = ?", [lotA]))[0].qc_status).toBe("rejected");
  // status akhir tak bisa diubah
  await aged();
  const sigR2 = await send(qa, "mfg_lots", lotA, "lot_released");
  expect((await verify(qa, sigR2.v.id, lastCode(QA.email)!)).ok).toBe(true);
  expect((await decide(qa, lotA, "released", sigR2.v.id)).ok).toBe(false);

  /* ---------- deviasi / CAPA ---------- */
  const saveDev = (p: Page, over: Record<string, unknown>, id: string | null = null) =>
    call(p, "production-quality.functions", "saveDeviation", { workspaceId: ws, id, reason: "catat deviasi", values: { lot_id: "", order_id: "", description: "", impact: "", root_cause: "", capa: "", ...over } });
  const manual = await saveDev(qc, { lot_id: lotC, description: "Suhu penyimpanan melebihi batas", impact: "Lot C" });
  expect(manual.ok, manual.error).toBe(true);
  const [dv] = await sql(c, "SELECT * FROM mfg_deviations WHERE id = ?", [manual.v.id]);
  expect(dv).toMatchObject({ source: "manual", status: "open", lot_id: lotC });
  expect(dv.deviation_no).toMatch(new RegExp(`^DEV-${new Date().getFullYear()}-0002$`)); // penomoran berurutan dari pengaturan
  expect((await saveDev(qc, { description: "" })).ok).toBe(false);
  expect((await saveDev(qc, { description: "x", lot_id: "00000000-0000-4000-8000-0000000000aa" })).ok).toBe(false);
  expect((await saveDev(plain, { description: "polos" })).ok).toBe(false);
  // lot C punya deviasi terbuka → rilis diblokir
  await aged();
  const sigC = await send(qa, "mfg_lots", lotC, "lot_released");
  expect((await verify(qa, sigC.v.id, lastCode(QA.email)!)).ok).toBe(true);
  expect((await decide(qa, lotC, "released", sigC.v.id)).ok).toBe(false);
  // investigasi: akar masalah + CAPA → status investigating; tutup butuh QA + e-sign
  const closeDev = (p: Page, id: string, signature: string) => call(p, "production-quality.functions", "closeDeviation", { workspaceId: ws, id, signature, reason: "CAPA selesai" });
  await aged();
  const sigD0 = await send(qa, "mfg_deviations", manual.v.id, "deviation_close");
  expect((await verify(qa, sigD0.v.id, lastCode(QA.email)!)).ok).toBe(true);
  expect((await closeDev(qa, manual.v.id, sigD0.v.id)).ok).toBe(false); // belum ada akar masalah/CAPA
  const inv = await saveDev(qc, { impact: "Lot C ditahan", root_cause: "AC rusak", capa: "Perbaiki AC" }, manual.v.id);
  expect(inv.ok, inv.error).toBe(true);
  expect((await sql(c, "SELECT status FROM mfg_deviations WHERE id = ?", [manual.v.id]))[0].status).toBe("investigating");
  expect((await closeDev(qc, manual.v.id, sigD0.v.id)).ok).toBe(false); // analis bukan QA manager
  const cl = await closeDev(qa, manual.v.id, sigD0.v.id);
  expect(cl.ok, cl.error).toBe(true);
  const [closed] = await sql(c, "SELECT * FROM mfg_deviations WHERE id = ?", [manual.v.id]);
  expect(closed.status).toBe("closed");
  expect(closed.closed_by).toBe(await uidOf(QA.email));
  expect(closed.closed_at).not.toBeNull();
  expect((await saveDev(qc, { impact: "ubah" }, manual.v.id)).ok).toBe(false); // deviasi tertutup tak bisa diubah
  expect((await closeDev(qa, manual.v.id, sigD0.v.id)).ok).toBe(false); // sekali pakai
  // lot C masih terblokir oleh deviasi otomatis? (hanya lot A) → C punya inspeksi lulus & deviasi tertutup → bisa dirilis
  await aged();
  const sigC2 = await send(qa, "mfg_lots", lotC, "lot_released");
  expect((await verify(qa, sigC2.v.id, lastCode(QA.email)!)).ok).toBe(true);
  expect((await decide(qa, lotC, "released", sigC2.v.id)).ok, "lot C rilis").toBe(true);
  // lot yang sudah released: keputusan sama = no-op tanpa mengonsumsi tanda tangan
  await aged();
  const sigNo = await send(qa, "mfg_lots", lotC, "lot_released");
  expect((await verify(qa, sigNo.v.id, lastCode(QA.email)!)).ok).toBe(true);
  expect((await decide(qa, lotC, "released", sigNo.v.id)).ok).toBe(true);
  expect((await sql(c, "SELECT consumed_at FROM mfg_esign_challenges WHERE id = ?", [sigNo.v.id]))[0].consumed_at).toBeNull();

  /* ---------- UI: tabel & status lot ---------- */
  await page.goto(`/app/w/${ws}/manufacturing/quality`);
  await expect(page.getByRole("row", { name: /QA-B FG-QC/ })).toContainText("released");
  await expect(page.getByRole("row", { name: /SMP-A/ })).toContainText("failed");
  await page.getByRole("button", { name: "Deviasi & CAPA" }).click();
  await expect(page.getByRole("row", { name: /DEV-.*-0002/ })).toContainText("closed");
  await expect(page.getByText("Rilis/tolak lot dan penutupan deviasi hanya untuk peran QA manager.")).toBeVisible(); // admin/owner bukan QA manager

  /* ---------- lintas workspace & audit ---------- */
  expect((await call(page, "production-quality.functions", "getInspectionResults", { workspaceId: baseWs, inspectionId: insB.v.id })).v ?? []).toHaveLength(0);
  const auditTables = (await sql(c, "SELECT DISTINCT entity_table FROM mfg_audit_log WHERE workspace_id = ?", [ws])).map((r) => r.entity_table);
  for (const t of ["mfg_qc_specs", "mfg_qc_inspections", "mfg_qc_results", "mfg_deviations", "mfg_lots"]) expect(auditTables).toContain(t);
  await ctxQa.close();
  await ctxQc.close();
  await ctxPlain.close();
  await c.execute("DELETE FROM md_items WHERE id = ?", [foreignItem]);
});
