/**
 * XPro — Teknis & Serah Terima (server-only).
 *
 * Aset teknis per proyek (repo source code, database, server/hosting, URL aplikasi, domain,
 * layanan pihak ketiga, akun) + catatan dokumentasi, supaya ketika freelancer/anggota tim
 * keluar seluruh pengetahuan & akses tetap tersimpan di workspace.
 *
 * Rahasia (password/token/connection string) dienkripsi AES-256-GCM. Kunci dari
 * `VAULT_ENCRYPTION_KEY`; bila kosong diturunkan dari `APP_JWT_SECRET` (jangan mengganti
 * secret tersebut tanpa memindahkan rahasia lebih dulu). Membuka rahasia hanya untuk
 * pengelola workspace atau pembuat aset, dan setiap pembukaan dicatat.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { execute, executeOne, uuid } from "@/integrations/mysql/pool";
import { xproAccess } from "@/lib/xpro-tasks.server";

export const ASSET_KINDS = [
  "repo",
  "database",
  "server",
  "url",
  "domain",
  "service",
  "account",
  "other",
] as const;
export const ENVIRONMENTS = ["production", "staging", "development", "other"] as const;
export const NOTE_CATEGORIES = [
  "setup",
  "architecture",
  "deploy",
  "handover",
  "log",
  "other",
] as const;

/* ------------------------------ enkripsi ------------------------------ */

function vaultKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY || process.env.APP_JWT_SECRET;
  if (!raw) throw new Error("Kunci enkripsi belum diatur (VAULT_ENCRYPTION_KEY)");
  const label = process.env.VAULT_ENCRYPTION_KEY ? "xperd-vault" : "xperd-vault-jwt";
  return createHash("sha256").update(`${label}:${raw}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  if (!blob.startsWith("v1:")) throw new Error("Format rahasia tidak dikenal");
  const buf = Buffer.from(blob.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", vaultKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  try {
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new Error("Rahasia tidak bisa dibuka (kunci enkripsi server berubah?)");
  }
}

/* ------------------------------ akses ------------------------------ */

async function projectOf(workspaceId: string, projectId: string) {
  const p = await executeOne<{ id: string; code: string; name: string }>(
    "SELECT id, code, name FROM prj_projects WHERE id = ? AND workspace_id = ?",
    [projectId, workspaceId],
  );
  if (!p) throw new Error("Proyek tidak ditemukan");
  return p;
}

async function access(workspaceId: string, userId: string, need: "member" | "writer" | "manager") {
  const a = await xproAccess(workspaceId, userId);
  if (!a[need]) throw new Error("Akses ditolak");
  return a;
}

async function log(
  workspaceId: string,
  projectId: string,
  assetId: string | null,
  userId: string,
  action: string,
  detail: string | null = null,
) {
  await execute(
    `INSERT INTO prj_tech_access_log (id, workspace_id, project_id, asset_id, user_id, action, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), workspaceId, projectId, assetId, userId, action, detail?.slice(0, 255) ?? null],
  );
}

/* ------------------------------ aset ------------------------------ */

export interface TechAsset {
  id: string;
  kind: string;
  name: string;
  environment: string;
  url: string | null;
  host: string | null;
  username: string | null;
  secret_label: string | null;
  has_secret: boolean;
  account_owner: string | null;
  notes: string | null;
  last_verified_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  updated_at: string;
  can_reveal: boolean;
}

export async function listTechData(workspaceId: string, projectId: string, userId: string) {
  const a = await access(workspaceId, userId, "member");
  await projectOf(workspaceId, projectId);
  const assets = await execute<Record<string, unknown>>(
    `SELECT t.id, t.kind, t.name, t.environment, t.url, t.host, t.username, t.secret_label,
            (t.secret_cipher IS NOT NULL AND t.secret_cipher <> '') AS has_secret, t.account_owner, t.notes,
            t.last_verified_at, t.created_by, t.updated_at,
            COALESCE(pc.full_name, uc.email) AS created_by_name, COALESCE(pu.full_name, uu.email) AS updated_by_name
       FROM prj_tech_assets t
       LEFT JOIN profiles pc ON pc.id = t.created_by LEFT JOIN app_users uc ON uc.id = t.created_by
       LEFT JOIN profiles pu ON pu.id = t.updated_by LEFT JOIN app_users uu ON uu.id = t.updated_by
      WHERE t.workspace_id = ? AND t.project_id = ?
      ORDER BY FIELD(t.kind, 'repo','database','server','url','domain','service','account','other'), t.name`,
    [workspaceId, projectId],
  );
  const notes = await execute<Record<string, unknown>>(
    `SELECT n.id, n.category, n.title, n.body, n.created_by, n.updated_at, n.created_at,
            COALESCE(p.full_name, u.email) AS author
       FROM prj_tech_notes n
       LEFT JOIN profiles p ON p.id = COALESCE(n.updated_by, n.created_by)
       LEFT JOIN app_users u ON u.id = COALESCE(n.updated_by, n.created_by)
      WHERE n.workspace_id = ? AND n.project_id = ?
      ORDER BY n.updated_at DESC`,
    [workspaceId, projectId],
  );
  const logs = a.manager
    ? await execute<Record<string, unknown>>(
        `SELECT l.action, l.detail, l.created_at, t.name AS asset, COALESCE(p.full_name, u.email) AS who
           FROM prj_tech_access_log l
           LEFT JOIN prj_tech_assets t ON t.id = l.asset_id
           LEFT JOIN profiles p ON p.id = l.user_id LEFT JOIN app_users u ON u.id = l.user_id
          WHERE l.workspace_id = ? AND l.project_id = ?
          ORDER BY l.created_at DESC LIMIT 30`,
        [workspaceId, projectId],
      )
    : [];
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    canWrite: a.writer,
    isManager: a.manager,
    assets: assets.map((r): TechAsset => ({
      id: String(r.id),
      kind: String(r.kind),
      name: String(r.name),
      environment: String(r.environment),
      url: s(r.url),
      host: s(r.host),
      username: s(r.username),
      secret_label: s(r.secret_label),
      has_secret: Number(r.has_secret) === 1,
      account_owner: s(r.account_owner),
      notes: s(r.notes),
      last_verified_at: s(r.last_verified_at),
      created_by: s(r.created_by),
      created_by_name: s(r.created_by_name),
      updated_by_name: s(r.updated_by_name),
      updated_at: String(r.updated_at),
      can_reveal: a.manager || r.created_by === userId,
    })),
    notes: notes.map((r) => ({
      id: String(r.id),
      category: String(r.category),
      title: String(r.title),
      body: s(r.body) ?? "",
      author: s(r.author),
      updated_at: String(r.updated_at),
      created_at: String(r.created_at),
    })),
    logs: logs.map((r) => ({
      action: String(r.action),
      detail: s(r.detail),
      asset: s(r.asset),
      who: s(r.who),
      at: String(r.created_at),
    })),
  };
}

export interface AssetInput {
  workspaceId: string;
  projectId: string;
  id?: string;
  kind: string;
  name: string;
  environment: string;
  url?: string | null;
  host?: string | null;
  username?: string | null;
  secret_label?: string | null;
  /** undefined = tidak diubah, "" = hapus rahasia, isi = ganti. */
  secret?: string;
  account_owner?: string | null;
  notes?: string | null;
  verified?: boolean;
}

export async function saveTechAsset(i: AssetInput, userId: string) {
  await access(i.workspaceId, userId, "writer");
  await projectOf(i.workspaceId, i.projectId);
  const cipher =
    i.secret === undefined ? undefined : i.secret === "" ? null : encryptSecret(i.secret);
  const vals = [
    i.kind,
    i.name.trim(),
    i.environment,
    i.url?.trim() || null,
    i.host?.trim() || null,
    i.username?.trim() || null,
    i.secret_label?.trim() || null,
    i.account_owner?.trim() || null,
    i.notes?.trim() || null,
  ];
  if (i.id) {
    const cur = await executeOne<{ id: string }>(
      "SELECT id FROM prj_tech_assets WHERE id = ? AND workspace_id = ? AND project_id = ?",
      [i.id, i.workspaceId, i.projectId],
    );
    if (!cur) throw new Error("Aset tidak ditemukan");
    await execute(
      `UPDATE prj_tech_assets SET kind = ?, name = ?, environment = ?, url = ?, host = ?, username = ?,
              secret_label = ?, account_owner = ?, notes = ?, updated_by = ?
              ${cipher !== undefined ? ", secret_cipher = ?" : ""}
              ${i.verified ? ", last_verified_at = UTC_TIMESTAMP()" : ""}
        WHERE id = ?`,
      [...vals, userId, ...(cipher !== undefined ? [cipher] : []), i.id],
    );
    if (cipher !== undefined)
      await log(
        i.workspaceId,
        i.projectId,
        i.id,
        userId,
        "secret_update",
        cipher ? null : "dihapus",
      );
    return { id: i.id };
  }
  const id = uuid();
  await execute(
    `INSERT INTO prj_tech_assets (id, workspace_id, project_id, kind, name, environment, url, host, username,
            secret_label, account_owner, notes, secret_cipher, last_verified_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${i.verified ? "UTC_TIMESTAMP()" : "NULL"}, ?, ?)`,
    [id, i.workspaceId, i.projectId, ...vals, cipher ?? null, userId, userId],
  );
  return { id };
}

export async function deleteTechAsset(
  workspaceId: string,
  projectId: string,
  id: string,
  userId: string,
) {
  await access(workspaceId, userId, "writer");
  const r = await executeOne<{ name: string; created_by: string | null }>(
    "SELECT name, created_by FROM prj_tech_assets WHERE id = ? AND workspace_id = ? AND project_id = ?",
    [id, workspaceId, projectId],
  );
  if (!r) return;
  // Aset berisi rahasia hanya boleh dihapus pengelola atau pembuatnya (cegah "hilangkan jejak").
  const a = await xproAccess(workspaceId, userId);
  if (!a.manager && r.created_by !== userId)
    throw new Error("Hanya pengelola workspace atau pembuat aset yang bisa menghapus");
  await execute("DELETE FROM prj_tech_assets WHERE id = ?", [id]);
  await log(workspaceId, projectId, null, userId, "delete", r.name);
}

export async function revealTechSecret(
  workspaceId: string,
  projectId: string,
  id: string,
  userId: string,
) {
  const a = await access(workspaceId, userId, "member");
  const r = await executeOne<{ secret_cipher: string | null; created_by: string | null }>(
    "SELECT secret_cipher, created_by FROM prj_tech_assets WHERE id = ? AND workspace_id = ? AND project_id = ?",
    [id, workspaceId, projectId],
  );
  if (!r?.secret_cipher) throw new Error("Tidak ada rahasia tersimpan");
  if (!a.manager && r.created_by !== userId)
    throw new Error("Hanya pengelola workspace atau pembuat aset yang bisa membuka rahasia");
  const value = decryptSecret(r.secret_cipher);
  await log(workspaceId, projectId, id, userId, "reveal");
  return { value };
}

/* ------------------------------ catatan ------------------------------ */

export async function saveTechNote(
  i: {
    workspaceId: string;
    projectId: string;
    id?: string;
    category: string;
    title: string;
    body: string;
  },
  userId: string,
) {
  await access(i.workspaceId, userId, "writer");
  await projectOf(i.workspaceId, i.projectId);
  if (i.id) {
    const n = await execute(
      `UPDATE prj_tech_notes SET category = ?, title = ?, body = ?, updated_by = ?
        WHERE id = ? AND workspace_id = ? AND project_id = ?`,
      [i.category, i.title.trim(), i.body, userId, i.id, i.workspaceId, i.projectId],
    );
    void n;
    return { id: i.id };
  }
  const id = uuid();
  await execute(
    `INSERT INTO prj_tech_notes (id, workspace_id, project_id, category, title, body, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, i.workspaceId, i.projectId, i.category, i.title.trim(), i.body, userId, userId],
  );
  return { id };
}

export async function deleteTechNote(
  workspaceId: string,
  projectId: string,
  id: string,
  userId: string,
) {
  await access(workspaceId, userId, "writer");
  await execute("DELETE FROM prj_tech_notes WHERE id = ? AND workspace_id = ? AND project_id = ?", [
    id,
    workspaceId,
    projectId,
  ]);
}

/* ------------------------------ paket serah terima ------------------------------ */

const KIND_LABEL: Record<string, string> = {
  repo: "Repositori source code",
  database: "Database",
  server: "Server / hosting",
  url: "URL aplikasi",
  domain: "Domain & DNS",
  service: "Layanan pihak ketiga",
  account: "Akun",
  other: "Lainnya",
};
const NOTE_LABEL: Record<string, string> = {
  setup: "Setup & instalasi",
  architecture: "Arsitektur",
  deploy: "Deploy & operasional",
  handover: "Serah terima",
  log: "Log pekerjaan",
  other: "Lainnya",
};

/** Dokumen Markdown berisi semua aset, catatan, tim & tugas terbuka. Rahasia opsional (pengelola saja). */
export async function exportHandover(
  workspaceId: string,
  projectId: string,
  userId: string,
  includeSecrets: boolean,
) {
  const a = await access(workspaceId, userId, "member");
  if (includeSecrets && !a.manager)
    throw new Error("Hanya pengelola workspace yang bisa mengekspor rahasia");
  const p = await projectOf(workspaceId, projectId);
  const data = await listTechData(workspaceId, projectId, userId);
  const secrets = new Map<string, string>();
  if (includeSecrets) {
    const rows = await execute<{ id: string; secret_cipher: string }>(
      "SELECT id, secret_cipher FROM prj_tech_assets WHERE project_id = ? AND workspace_id = ? AND secret_cipher IS NOT NULL",
      [projectId, workspaceId],
    );
    for (const r of rows) {
      try {
        secrets.set(r.id, decryptSecret(r.secret_cipher));
      } catch {
        secrets.set(r.id, "(tidak bisa dibuka)");
      }
    }
  }
  const team = await execute<{ name: string; role: string | null }>(
    "SELECT name, role FROM prj_members WHERE project_id = ? ORDER BY name",
    [projectId],
  ).catch(() => []);
  const open = await execute<{ name: string; status: string; due_date: string | null }>(
    `SELECT name, status, due_date FROM prj_tasks
      WHERE project_id = ? AND status <> 'done' AND completed_at IS NULL AND COALESCE(backlog, 0) = 0 ORDER BY due_date IS NULL, due_date LIMIT 100`,
    [projectId],
  ).catch(() => []);

  const lines: string[] = [];
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  lines.push(`# Paket Serah Terima — ${p.code} ${p.name}`, "", `Dibuat: ${now} WIB`, "");
  if (includeSecrets)
    lines.push(
      "> **RAHASIA** — dokumen ini berisi password/token. Simpan di tempat aman dan ganti kredensial setelah serah terima.",
      "",
    );
  lines.push("## Aset teknis", "");
  if (!data.assets.length) lines.push("_Belum ada aset._", "");
  for (const kind of ASSET_KINDS) {
    const list = data.assets.filter((x) => x.kind === kind);
    if (!list.length) continue;
    lines.push(`### ${KIND_LABEL[kind]}`, "");
    for (const x of list) {
      lines.push(`- **${x.name}** (${x.environment})`);
      if (x.url) lines.push(`  - URL: ${x.url}`);
      if (x.host) lines.push(`  - Host: ${x.host}`);
      if (x.username) lines.push(`  - Pengguna: ${x.username}`);
      if (x.has_secret)
        lines.push(
          `  - ${x.secret_label || "Rahasia"}: ${includeSecrets ? `\`${secrets.get(x.id) ?? ""}\`` : "_(tersimpan terenkripsi di XPro)_"}`,
        );
      if (x.account_owner) lines.push(`  - Pemilik akun / penagihan: ${x.account_owner}`);
      if (x.last_verified_at) lines.push(`  - Terakhir dicek: ${x.last_verified_at.slice(0, 10)}`);
      if (x.notes) lines.push(...x.notes.split("\n").map((l) => `  > ${l}`));
    }
    lines.push("");
  }
  lines.push("## Dokumentasi", "");
  if (!data.notes.length) lines.push("_Belum ada catatan._", "");
  for (const n of data.notes) {
    lines.push(
      `### ${n.title}`,
      `_${NOTE_LABEL[n.category] ?? n.category} · ${n.author ?? "-"} · ${n.updated_at.slice(0, 10)}_`,
      "",
      n.body || "-",
      "",
    );
  }
  if (team.length) {
    lines.push("## Tim proyek", "");
    for (const m of team) lines.push(`- ${m.name}${m.role ? ` — ${m.role}` : ""}`);
    lines.push("");
  }
  if (open.length) {
    lines.push("## Tugas yang belum selesai", "");
    for (const t of open)
      lines.push(
        `- [ ] ${t.name} (${t.status}${t.due_date ? `, tenggat ${String(t.due_date).slice(0, 10)}` : ""})`,
      );
    lines.push("");
  }
  await log(
    workspaceId,
    projectId,
    null,
    userId,
    "export",
    includeSecrets ? "dengan rahasia" : null,
  );
  const safe = p.code.replace(/[^\w.-]+/g, "_");
  return { fileName: `serah-terima-${safe}.md`, markdown: lines.join("\n") };
}
