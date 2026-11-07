/**
 * Ronde 31 (parity BS New 8/10): **Audit Trail**.
 *
 * New 8/10 menulis jejak audit lewat *trigger* Postgres (`audit_row_change()`);
 * repo ini tidak memakai trigger, jadi jejaknya ditulis di lapisan aplikasi —
 * lihat pemanggilan `logAuditChange()` di `data.functions.ts` (jalur tulis
 * generik: simpan, hapus, upsert massal).
 *
 * Halaman Audit Trail hanya bisa dibaca owner/admin (sama dengan policy
 * "workspace owners/admins read audit logs" di New 8/10).
 */
import { createServerFn } from "@tanstack/react-start";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Tabel yang diaudit — sama dengan daftar di layar Audit Trail BS New 10. */
export const AUDITED_TABLES = [
  "sls_documents",
  "prc_documents",
  "acc_journal_entries",
  "cb_transactions",
  "cb_accounts",
  "acc_period_locks",
  "inv_movements",
  "fa_assets",
  "md_items",
  "md_customers",
  "md_suppliers",
  "md_accounts",
  "md_taxes",
  "md_currencies",
  "md_exchange_rates",
  "hr_payroll_runs",
  "workspace_members",
  "workspace_role_access",
  "crm_scheduled_posts",
  "crm_leads",
  "crm_post_approvals",
  "crm_report_links",
  "crm_invoices",
  "crm_client_groups",
] as const;

export const AUDITED_TABLE_SET = new Set<string>(AUDITED_TABLES);

/**
 * Nilai kolom JSON pada server fn wajib serializable (tanStack menolak
 * `Record<string, unknown>`), jadi dipakai bentuk konkret berikut.
 */
export type AuditJson = Record<string, string | number | boolean | null>;

export interface AuditLogRow {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  doc_ref: string | null;
  changed_fields: string[] | null;
  old_data: AuditJson | null;
  new_data: AuditJson | null;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface AuditLogQuery {
  workspaceId: string;
  table?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Kolom `doc_ref` yang dicari berurutan, mengikuti trigger New 8/10. */
const REF_COLUMNS = [
  "doc_number",
  "entry_no",
  "entry_number",
  "code",
  "number",
  "name",
  "trx_no",
  "title",
];

export function auditDocRef(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  for (const key of REF_COLUMNS) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).slice(0, 255);
  }
  return null;
}

/** Kolom yang nilainya berbeda (abaikan `updated_at`, sama seperti trigger New 10). */
export function auditChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  if (!before || !after) return null;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === "updated_at") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changed.push(key);
  }
  return changed.length ? changed : null;
}

/** Daftar jejak audit satu workspace (owner/admin saja). */
export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as AuditLogQuery)
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) {
      throw new Error("Hanya owner/admin yang bisa melihat Audit Trail.");
    }
    const { execute, executeOne } = await import("@/integrations/mysql/pool");

    const where = ["`workspace_id` = ?"];
    const params: unknown[] = [data.workspaceId];
    if (data.table) {
      where.push("`table_name` = ?");
      params.push(data.table);
    }
    if (data.action) {
      where.push("`action` = ?");
      params.push(data.action);
    }
    if (data.search?.trim()) {
      where.push("(`doc_ref` LIKE ? OR `actor_email` LIKE ?)");
      const like = `%${data.search.trim()}%`;
      params.push(like, like);
    }
    if (data.from) {
      where.push("`created_at` >= ?");
      params.push(`${data.from} 00:00:00`);
    }
    if (data.to) {
      where.push("`created_at` <= ?");
      params.push(`${data.to} 23:59:59`);
    }
    const whereSql = where.join(" AND ");
    const pageSize = Math.min(Math.max(Number(data.pageSize) || 25, 1), 200);
    const page = Math.max(Number(data.page) || 0, 0);

    const countRow = await executeOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE ${whereSql}`,
      params,
    );
    const rows = await execute<AuditLogRow>(
      `SELECT id, table_name, record_id, action, doc_ref, changed_fields, old_data, new_data,
              actor_id, actor_email, created_at
         FROM audit_logs WHERE ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize} OFFSET ${page * pageSize}`,
      params,
    );

    return {
      rows: rows.map((r) => ({
        ...r,
        changed_fields:
          typeof r.changed_fields === "string"
            ? (JSON.parse(r.changed_fields as unknown as string) as string[])
            : r.changed_fields,
        old_data:
          typeof r.old_data === "string"
            ? (JSON.parse(r.old_data as unknown as string) as AuditJson)
            : r.old_data,
        new_data:
          typeof r.new_data === "string"
            ? (JSON.parse(r.new_data as unknown as string) as AuditJson)
            : r.new_data,
        created_at: String(r.created_at),
      })),
      count: Number(countRow?.c ?? 0),
    };
  });
