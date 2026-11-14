/**
 * PUSAT (xperd.id) — instalasi XPERD di server klien: daftar, token, lisensi bertanda tangan
 * (Ed25519), dan laporan kesehatan yang dikirim server klien tiap 5 menit (server-only).
 *
 * Koneksi satu arah: server klien yang menghubungi pusat (`/api/public/instance/heartbeat`),
 * jadi tidak perlu membuka port masuk di jaringan klien. Data bisnis klien tidak pernah dikirim.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

import { execute, executeOne, uuid } from "@/integrations/mysql/pool";
import { LICENSE_MODULE_KEYS, type LicensePayload } from "@/lib/instance";

const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Kunci penandatangan lisensi pusat (dibuat sekali). */
export async function licenseKeys() {
  let row = await executeOne<{ public_pem: string; private_pem: string }>(
    "SELECT public_pem, private_pem FROM platform_license_keys WHERE id = 1",
  );
  if (!row) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await execute(
      "INSERT IGNORE INTO platform_license_keys (id, public_pem, private_pem) VALUES (1, ?, ?)",
      [pub, priv],
    );
    row = await executeOne(
      "SELECT public_pem, private_pem FROM platform_license_keys WHERE id = 1",
    );
  }
  return row!;
}

/** Kunci publik dalam satu baris (untuk .env server klien). */
export async function publicKeyOneLine() {
  const { public_pem } = await licenseKeys();
  return public_pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
}

export async function signLicense(p: LicensePayload) {
  const { private_pem } = await licenseKeys();
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = sign(null, Buffer.from(body), private_pem);
  return `${body}.${b64url(sig)}`;
}

interface Row {
  id: string;
  name: string;
  client_name: string | null;
  domain: string | null;
  token_hint: string | null;
  modules: unknown;
  max_users: number;
  expires_at: string | null;
  grace_days: number;
  status: string;
  notes: string | null;
  last_seen_at: string | null;
  last_ip: string | null;
  last_version: string | null;
  last_report: unknown;
  created_at: string;
}

const parse = <T>(v: unknown, d: T): T => {
  if (v == null) return d;
  try {
    return (typeof v === "string" ? JSON.parse(v) : v) as T;
  } catch {
    return d;
  }
};

export interface InstanceReport {
  version?: string | null;
  hostname?: string;
  uptime_s?: number;
  cpu_pct?: number;
  mem_pct?: number;
  disk_pct?: number;
  disk_free_bytes?: number;
  db_ping_ms?: number;
  db_size_bytes?: number;
  db_connections?: number;
  storage_bytes?: number;
  users_active?: number;
  users_total?: number;
  workspaces?: number;
  last_backup?: { kind: string; status: string; at: string; size_bytes: number } | null;
  license_status?: string;
  errors?: string[];
}

function view(r: Row) {
  const seen = r.last_seen_at ? Date.parse(r.last_seen_at.replace(" ", "T") + "Z") : null;
  const ageMin = seen ? Math.round((Date.now() - seen) / 60_000) : null;
  const report = parse<InstanceReport | null>(r.last_report, null);
  const alerts: string[] = [];
  if (r.status === "active") {
    if (ageMin == null) alerts.push("Belum pernah melapor");
    else if (ageMin > 15) alerts.push(`Tidak melapor ${ageMin} menit`);
    if ((report?.disk_pct ?? 0) >= 85) alerts.push(`Disk ${report?.disk_pct}%`);
    if ((report?.mem_pct ?? 0) >= 90) alerts.push(`RAM ${report?.mem_pct}%`);
    if (report?.last_backup?.status === "failed") alerts.push("Backup terakhir gagal");
    const lb = report?.last_backup?.at ? Date.parse(report.last_backup.at) : null;
    if (report && (!lb || Date.now() - lb > 2 * 86_400_000)) alerts.push("Backup > 2 hari");
    if (r.expires_at) {
      const d = Math.round((Date.parse(r.expires_at) - Date.now()) / 86_400_000);
      if (d < 0) alerts.push(`Lisensi lewat ${-d} hari`);
      else if (d < 30) alerts.push(`Lisensi habis ${d} hari lagi`);
    }
    if ((report?.users_active ?? 0) > r.max_users) alerts.push("Pengguna melebihi lisensi");
  }
  return {
    id: r.id,
    name: r.name,
    client_name: r.client_name,
    domain: r.domain,
    token_hint: r.token_hint,
    modules: parse<string[]>(r.modules, []),
    max_users: Number(r.max_users),
    expires_at: r.expires_at ? String(r.expires_at).slice(0, 10) : null,
    grace_days: Number(r.grace_days),
    status: r.status,
    notes: r.notes,
    last_seen_at: r.last_seen_at,
    last_seen_min: ageMin,
    online: ageMin != null && ageMin <= 15,
    last_ip: r.last_ip,
    last_version: r.last_version,
    report,
    alerts,
    created_at: r.created_at,
  };
}
export type ManagedInstance = ReturnType<typeof view>;

export async function listInstances() {
  const rows = await execute<Row>("SELECT * FROM managed_instances ORDER BY name");
  return rows.map(view);
}

export interface InstanceInput {
  name: string;
  client_name?: string | null;
  domain?: string | null;
  modules: string[];
  max_users: number;
  expires_at?: string | null;
  grace_days: number;
  notes?: string | null;
}

const cleanModules = (m: string[]) =>
  [...new Set(m)].filter((k) => (LICENSE_MODULE_KEYS as readonly string[]).includes(k));

function newToken() {
  const token = `xpi_${randomBytes(24).toString("base64url")}`;
  return { token, hash: sha256(token), hint: `${token.slice(0, 8)}…${token.slice(-4)}` };
}

/** Buat instalasi; token hanya dikembalikan sekali. */
export async function createInstance(i: InstanceInput, userId: string) {
  const id = uuid();
  const t = newToken();
  await execute(
    `INSERT INTO managed_instances (id, name, client_name, domain, token_hash, token_hint, modules, max_users,
                                    expires_at, grace_days, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      i.name.trim(),
      i.client_name?.trim() || null,
      i.domain?.trim() || null,
      t.hash,
      t.hint,
      JSON.stringify(cleanModules(i.modules)),
      i.max_users,
      i.expires_at || null,
      i.grace_days,
      i.notes?.trim() || null,
      userId,
    ],
  );
  return { id, token: t.token, publicKey: await publicKeyOneLine() };
}

export async function updateInstance(id: string, i: InstanceInput & { status: string }) {
  await execute(
    `UPDATE managed_instances SET name = ?, client_name = ?, domain = ?, modules = ?, max_users = ?,
            expires_at = ?, grace_days = ?, notes = ?, status = ? WHERE id = ?`,
    [
      i.name.trim(),
      i.client_name?.trim() || null,
      i.domain?.trim() || null,
      JSON.stringify(cleanModules(i.modules)),
      i.max_users,
      i.expires_at || null,
      i.grace_days,
      i.notes?.trim() || null,
      i.status === "suspended" ? "suspended" : "active",
      id,
    ],
  );
}

export async function rotateInstanceToken(id: string) {
  const t = newToken();
  await execute("UPDATE managed_instances SET token_hash = ?, token_hint = ? WHERE id = ?", [
    t.hash,
    t.hint,
    id,
  ]);
  return { token: t.token, publicKey: await publicKeyOneLine() };
}

export async function deleteInstance(id: string) {
  await execute("DELETE FROM managed_instances WHERE id = ?", [id]);
}

/** Lisensi untuk satu instalasi (instalasi ditangguhkan → modul kosong). */
export async function licenseFor(r: {
  id: string;
  name: string;
  client_name: string | null;
  modules: unknown;
  max_users: number;
  expires_at: string | null;
  grace_days: number;
  status: string;
}) {
  const suspended = r.status === "suspended";
  return signLicense({
    iid: r.id,
    client: r.client_name || r.name,
    modules: suspended
      ? []
      : (cleanModules(parse<string[]>(r.modules, [])) as LicensePayload["modules"]),
    max_users: Number(r.max_users),
    expires_at: suspended
      ? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
      : r.expires_at
        ? String(r.expires_at).slice(0, 10)
        : null,
    grace_days: suspended ? 0 : Number(r.grace_days),
    iat: new Date().toISOString(),
  });
}

/** Terima laporan dari server klien → simpan, balas lisensi terbaru. */
export async function handleHeartbeat(token: string, report: InstanceReport, ip: string | null) {
  const r = await executeOne<Row & { token_hash: string }>(
    "SELECT * FROM managed_instances WHERE token_hash = ?",
    [sha256(token)],
  );
  if (!r) return null;
  const json = JSON.stringify(report ?? {});
  const safe: InstanceReport = json.length > 20_000 ? { version: report?.version ?? null } : report;
  await execute(
    `UPDATE managed_instances SET last_seen_at = UTC_TIMESTAMP(), last_ip = ?, last_version = ?, last_report = ?
      WHERE id = ?`,
    [ip?.slice(0, 64) ?? null, safe.version?.slice(0, 64) ?? null, JSON.stringify(safe), r.id],
  );
  return { license: await licenseFor(r), server_time: new Date().toISOString() };
}
