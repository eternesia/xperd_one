// Production (BS New 16) — fondasi server: entitlement, akses per seksi, audit tak-terhapus, penomoran dokumen.
// Padanan fungsi plpgsql `mfg_has_entitlement`, `mfg_can_access`, `mfg_audit_change`, `mfg_allocate_number`.
// Aturan Old: tanpa trigger/fungsi tersimpan → semua guard di sini, dalam `transaction()` dengan `SELECT … FOR UPDATE`.
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";

export const MFG_MODULE = "manufacturing";
export const MFG_ROLE_SECTIONS: Record<string, string[]> = {
  production_supervisor: ["settings", "work-centers", "formulation-codes", "routings", "profiles", "registrations"],
  qa_manager: ["settings", "work-centers", "formulation-codes", "routings", "profiles", "registrations"],
  cost_accountant: ["rates"],
};

export class ProductionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const jsonOf = <T>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};
export const d10 = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
export const jakartaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

/** Add-on `manufacturing` aktif dengan fitur `mfg_basic` atau `legacy`. */
export async function mfgHasEntitlement(workspaceId: string): Promise<boolean> {
  const { workspaceEntitlements } = await import("./entitlements.server");
  const e = (await workspaceEntitlements(workspaceId)).manufacturing;
  return Boolean(e && (e.features.legacy === true || e.features.mfg_basic === true));
}

/** Fitur tambahan add-on (mfg_qc, mfg_trace, …) — `legacy` = semua. */
export async function mfgHasFeature(workspaceId: string, feature: string): Promise<boolean> {
  const { workspaceEntitlements } = await import("./entitlements.server");
  const e = (await workspaceEntitlements(workspaceId)).manufacturing;
  return Boolean(e && (e.features.legacy === true || e.features[feature] === true));
}

async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
  const t = await executeOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.id = ? AND t.owner_id = ?`,
    [workspaceId, userId],
  );
  return Number(t?.c ?? 0) > 0;
}

export async function mfgRoles(workspaceId: string, userId: string): Promise<string[]> {
  const rows = await execute<{ role: string }>(
    "SELECT role FROM mfg_workspace_roles WHERE workspace_id = ? AND user_id = ? AND is_active = 1",
    [workspaceId, userId],
  );
  return rows.map((r) => r.role);
}

/** Dasar akses: entitlement + keanggotaan + matriks Role Access (`manufacturing` dan `manufacturing/<seksi>`). */
export async function mfgCanAccess(
  workspaceId: string,
  userId: string,
  section = "settings",
  write = false,
): Promise<boolean> {
  if (!(await mfgHasEntitlement(workspaceId))) return false;
  const owner = await isOwner(workspaceId, userId);
  const member = await executeOne<{ role: string; custom_role_id: string | null }>(
    "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (owner || member?.role === "owner") return true;
  if (!member) return false;
  let mod: { can_view?: boolean; can_edit?: boolean } = {};
  let sub: { can_view?: boolean; can_edit?: boolean } = {};
  if (member.custom_role_id) {
    const c = await executeOne<{ permissions: unknown }>(
      "SELECT permissions FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?",
      [member.custom_role_id, workspaceId],
    );
    const perms = jsonOf<Record<string, { view?: boolean; edit?: boolean }>>(c?.permissions, {});
    const pick = (k: string) =>
      perms[k] ? { can_view: Boolean(perms[k].view), can_edit: Boolean(perms[k].view && perms[k].edit) } : {};
    mod = pick(MFG_MODULE);
    sub = pick(`${MFG_MODULE}/${section}`);
  } else {
    const rows = await execute<{ module_id: string; can_view: number; can_edit: number }>(
      "SELECT module_id, can_view, can_edit FROM workspace_role_access WHERE workspace_id = ? AND role = ? AND module_id IN (?, ?)",
      [workspaceId, member.role, MFG_MODULE, `${MFG_MODULE}/${section}`],
    );
    for (const r of rows) {
      const v = { can_view: Number(r.can_view) === 1, can_edit: Number(r.can_edit) === 1 };
      if (r.module_id === MFG_MODULE) mod = v;
      else sub = v;
    }
  }
  if (mod.can_view === false || sub.can_view === false) return false;
  if (!write) return true;
  if (member.role === "viewer" || mod.can_edit === false || sub.can_edit === false) return false;
  if (section === "roles") return member.role === "admin";
  if (member.role === "admin") return true;
  const mine = await mfgRoles(workspaceId, userId);
  return mine.some((r) => (MFG_ROLE_SECTIONS[r] ?? []).includes(section));
}

export async function mfgAssert(workspaceId: string, userId: string, section: string, write = false) {
  if (!(await mfgCanAccess(workspaceId, userId, section, write)))
    throw new ProductionError("Akses Production tidak tersedia untuk workspace ini.", 403);
}

/** Peran produksi spesifik (planner/operator/QC/…) — admin & pemilik dianggap memenuhi. */
export async function mfgHasAnyRole(workspaceId: string, userId: string, roles: string[]): Promise<boolean> {
  if (await isOwner(workspaceId, userId)) return true;
  const m = await executeOne<{ role: string }>(
    "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (m?.role === "owner" || m?.role === "admin") return true;
  // Disederhanakan: hak akses Production diatur lewat matriks Role Access (lihat/ubah per menu). Peran produksi khusus
  // (planner/supervisor/QA, dll.) tidak lagi wajib; setiap anggota workspace yang lolos matriks boleh bertindak.
  void roles;
  return Boolean(m);
}

export const reasonOf = (r: unknown): string => {
  const s = String(r ?? "").trim();
  if (!s || s.length > 2000) throw new ProductionError("Alasan perubahan wajib diisi (maks. 2000 karakter).");
  return s;
};

/** Catatan audit append-only (tidak ada jalur UPDATE/DELETE ke tabel ini). */
export async function mfgAudit(
  conn: PoolConnection,
  p: {
    workspaceId: string;
    userId: string | null;
    table: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason: string;
    signed?: "password" | "otp" | null;
  },
) {
  await conn.execute(
    `INSERT INTO mfg_audit_log (id, workspace_id, created_by, entity_table, entity_id, action, old_value, new_value, reason, signed_at, signature_method)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      uuid(),
      p.workspaceId,
      p.userId,
      p.table,
      p.entityId,
      p.action,
      p.oldValue === undefined || p.oldValue === null ? null : JSON.stringify(p.oldValue),
      p.newValue === undefined || p.newValue === null ? null : JSON.stringify(p.newValue),
      p.reason || "Controlled administration",
      p.signed ? new Date() : null,
      p.signed ?? null,
    ],
  );
}

export const NUMBERING_DEFAULT = {
  order: { prefix: "MO", reset: "yearly", digits: 5 },
  lot: { prefix: "LOT", reset: "daily", digits: 2 },
  inspection: { prefix: "QI", reset: "yearly", digits: 5 },
  deviation: { prefix: "DEV", reset: "yearly", digits: 4 },
} as const;

/**
 * Nomor dokumen internal transaksional & idempoten (kunci idempotensi dan sumber dokumen sama → nomor sama).
 * Memakai baris `mfg_settings` + penghitung dengan `FOR UPDATE` di dalam transaksi pemanggil.
 */
export async function mfgAllocateNumber(
  conn: PoolConnection,
  workspaceId: string,
  kind: "order" | "lot" | "inspection" | "deviation",
  sourceId: string,
  key: string,
  itemCode?: string | null,
): Promise<string> {
  const [sets] = await conn.execute<any[]>(
    "SELECT numbering FROM mfg_settings WHERE workspace_id = ? FOR UPDATE",
    [workspaceId],
  );
  const conf = jsonOf<Record<string, { prefix: string; reset: string; digits: number }>>(sets[0]?.numbering, {})[kind];
  if (!conf) throw new ProductionError("Penomoran Production belum dikonfigurasi.");
  const [prev] = await conn.execute<any[]>(
    "SELECT document_kind, source_id, document_number FROM mfg_number_allocations WHERE workspace_id = ? AND (idempotency_key = ? OR (document_kind = ? AND source_id = ?)) LIMIT 1",
    [workspaceId, key, kind, sourceId],
  );
  if (prev[0]) {
    if (prev[0].document_kind !== kind || prev[0].source_id !== sourceId)
      throw new ProductionError("Konflik kunci idempotensi.");
    return String(prev[0].document_number);
  }
  const [ws] = await conn.execute<any[]>("SELECT timezone FROM workspaces WHERE id = ?", [workspaceId]);
  const tz = ws[0]?.timezone || "Asia/Jakarta";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const [y, m, d] = today.split("-");
  const period =
    conf.reset === "yearly" ? y : conf.reset === "monthly" ? `${y}${m}` : conf.reset === "daily" ? `${y.slice(2)}${m}${d}` : "ALL";
  await conn.execute(
    `INSERT INTO mfg_number_counters (id, workspace_id, document_kind, period_key, counter_value) VALUES (?,?,?,?,1)
     ON DUPLICATE KEY UPDATE counter_value = counter_value + 1`,
    [uuid(), workspaceId, kind, period],
  );
  const [ctr] = await conn.execute<any[]>(
    "SELECT counter_value FROM mfg_number_counters WHERE workspace_id = ? AND document_kind = ? AND period_key = ?",
    [workspaceId, kind, period],
  );
  const seq = Number(ctr[0].counter_value);
  if (String(seq).length > Number(conf.digits)) throw new ProductionError("Rentang nomor habis.");
  if (kind === "lot" && !(itemCode && /^[A-Za-z0-9_-]{1,64}$/.test(itemCode)))
    throw new ProductionError("Kode item wajib untuk nomor lot.");
  const doc = `${conf.prefix}${period === "ALL" ? "" : `-${period}`}${kind === "lot" ? `-${itemCode}` : ""}-${String(seq).padStart(Number(conf.digits), "0")}`;
  await conn.execute(
    "INSERT INTO mfg_number_allocations (id, workspace_id, document_kind, source_id, idempotency_key, document_number) VALUES (?,?,?,?,?,?)",
    [uuid(), workspaceId, kind, sourceId, key, doc],
  );
  return doc;
}

/** Pastikan baris `mfg_settings` ada (penomoran bawaan) — dipanggil sebelum alokasi nomor / pembacaan pengaturan. */
export async function mfgEnsureSettings(conn: PoolConnection, workspaceId: string, userId: string | null) {
  await conn.execute(
    "INSERT IGNORE INTO mfg_settings (id, workspace_id, numbering, created_by) VALUES (?,?,?,?)",
    [uuid(), workspaceId, JSON.stringify(NUMBERING_DEFAULT), userId],
  );
}
