/**
 * SERVER KLIEN (self-hosted) — mode instalasi, verifikasi lisensi, dan laporan ke pusat (server-only).
 *
 * Aktif bila `XPERD_INSTANCE_MODE=self_hosted`. Pengaturan:
 *   XPERD_CONTROL_URL        alamat pusat (mis. https://xperd.id)
 *   XPERD_INSTANCE_TOKEN     token instalasi dari Super Admin pusat → Instalasi klien
 *   XPERD_LICENSE_PUBLIC_KEY kunci publik penandatangan lisensi (satu baris, dari pusat)
 * Lisensi disimpan di `instance_state`, sehingga tetap berlaku bila koneksi ke pusat putus sementara.
 */
import { createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { cpus, freemem, hostname, loadavg, totalmem, uptime } from "node:os";
import { statfs } from "node:fs/promises";

import { execute, executeOne } from "@/integrations/mysql/pool";
import {
  licensedAppModules,
  licenseStatus,
  LICENSE_MODULES,
  type LicensePayload,
} from "@/lib/instance";

export const isSelfHosted = () => process.env.XPERD_INSTANCE_MODE === "self_hosted";

function publicKey() {
  const raw = (process.env.XPERD_LICENSE_PUBLIC_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!raw) return null;
  const pem = raw.includes("BEGIN")
    ? raw
    : `-----BEGIN PUBLIC KEY-----\n${raw.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----\n`;
  try {
    return createPublicKey(pem);
  } catch {
    return null;
  }
}

/** Verifikasi tanda tangan lisensi; null bila tidak sah. */
export function verifyLicense(token: string | null | undefined): LicensePayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  const key = publicKey();
  if (!body || !sig || !key) return null;
  try {
    const ok = verify(null, Buffer.from(body), key, Buffer.from(sig, "base64url"));
    return ok
      ? (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LicensePayload)
      : null;
  } catch {
    return null;
  }
}

const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

let cache: { at: number; value: InstanceInfo } | null = null;

export interface InstanceInfo {
  selfHosted: boolean;
  status: ReturnType<typeof licenseStatus>["status"];
  daysLeft: number | null;
  client: string | null;
  modules: string[];
  licenseKeys: string[];
  maxUsers: number | null;
  expiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

/** Info instalasi untuk UI & penegakan (cache 60 detik). */
export async function instanceInfo(force = false): Promise<InstanceInfo> {
  if (!isSelfHosted())
    return {
      selfHosted: false,
      status: "valid",
      daysLeft: null,
      client: null,
      modules: [],
      licenseKeys: [],
      maxUsers: null,
      expiresAt: null,
      lastSyncAt: null,
      lastError: null,
    };
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.value;
  const st = await executeOne<{
    license: string | null;
    last_ok_at: string | null;
    last_error: string | null;
  }>("SELECT license, last_ok_at, last_error FROM instance_state WHERE id = 1").catch(() => null);
  const lic = verifyLicense(st?.license);
  const ls =
    st?.license && !lic
      ? { status: "invalid" as const, daysLeft: null }
      : licenseStatus(lic, todayWib());
  const usable = ls.status !== "expired" && ls.status !== "invalid" && ls.status !== "missing";
  const value: InstanceInfo = {
    selfHosted: true,
    status: ls.status,
    daysLeft: ls.daysLeft,
    client: lic?.client ?? null,
    modules: usable && lic ? licensedAppModules(lic.modules) : licensedAppModules([]),
    licenseKeys: lic?.modules ?? [],
    maxUsers: lic?.max_users ?? null,
    expiresAt: lic?.expires_at ?? null,
    lastSyncAt: st?.last_ok_at ?? null,
    lastError: st?.last_error ?? null,
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Ringkasan kesehatan ringan (tanpa data bisnis) untuk pusat. */
async function buildReport() {
  const errors: string[] = [];
  let diskPct = 0;
  let diskFree = 0;
  try {
    const fs = await statfs("/");
    const total = fs.blocks * fs.bsize;
    diskFree = fs.bavail * fs.bsize;
    diskPct = total ? Math.round(((total - diskFree) / total) * 1000) / 10 : 0;
  } catch {
    // tidak tersedia
  }
  const t0 = performance.now();
  await executeOne("SELECT 1 AS ok");
  const ping = Math.round((performance.now() - t0) * 10) / 10;
  const q = async <T>(sql: string, args: unknown[] = []) =>
    executeOne<T>(sql, args).catch((e: Error) => {
      errors.push(e.message.slice(0, 120));
      return null;
    });
  const size = await q<{ b: number }>(
    "SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS b FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  const conn = await q<{ Value: string }>(
    "SHOW GLOBAL STATUS WHERE Variable_name = 'Threads_connected'",
  );
  const users = await q<{ total: number; active: number }>(
    "SELECT COUNT(*) AS total, SUM(is_active = 1) AS active FROM app_users",
  );
  const ws = await q<{ c: number }>("SELECT COUNT(*) AS c FROM workspaces");
  const backup = await q<{ kind: string; status: string; started_at: string; size_bytes: number }>(
    "SELECT kind, status, started_at, size_bytes FROM system_backups WHERE kind = 'db' ORDER BY started_at DESC LIMIT 1",
  );
  const info = await instanceInfo(true);
  return {
    version: process.env.APP_VERSION || null,
    hostname: hostname(),
    uptime_s: Math.round(uptime()),
    cpu_pct: Math.round((loadavg()[0] / Math.max(1, cpus().length)) * 1000) / 10,
    mem_pct: Math.round(((totalmem() - freemem()) / totalmem()) * 1000) / 10,
    disk_pct: diskPct,
    disk_free_bytes: diskFree,
    db_ping_ms: ping,
    db_size_bytes: Number(size?.b ?? 0),
    db_connections: Number(conn?.Value ?? 0),
    users_total: Number(users?.total ?? 0),
    users_active: Number(users?.active ?? 0),
    workspaces: Number(ws?.c ?? 0),
    last_backup: backup
      ? {
          kind: backup.kind,
          status: backup.status,
          at: new Date(String(backup.started_at).replace(" ", "T") + "Z").toISOString(),
          size_bytes: Number(backup.size_bytes ?? 0),
        }
      : null,
    license_status: info.status,
    errors,
  };
}

/** Kirim laporan ke pusat dan simpan lisensi terbaru. Dipanggil penjadwal tiap 5 menit. */
export async function syncWithControl(): Promise<{ ok: boolean; error?: string }> {
  if (!isSelfHosted()) return { ok: false, error: "bukan mode self-hosted" };
  const url = (process.env.XPERD_CONTROL_URL ?? "").replace(/\/+$/, "");
  const token = process.env.XPERD_INSTANCE_TOKEN ?? "";
  await execute("INSERT IGNORE INTO instance_state (id) VALUES (1)");
  try {
    if (!url || !token) throw new Error("XPERD_CONTROL_URL / XPERD_INSTANCE_TOKEN belum diisi");
    const res = await fetch(`${url}/api/public/instance/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(await buildReport()),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { license?: string; error?: string };
    if (!res.ok || !body.license) throw new Error(body.error ?? `HTTP ${res.status}`);
    if (!verifyLicense(body.license))
      throw new Error("Lisensi dari pusat tidak sah (periksa XPERD_LICENSE_PUBLIC_KEY)");
    await execute(
      "UPDATE instance_state SET license = ?, last_sync_at = UTC_TIMESTAMP(), last_ok_at = UTC_TIMESTAMP(), last_error = NULL WHERE id = 1",
      [body.license],
    );
    cache = null;
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await execute(
      "UPDATE instance_state SET last_sync_at = UTC_TIMESTAMP(), last_error = ? WHERE id = 1",
      [msg],
    ).catch(() => undefined);
    cache = null;
    return { ok: false, error: msg };
  }
}

/** Tolak bila jumlah pengguna aktif sudah mencapai batas lisensi (self-hosted). */
export async function assertUserSeat() {
  if (!isSelfHosted()) return;
  const info = await instanceInfo();
  if (info.maxUsers == null) return;
  const r = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM app_users WHERE is_active = 1",
  );
  if (Number(r?.c ?? 0) >= info.maxUsers)
    throw new Error(
      `Batas lisensi ${info.maxUsers} pengguna sudah tercapai. Hubungi XPERD untuk menambah pengguna.`,
    );
}

/** Instalasi mandiri tidak menerima pendaftaran umum: akun dibuat admin klien. */
export function assertPublicSignupAllowed() {
  if (isSelfHosted())
    throw new Error(
      "Pendaftaran mandiri tidak tersedia di instalasi ini. Minta admin perusahaan Anda membuatkan akun.",
    );
}

export const LICENSE_MODULE_NAMES = Object.fromEntries(LICENSE_MODULES.map((m) => [m.key, m.name]));

// ── Penyiapan pertama (first-run) di server klien ───────────────────────────

/** Halaman /setup hanya terbuka di instalasi mandiri yang belum punya perusahaan sama sekali. */
export async function setupNeeded(): Promise<boolean> {
  if (!isSelfHosted()) return false;
  const r = await executeOne<{ c: number }>("SELECT COUNT(*) AS c FROM tenants");
  return Number(r?.c ?? 0) === 0;
}

function codeMatches(given: string): boolean {
  const want = (process.env.XPERD_SETUP_CODE ?? "").trim();
  if (want.length < 8) return false; // belum diatur → penyiapan ditolak
  const a = Buffer.from(given.trim());
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Buat perusahaan + admin pertama. Memakai alur provisioning biasa (paket enterprise),
 * tetapi tenant langsung aktif: tanpa trial, invoice, atau bonus kredit.
 */
export async function completeSetup(i: {
  code: string;
  company: string;
  name: string;
  email: string;
  password: string;
}) {
  if (!(await setupNeeded())) throw new Error("Instalasi ini sudah disiapkan. Silakan masuk.");
  if (!codeMatches(i.code)) throw new Error("Kode penyiapan salah.");
  const { uuid } = await import("@/integrations/mysql/pool");
  const email = i.email.trim().toLowerCase();
  const base =
    i.company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "perusahaan";
  const regId = uuid();
  await execute(
    `INSERT INTO registrations
       (id, company_name, subdomain, contact_name, email, phone, city, industry, package_code, billing_cycle, status, notes)
     VALUES (?, ?, ?, ?, ?, '', NULL, NULL, 'enterprise', 'yearly', 'pending', ?)`,
    [regId, i.company.trim(), base, i.name.trim(), email, "Penyiapan instalasi mandiri"],
  );
  const { provisionRegistrationCore } = await import("@/lib/provisioning-core.server");
  const r = await provisionRegistrationCore(regId, i.password, {
    signupSource: "admin",
    selfHosted: true,
  });
  cache = null;
  return { email: r.email, workspaceId: r.workspaceId };
}
