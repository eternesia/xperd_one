// Workspace-scoped data access (MySQL). Replaces direct Supabase client queries
// in browser components. Every function:
//   * whitelists the table name,
//   * whitelists column names against the schema,
//   * scopes reads to workspace members and writes to workspace writers
//     (reproducing the old RLS policies),
//   * parameterizes all values.
// Server-only — all imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

// Workspace-scoped tables (rows belong to a workspace via workspace_id).
const WORKSPACE_TABLES = new Set([
  "md_categories", "md_uoms", "md_items", "md_customers", "md_suppliers",
  "md_warehouses", "md_accounts", "md_taxes",
  "cb_accounts", "cb_transactions", "fa_assets", "fa_depreciations", "tax_records",
  "acc_journal_entries", "acc_journal_lines", "inv_movements",
  "prc_documents", "prc_document_lines", "sls_documents", "sls_document_lines",
  "sls_shipment_scans", "workspace_role_access", "workspace_members",
  // Qalling CRM (migration 002_crm.sql) — crm_wa_settings stays out of this
  // generic layer: it is secrets-bearing and goes through dedicated server fns.
  "crm_leads", "crm_activities", "crm_broadcasts", "crm_broadcast_recipients",
  "crm_campaigns",
  // CRM insights (migration 005_crm_insights.sql)
  "crm_targets", "crm_templates",
]);

// Per-table column whitelist (used to build SQL identifiers safely).
const COLS: Record<string, string[]> = {
  md_categories: ["id", "workspace_id", "code", "name", "description", "is_active", "created_at", "updated_at"],
  md_uoms: ["id", "workspace_id", "code", "name", "is_active", "created_at", "updated_at"],
  md_items: ["id", "workspace_id", "code", "name", "item_type", "category_code", "uom_code", "barcode", "cost_price", "sell_price", "min_stock", "is_active", "created_at", "updated_at"],
  md_customers: ["id", "workspace_id", "code", "name", "contact_name", "email", "phone", "address", "city", "tax_id", "credit_limit", "is_active", "created_at", "updated_at"],
  md_suppliers: ["id", "workspace_id", "code", "name", "contact_name", "email", "phone", "address", "city", "tax_id", "payment_terms", "is_active", "created_at", "updated_at"],
  md_warehouses: ["id", "workspace_id", "code", "name", "pic_name", "city", "address", "is_active", "created_at", "updated_at"],
  md_accounts: ["id", "workspace_id", "code", "name", "account_type", "parent_code", "is_active", "created_at", "updated_at"],
  md_taxes: ["id", "workspace_id", "code", "name", "tax_type", "rate", "account_code", "description", "is_active", "created_at", "updated_at"],
  cb_accounts: ["id", "workspace_id", "code", "name", "account_kind", "gl_account_code", "bank_name", "account_number", "currency", "opening_balance", "is_active", "created_at", "updated_at"],
  cb_transactions: ["id", "workspace_id", "trx_no", "trx_date", "trx_type", "account_code", "account_name", "counterpart_account_code", "counterpart_account_name", "category_account_code", "category_account_name", "contact_name", "method", "reference", "memo", "attachment_url", "amount", "is_reconciled", "reconciled_at", "journal_entry_id", "created_by", "created_at", "updated_at"],
  fa_assets: ["id", "workspace_id", "code", "name", "category", "acquisition_date", "acquisition_cost", "salvage_value", "useful_life_months", "method", "asset_account_code", "accum_account_code", "expense_account_code", "location", "status", "accumulated_depreciation", "disposal_date", "disposal_amount", "notes", "created_by", "created_at", "updated_at"],
  fa_depreciations: ["id", "workspace_id", "asset_id", "asset_code", "asset_name", "period_date", "amount", "book_value_after", "journal_entry_id", "notes", "created_by", "created_at", "updated_at"],
  tax_records: ["id", "workspace_id", "tax_no", "tax_type", "tax_date", "period", "partner_name", "partner_tax_id", "doc_number", "faktur_number", "description", "base_amount", "rate", "tax_amount", "status", "ref_type", "ref_id", "journal_entry_id", "notes", "created_by", "created_at", "updated_at"],
  acc_journal_entries: ["id", "workspace_id", "entry_no", "entry_date", "source_type", "source_id", "source_doc_number", "memo", "total_debit", "total_credit", "is_auto", "created_by", "created_at", "updated_at"],
  acc_journal_lines: ["id", "workspace_id", "entry_id", "line_no", "account_code", "account_name", "description", "debit", "credit", "created_at", "updated_at"],
  inv_movements: ["id", "workspace_id", "movement_date", "movement_type", "item_code", "item_name", "uom_code", "warehouse_code", "counterpart_warehouse_code", "qty", "unit_cost", "value", "ref_type", "ref_id", "ref_number", "notes", "created_by", "created_at", "updated_at"],
  prc_documents: ["id", "workspace_id", "doc_type", "doc_number", "doc_date", "due_date", "supplier_code", "supplier_name", "warehouse_code", "reference", "status", "currency", "subtotal", "discount_amount", "tax_amount", "total", "notes", "source_document_id", "source_doc_number", "bank_account_code", "bank_account_name", "created_by", "created_at", "updated_at"],
  prc_document_lines: ["id", "workspace_id", "document_id", "line_no", "item_code", "description", "qty", "uom_code", "unit_price", "discount", "tax_rate", "line_total", "source_line_id", "qty_fulfilled", "created_at", "updated_at"],
  sls_documents: ["id", "workspace_id", "doc_type", "doc_number", "doc_date", "due_date", "customer_code", "customer_name", "warehouse_code", "reference", "status", "currency", "subtotal", "discount_amount", "tax_amount", "total", "notes", "source_document_id", "source_doc_number", "bank_account_code", "bank_account_name", "created_by", "created_at", "updated_at"],
  sls_document_lines: ["id", "workspace_id", "document_id", "line_no", "item_code", "description", "qty", "uom_code", "unit_price", "discount", "tax_rate", "line_total", "source_line_id", "qty_fulfilled", "created_at", "updated_at"],
  sls_shipment_scans: ["id", "workspace_id", "scan_date", "tracking_no", "marketplace", "courier", "order_no", "buyer_name", "item_summary", "status", "document_id", "doc_number", "notes", "scanned_by", "shipped_at", "created_at", "updated_at"],
  // Slipp HR (Batch 2): master organisasi, komponen gaji, karyawan, payroll & slip.
  hr_org_units: ["id", "workspace_id", "kind", "code", "name", "description", "is_active", "created_at", "updated_at"],
  hr_pay_components: ["id", "workspace_id", "code", "name", "kind", "is_fixed", "taxable", "default_amount", "is_active", "created_at", "updated_at"],
  hr_employees: ["id", "workspace_id", "code", "name", "nik", "npwp", "email", "phone", "department", "position", "join_date", "status", "ptkp_status", "base_salary", "bank_name", "bank_account", "bpjs_kes", "bpjs_tk", "components", "notes", "created_at", "updated_at"],
  hr_payroll_runs: ["id", "workspace_id", "run_no", "period", "pay_date", "bank_account_code", "employee_count", "total_gross", "total_pph21", "total_bpjs_company", "total_deductions", "total_net", "status", "journal_entry_id", "approved_at", "notes", "created_at", "updated_at"],
  hr_payslips: ["id", "run_id", "workspace_id", "employee_id", "employee_code", "employee_name", "department", "position", "ptkp_status", "npwp", "bank_name", "bank_account", "base_salary", "allowances", "deductions", "bpjs", "gross", "taxable_gross", "ter_category", "ter_rate", "pph21", "bpjs_employee", "bpjs_company", "other_deductions", "net_pay", "created_at", "updated_at"],
  workspace_role_access: ["id", "workspace_id", "role", "module_id", "can_view", "can_edit", "created_at", "updated_at"],
  workspace_members: ["id", "workspace_id", "user_id", "role", "created_at", "updated_at"],
  crm_leads: ["id", "workspace_id", "code", "name", "company_name", "email", "phone", "source", "stage", "status", "estimated_value", "probability", "currency", "owner_user_id", "owner_name", "customer_code", "converted_customer_code", "quotation_id", "next_follow_up_at", "last_activity_at", "lost_reason", "stage_changed_at", "notes", "created_by", "created_at", "updated_at"],
  crm_activities: ["id", "workspace_id", "lead_id", "activity_type", "subject", "body", "due_at", "done_at", "outcome", "owner_user_id", "owner_name", "created_by", "created_at", "updated_at"],
  crm_broadcasts: ["id", "workspace_id", "name", "channel", "message", "status", "scheduled_at", "sent_at", "total_recipients", "sent_count", "failed_count", "created_by", "created_at", "updated_at"],
  crm_broadcast_recipients: ["id", "broadcast_id", "workspace_id", "lead_id", "name", "phone", "email", "status", "error", "sent_at", "created_at", "updated_at"],
  crm_campaigns: ["id", "workspace_id", "name", "objective", "platforms", "content", "media_url", "budget", "start_date", "end_date", "status", "reach", "clicks", "leads_generated", "owner_name", "created_by", "created_at", "updated_at"],
  crm_targets: ["id", "workspace_id", "owner_user_id", "owner_name", "period_month", "target_amount", "notes", "created_by", "created_at", "updated_at"],
  crm_templates: ["id", "workspace_id", "name", "channel", "body", "is_active", "created_by", "created_at", "updated_at"],
};

const SEARCHABLE = new Set([
  "code", "name", "city", "phone", "barcode", "uom_code", "item_code",
  "doc_number", "trx_no", "tax_no", "tracking_no", "customer_name", "supplier_name",
  "supplier_code", "customer_code", "reference",
]);

function assertTable(table: string): string {
  if (!WORKSPACE_TABLES.has(table)) throw new Error(`Table "${table}" is not allowed`);
  return table;
}

function cleanColumns(table: string, keys: string[], omit = new Set<string>()): string[] {
  const allowed = COLS[table];
  const out: string[] = [];
  for (const k of keys) {
    if (allowed.includes(k) && !omit.has(k)) out.push(k);
  }
  return out;
}

export interface ListRowsInput {
  table: string;
  workspaceId: string;
  search?: string;
  filters?: Record<string, unknown>; // equality filters (keys validated against the table)
  inFilters?: Record<string, unknown[]>; // IN (...) filters (keys validated against the table)
  ranges?: Record<string, { gte?: string; lte?: string }>; // range filters on DATE/date columns
  orderBy?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export const listWorkspaceRows = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as ListRowsInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const where = ["`workspace_id` = ?"];
    const params: unknown[] = [data.workspaceId];

    for (const [key, value] of Object.entries(data.filters ?? {})) {
      if (COLS[table].includes(key)) {
        where.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }

    for (const [key, values] of Object.entries(data.inFilters ?? {})) {
      if (COLS[table].includes(key) && Array.isArray(values) && values.length) {
        const ph = values.map(() => "?").join(", ");
        where.push(`\`${key}\` IN (${ph})`);
        params.push(...values);
      }
    }

    for (const [key, range] of Object.entries(data.ranges ?? {})) {
      if (!COLS[table].includes(key)) continue;
      if (range.gte) {
        where.push(`\`${key}\` >= ?`);
        params.push(range.gte);
      }
      if (range.lte) {
        where.push(`\`${key}\` <= ?`);
        params.push(range.lte);
      }
    }

    if (data.search?.trim()) {
      const searchable = COLS[table].filter((c) => SEARCHABLE.has(c));
      if (searchable.length) {
        const like = `%${data.search.trim()}%`;
        where.push(`(${searchable.map((c) => `\`${c}\` LIKE ?`).join(" OR ")})`);
        for (let i = 0; i < searchable.length; i++) params.push(like);
      }
    }

    const orderBy = data.orderBy && COLS[table].includes(data.orderBy) ? `\`${data.orderBy}\`` : "`code`";
    const orderDir = data.orderDir === "desc" ? "DESC" : "ASC";
    const limit = Math.min(Math.max(Number(data.limit) || 200, 1), 5000);
    const offset = Math.max(Number(data.offset) || 0, 0);

    const countRow = await executeOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE ${where.join(" AND ")}`,
      params,
    );
    const rows = await execute(
      `SELECT * FROM \`${table}\` WHERE ${where.join(" AND ")} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)],
    );
    return { rows: rows as Record<string, any>[], count: Number(countRow?.c ?? 0) };
  });

export interface ListByIdsInput {
  table: string;
  workspaceId: string;
  ids: string[];
  idColumn?: string; // validated column name, default `id`
}

export const listRowsByIds = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as ListByIdsInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    if (!data.ids?.length) return [];
    const idColumn = data.idColumn && COLS[table].includes(data.idColumn) ? `\`${data.idColumn}\`` : "`id`";
    const ph = data.ids.map(() => "?").join(", ");
    return (await execute(
      `SELECT * FROM \`${table}\` WHERE \`workspace_id\` = ? AND ${idColumn} IN (${ph})`,
      [data.workspaceId, ...data.ids],
    )) as Record<string, any>[];
  });

export interface CountRowsInput {
  table: string;
  workspaceId: string;
  filters?: Record<string, unknown>;
  ranges?: Record<string, { gte?: string; lte?: string }>;
}

export const countWorkspaceRows = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as CountRowsInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const where = ["`workspace_id` = ?"];
    const params: unknown[] = [data.workspaceId];
    for (const [key, value] of Object.entries(data.filters ?? {})) {
      if (COLS[table].includes(key)) {
        where.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }
    for (const [key, range] of Object.entries(data.ranges ?? {})) {
      if (!COLS[table].includes(key)) continue;
      if (range.gte) {
        where.push(`\`${key}\` >= ?`);
        params.push(range.gte);
      }
      if (range.lte) {
        where.push(`\`${key}\` <= ?`);
        params.push(range.lte);
      }
    }
    const row = await executeOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE ${where.join(" AND ")}`,
      params,
    );
    return { count: Number(row?.c ?? 0) };
  });

export interface GetRowInput {
  table: string;
  workspaceId: string;
  id: string;
}
export const getWorkspaceRow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as GetRowInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    return (await executeOne(
      `SELECT * FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ? LIMIT 1`,
      [data.id, data.workspaceId],
    )) as Record<string, any> | null;
  });

export interface SaveRowInput {
  table: string;
  workspaceId: string;
  id?: string;
  data: Record<string, unknown>;
}

export const saveWorkspaceRow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as SaveRowInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    if (data.id) {
      const cols = cleanColumns(table, Object.keys(data.data ?? {}), new Set(["id", "workspace_id"]));
      if (!cols.length) throw new Error("No valid columns to update");
      await execute(
        `UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE \`id\` = ? AND \`workspace_id\` = ?`,
        [...cols.map((c) => data.data[c]), data.id, data.workspaceId],
      );
      return { id: data.id };
    }

    const payload: Record<string, unknown> = { id: uuid(), workspace_id: data.workspaceId };
    for (const c of cleanColumns(table, Object.keys(data.data ?? {}), new Set(["id", "workspace_id"]))) {
      payload[c] = data.data[c];
    }
    const cols = Object.keys(payload);
    await execute(
      `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => payload[c]),
    );
    return { id: payload.id as string };
  });

export interface DeleteRowInput {
  table: string;
  workspaceId: string;
  id: string;
  /**
   * Optional `status` the row must have for the delete to go through. Sales and
   * purchase documents pass "draft" so a confirmed document can never be
   * removed, even if the client-side guard is bypassed.
   */
  requireStatus?: string;
}

export const deleteWorkspaceRow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as DeleteRowInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { result } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const res = data.requireStatus
      ? await result(`DELETE FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ? AND \`status\` = ?`, [
          data.id,
          data.workspaceId,
          data.requireStatus,
        ])
      : await result(`DELETE FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ?`, [
          data.id,
          data.workspaceId,
        ]);
    if (data.requireStatus && res.affectedRows === 0) {
      throw new Error(`Only rows with status ${data.requireStatus} can be deleted.`);
    }
    return { ok: true };
  });

export interface SumBySourceInput {
  table: string;
  workspaceId: string;
  /** Source (parent) documents to total up. Empty list returns []. */
  sourceIds: string[];
  /** Statuses to ignore — drafts/cancelled documents do not settle anything. */
  excludeStatuses?: string[];
}

export interface SourceTotalRow {
  source_document_id: string;
  total: number;
}

/**
 * #7 (BS New): sum the document totals grouped by `source_document_id`, so the
 * UI can tell how much of a source document has already been settled and only
 * offer the ones with a remaining balance. Aggregated in SQL instead of
 * shipping every child row to the client.
 */
export const sumDocumentTotalsBySource = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as SumBySourceInput)
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    const [sourceColumn] = cleanColumns(table, ["source_document_id"]);
    if (!sourceColumn) throw new Error("Unknown source column");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    if (!data.sourceIds?.length) return [] as SourceTotalRow[];

    const placeholders = data.sourceIds.map(() => "?").join(", ");
    const excluded = (data.excludeStatuses ?? ["draft", "cancelled"]).filter(Boolean);
    const statusClause = excluded.length ? ` AND \`status\` NOT IN (${excluded.map(() => "?").join(", ")})` : "";

    const rows = await execute<{ source_document_id: string; total: string | number | null }>(
      `SELECT \`${sourceColumn}\` AS source_document_id, SUM(\`total\`) AS total
         FROM \`${table}\`
        WHERE \`workspace_id\` = ? AND \`${sourceColumn}\` IN (${placeholders})${statusClause}
        GROUP BY \`${sourceColumn}\``,
      [data.workspaceId, ...data.sourceIds, ...excluded],
    );

    return rows.map<SourceTotalRow>((r) => ({
      source_document_id: r.source_document_id,
      total: Number(r.total) || 0,
    }));
  });

export interface ReplaceChildRowsInput {
  table: string;
  workspaceId: string;
  /** Column that links the child rows to their parent (e.g. `document_id`). */
  parentColumn: string;
  parentId: string;
  rows: Record<string, unknown>[];
}

/**
 * Replace all child rows of one parent document in a single transaction
 * (delete + insert), so editing a draft can never leave the document without
 * its lines when something fails halfway.
 */
export const replaceChildRows = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as ReplaceChildRowsInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    const [parentColumn] = cleanColumns(table, [data.parentColumn]);
    if (!parentColumn) throw new Error("Unknown parent column");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const omit = new Set(["id", "workspace_id", parentColumn]);
    await transaction(async (conn) => {
      await conn.execute(`DELETE FROM \`${table}\` WHERE \`${parentColumn}\` = ? AND \`workspace_id\` = ?`, [
        data.parentId,
        data.workspaceId,
      ]);
      for (const row of data.rows ?? []) {
        const payload: Record<string, unknown> = {
          id: typeof row.id === "string" && row.id ? row.id : uuid(),
          workspace_id: data.workspaceId,
          [parentColumn]: data.parentId,
        };
        for (const c of cleanColumns(table, Object.keys(row), omit)) payload[c] = row[c];
        const cols = Object.keys(payload);
        await conn.execute(
          `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
          cols.map((c) => payload[c]) as never[],
        );
      }
    });
    return { ok: true, replaced: (data.rows ?? []).length };
  });

export interface UpsertRowsInput {
  table: string;
  workspaceId: string;
  rows: Record<string, unknown>[];
}

export const upsertWorkspaceRows = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as UpsertRowsInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const omit = new Set(["id", "workspace_id"]);
    for (const row of data.rows ?? []) {
      const payload: Record<string, unknown> = {
        id: typeof row.id === "string" && row.id ? row.id : uuid(),
        workspace_id: data.workspaceId,
      };
      for (const c of cleanColumns(table, Object.keys(row), omit)) payload[c] = row[c];
      const cols = Object.keys(payload);
      const updates = cols.filter((c) => !omit.has(c)).map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
      await execute(
        `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})
         ON DUPLICATE KEY UPDATE ${updates}`,
        cols.map((c) => payload[c]),
      );
    }
    return { ok: true };
  });
