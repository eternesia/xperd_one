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
// Ronde 31 (BS New 8/10): jejak audit ditulis di lapisan aplikasi (tanpa trigger).
import { AUDITED_TABLE_SET, auditChangedFields, auditDocRef } from "@/lib/audit.functions";

// Workspace-scoped tables (rows belong to a workspace via workspace_id).
const WORKSPACE_TABLES = new Set([
  "md_categories",
  "md_uoms",
  "md_items",
  "md_customers",
  "md_suppliers",
  "md_warehouses",
  "md_accounts",
  "md_taxes",
  // Ronde 29 (BS New 8): master mata uang & kurs.
  "md_currencies",
  "md_exchange_rates",
  // Ronde 31 (BS New 8/10): jejak audit (hanya ditulis oleh lapisan aplikasi).
  "audit_logs",
  "cb_accounts",
  "cb_transactions",
  "fa_assets",
  "fa_depreciations",
  "tax_records",
  "acc_journal_entries",
  "acc_journal_lines",
  "acc_period_locks",
  "inv_movements",
  "prc_documents",
  "prc_document_lines",
  "sls_documents",
  "sls_document_lines",
  "sls_shipment_scans",
  "workspace_role_access",
  "workspace_members",
  // Qalling CRM (migration 002_crm.sql) — crm_wa_settings stays out of this
  // generic layer: it is secrets-bearing and goes through dedicated server fns.
  "crm_leads",
  "crm_activities",
  "crm_broadcasts",
  "crm_broadcast_recipients",
  "crm_campaigns",
  // CRM insights (migration 005_crm_insights.sql)
  "crm_targets",
  "crm_templates",
  // CRM Tender & Pustaka Dokumen (migration 010_new3_schema.sql, Batch 3 #50–52)
  "crm_tenders",
  "crm_tender_docs",
  "crm_doc_library",
  "crm_doc_library_versions",
  "crm_tender_templates",
  "crm_tender_template_versions",
  // CRM media sosial (migration 010) — `crm_meta_settings` & `crm_social_tokens`
  // sengaja TIDAK di sini: keduanya memuat rahasia dan hanya lewat server fn.
  "crm_social_accounts",
  "crm_scheduled_posts",
  "crm_client_groups",
  "crm_social_comments",
  // Omnix (migration 010, Batch 3 #63): store & order per workspace. Wallet,
  // ledger, dan kunci kanal bersifat per tenant / memuat rahasia → server fn.
  "omnix_stores",
  "omnix_orders",
  // Slipp HR (migration 008_hr_module.sql) — Batch 2.
  // CATATAN: tabel harus terdaftar di DUA tempat: set ini (gate `assertTable`)
  // dan `COLS` di bawah (whitelist kolom). Lewat salah satu = error/gagal simpan.
  "hr_org_units",
  "hr_pay_components",
  "hr_employees",
  "hr_payroll_runs",
  "hr_payslips",
  // XPro (migration 016, Ronde 33) — modul add-on proyek & kontrak dari BS New 10.
  "prj_projects",
  "prj_milestones",
  "prj_budget_lines",
  "prj_billings",
  "prj_members",
  "prj_tasks",
  "prj_expenses",
  "prj_documents",
  "prj_progress_reports",
  // Ronde 36 (migration 017) — kolom Kanban XPro per proyek (BS New 11).
  "prj_board_columns",
  // Ronde 38 (migration 018) — Qalling Ideas & Media Library (BS New 11).
  "crm_idea_columns",
  "crm_ideas",
  "crm_media",
]);

// Per-table column whitelist (used to build SQL identifiers safely).
const COLS: Record<string, string[]> = {
  md_categories: [
    "id",
    "workspace_id",
    "code",
    "name",
    "description",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_uoms: ["id", "workspace_id", "code", "name", "is_active", "created_at", "updated_at"],
  md_items: [
    "id",
    "workspace_id",
    "code",
    "name",
    "item_type",
    "category_code",
    "uom_code",
    "barcode",
    "cost_price",
    "sell_price",
    "min_stock",
    "is_stocked",
    "billing_cycle",
    "expense_account_code",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_customers: [
    "id",
    "workspace_id",
    "code",
    "name",
    "contact_name",
    "email",
    "phone",
    "address",
    "city",
    "tax_id",
    "credit_limit",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_suppliers: [
    "id",
    "workspace_id",
    "code",
    "name",
    "contact_name",
    "email",
    "phone",
    "address",
    "city",
    "tax_id",
    "payment_terms",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_warehouses: [
    "id",
    "workspace_id",
    "code",
    "name",
    "pic_name",
    "city",
    "address",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_accounts: [
    "id",
    "workspace_id",
    "code",
    "name",
    "account_type",
    "parent_code",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_taxes: [
    "id",
    "workspace_id",
    "code",
    "name",
    "tax_type",
    "rate",
    "account_code",
    "description",
    "is_active",
    "created_at",
    "updated_at",
  ],
  // Ronde 29 (BS New 8): mata uang & kurs (rate = mata uang dasar per 1 unit valas).
  md_currencies: [
    "id",
    "workspace_id",
    "code",
    "name",
    "symbol",
    "decimals",
    "is_base",
    "is_active",
    "created_at",
    "updated_at",
  ],
  md_exchange_rates: [
    "id",
    "workspace_id",
    "code",
    "name",
    "currency_code",
    "rate_date",
    "rate_type",
    "rate",
    "source",
    "notes",
    "is_active",
    "created_at",
    "updated_at",
  ],
  // Ronde 31: jejak audit (baca lewat server fn `listAuditLogs`, bukan layer ini).
  audit_logs: [
    "id",
    "workspace_id",
    "table_name",
    "record_id",
    "action",
    "doc_ref",
    "changed_fields",
    "old_data",
    "new_data",
    "actor_id",
    "actor_email",
    "created_at",
  ],
  cb_accounts: [
    "id",
    "workspace_id",
    "code",
    "name",
    "account_kind",
    "gl_account_code",
    "bank_name",
    "account_number",
    "currency",
    "opening_balance",
    "is_active",
    "created_at",
    "updated_at",
  ],
  cb_transactions: [
    "id",
    "workspace_id",
    "trx_no",
    "trx_date",
    "trx_type",
    "account_code",
    "account_name",
    "counterpart_account_code",
    "counterpart_account_name",
    "category_account_code",
    "category_account_name",
    "contact_name",
    "method",
    "reference",
    "memo",
    "attachment_url",
    "amount",
    "is_reconciled",
    "reconciled_at",
    "journal_entry_id",
    "created_by",
    "created_at",
    "updated_at",
  ],
  // #46 (BS New 3): kunci periode akuntansi.
  acc_period_locks: [
    "id",
    "workspace_id",
    "period",
    "lock_type",
    "note",
    "locked_by",
    "created_at",
  ],
  fa_assets: [
    "id",
    "workspace_id",
    "code",
    "name",
    "category",
    "acquisition_date",
    "acquisition_cost",
    "salvage_value",
    "useful_life_months",
    "method",
    "asset_account_code",
    "accum_account_code",
    "expense_account_code",
    "location",
    "status",
    "accumulated_depreciation",
    "disposal_date",
    "disposal_amount",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  fa_depreciations: [
    "id",
    "workspace_id",
    "asset_id",
    "asset_code",
    "asset_name",
    "period_date",
    "amount",
    "book_value_after",
    "journal_entry_id",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  tax_records: [
    "id",
    "workspace_id",
    "tax_no",
    "tax_type",
    "tax_date",
    "period",
    "partner_name",
    "partner_tax_id",
    "doc_number",
    "faktur_number",
    "description",
    "base_amount",
    "rate",
    "tax_amount",
    "status",
    "ref_type",
    "ref_id",
    "journal_entry_id",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  acc_journal_entries: [
    "id",
    "workspace_id",
    "entry_no",
    "entry_date",
    "source_type",
    "source_id",
    "source_doc_number",
    "memo",
    "total_debit",
    "total_credit",
    "is_auto",
    "created_by",
    "created_at",
    "updated_at",
  ],
  acc_journal_lines: [
    "id",
    "workspace_id",
    "entry_id",
    "line_no",
    "account_code",
    "account_name",
    "description",
    "debit",
    "credit",
    "created_at",
    "updated_at",
  ],
  inv_movements: [
    "id",
    "workspace_id",
    "movement_date",
    "movement_type",
    "item_code",
    "item_name",
    "uom_code",
    "warehouse_code",
    "counterpart_warehouse_code",
    "qty",
    "unit_cost",
    "value",
    "ref_type",
    "ref_id",
    "ref_number",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  prc_documents: [
    "id",
    "workspace_id",
    "doc_type",
    "doc_number",
    "doc_date",
    "due_date",
    "supplier_code",
    "supplier_name",
    "warehouse_code",
    "reference",
    "status",
    "currency",
    "exchange_rate",
    "subtotal",
    "discount_amount",
    "tax_amount",
    "withholding_amount",
    "total",
    "notes",
    "source_document_id",
    "source_doc_number",
    "advance_kind",
    "bank_account_code",
    "bank_account_name",
    "created_by",
    "created_at",
    "updated_at",
  ],
  prc_document_lines: [
    "id",
    "workspace_id",
    "document_id",
    "line_no",
    "item_code",
    "description",
    "qty",
    "uom_code",
    "unit_price",
    "discount",
    "tax_rate",
    "tax_code",
    "line_total",
    "source_line_id",
    "qty_fulfilled",
    "created_at",
    "updated_at",
  ],
  sls_documents: [
    "id",
    "workspace_id",
    "doc_type",
    "doc_number",
    "doc_date",
    "due_date",
    "customer_code",
    "customer_name",
    "warehouse_code",
    "reference",
    "status",
    "currency",
    "exchange_rate",
    "subtotal",
    "discount_amount",
    "tax_amount",
    "withholding_amount",
    "total",
    "notes",
    "source_document_id",
    "source_doc_number",
    "advance_kind",
    "bank_account_code",
    "bank_account_name",
    "created_by",
    "created_at",
    "updated_at",
  ],
  sls_document_lines: [
    "id",
    "workspace_id",
    "document_id",
    "line_no",
    "item_code",
    "description",
    "qty",
    "uom_code",
    "unit_price",
    "discount",
    "tax_rate",
    "tax_code",
    "line_total",
    "source_line_id",
    "qty_fulfilled",
    "created_at",
    "updated_at",
  ],
  sls_shipment_scans: [
    "id",
    "workspace_id",
    "scan_date",
    "tracking_no",
    "marketplace",
    "courier",
    "order_no",
    "buyer_name",
    "item_summary",
    "status",
    "document_id",
    "doc_number",
    "notes",
    "scanned_by",
    "shipped_at",
    "created_at",
    "updated_at",
  ],
  // Slipp HR (Batch 2): master organisasi, komponen gaji, karyawan, payroll & slip.
  hr_org_units: [
    "id",
    "workspace_id",
    "kind",
    "code",
    "name",
    "description",
    "is_active",
    "created_at",
    "updated_at",
  ],
  hr_pay_components: [
    "id",
    "workspace_id",
    "code",
    "name",
    "kind",
    "is_fixed",
    "taxable",
    "default_amount",
    "is_active",
    "created_at",
    "updated_at",
  ],
  hr_employees: [
    "id",
    "workspace_id",
    "code",
    "name",
    "nik",
    "npwp",
    "email",
    "phone",
    "department",
    "position",
    "join_date",
    "status",
    "ptkp_status",
    "base_salary",
    "bank_name",
    "bank_account",
    "bpjs_kes",
    "bpjs_tk",
    "components",
    "notes",
    "created_at",
    "updated_at",
  ],
  hr_payroll_runs: [
    "id",
    "workspace_id",
    "run_no",
    "period",
    "pay_date",
    "bank_account_code",
    "employee_count",
    "total_gross",
    "total_pph21",
    "total_bpjs_company",
    "total_deductions",
    "total_net",
    "status",
    "journal_entry_id",
    "approved_at",
    "notes",
    "created_at",
    "updated_at",
  ],
  hr_payslips: [
    "id",
    "run_id",
    "workspace_id",
    "employee_id",
    "employee_code",
    "employee_name",
    "department",
    "position",
    "ptkp_status",
    "npwp",
    "bank_name",
    "bank_account",
    "base_salary",
    "allowances",
    "deductions",
    "bpjs",
    "gross",
    "taxable_gross",
    "ter_category",
    "ter_rate",
    "pph21",
    "bpjs_employee",
    "bpjs_company",
    "other_deductions",
    "net_pay",
    "created_at",
    "updated_at",
  ],
  workspace_role_access: [
    "id",
    "workspace_id",
    "role",
    "module_id",
    "can_view",
    "can_edit",
    "created_at",
    "updated_at",
  ],
  workspace_members: ["id", "workspace_id", "user_id", "role", "created_at", "updated_at"],
  crm_leads: [
    "id",
    "workspace_id",
    "code",
    "name",
    "company_name",
    "email",
    "phone",
    "source",
    "stage",
    "status",
    "estimated_value",
    "probability",
    "currency",
    "owner_user_id",
    "owner_name",
    "customer_code",
    "converted_customer_code",
    "quotation_id",
    "next_follow_up_at",
    "last_activity_at",
    "lost_reason",
    "stage_changed_at",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  crm_activities: [
    "id",
    "workspace_id",
    "lead_id",
    "activity_type",
    "subject",
    "body",
    "due_at",
    "done_at",
    "outcome",
    "owner_user_id",
    "owner_name",
    "created_by",
    "created_at",
    "updated_at",
  ],
  // --- Batch 3 #50–52: tender checklist + pustaka dokumen ---
  crm_tenders: [
    "id",
    "workspace_id",
    "code",
    "title",
    "agency",
    "lead_id",
    "hps_value",
    "deadline_at",
    "status",
    "pic_name",
    "notes",
    "created_at",
    "updated_at",
  ],
  crm_tender_docs: [
    "id",
    "workspace_id",
    "tender_id",
    "category",
    "name",
    "is_mandatory",
    "status",
    "pic_name",
    "expiry_date",
    "file_ref",
    "library_doc_id",
    "file_path",
    "file_name",
    "notes",
    "sort_order",
    "created_at",
  ],
  crm_doc_library: [
    "id",
    "workspace_id",
    "category",
    "name",
    "doc_number",
    "issued_date",
    "expiry_date",
    "file_path",
    "file_name",
    "mime",
    "size",
    "version",
    "notes",
    "created_at",
    "updated_at",
  ],
  crm_doc_library_versions: [
    "id",
    "workspace_id",
    "library_doc_id",
    "version",
    "file_path",
    "file_name",
    "expiry_date",
    "created_at",
  ],
  crm_tender_templates: [
    "id",
    "workspace_id",
    "tender_id",
    "tender_doc_id",
    "category",
    "name",
    "source_pdf_path",
    "source_pdf_name",
    "source_pages",
    "template_path",
    "template_name",
    "mime",
    "size",
    "version",
    "notes",
    "created_at",
    "updated_at",
  ],
  // --- Ronde 33: modul add-on XPro (BS New 10, diporting apa adanya) ---
  prj_projects: [
    "id",
    "workspace_id",
    "code",
    "name",
    "contract_no",
    "customer_code",
    "customer_name",
    "manager",
    "start_date",
    "end_date",
    "contract_value",
    "retention_pct",
    "status",
    "notes",
    "created_at",
    "updated_at",
  ],
  prj_milestones: [
    "id",
    "workspace_id",
    "project_id",
    "name",
    "weight_pct",
    "progress_pct",
    "start_date",
    "due_date",
    "status",
    "pic",
    "created_at",
    "updated_at",
  ],
  prj_budget_lines: [
    "id",
    "workspace_id",
    "project_id",
    "category",
    "description",
    "qty",
    "uom",
    "unit_cost",
    "amount",
    "created_at",
    "updated_at",
  ],
  prj_billings: [
    "id",
    "workspace_id",
    "project_id",
    "milestone_id",
    "progress_report_id",
    "bast_no",
    "bast_date",
    "description",
    "progress_pct",
    "amount",
    "retention_amount",
    "status",
    "ar_document_id",
    "ar_doc_number",
    "created_at",
    "updated_at",
  ],
  prj_members: [
    "id",
    "workspace_id",
    "project_id",
    "name",
    "role",
    "email",
    "phone",
    "created_at",
    "updated_at",
  ],
  prj_tasks: [
    "id",
    "workspace_id",
    "project_id",
    "milestone_id",
    "name",
    "assignee",
    "start_date",
    "due_date",
    "progress_pct",
    "status",
    "created_at",
    "updated_at",
  ],
  prj_expenses: [
    "id",
    "workspace_id",
    "project_id",
    "expense_date",
    "category",
    "description",
    "vendor",
    "amount",
    "reference",
    "created_at",
    "updated_at",
  ],
  prj_documents: [
    "id",
    "workspace_id",
    "project_id",
    "name",
    "category",
    "file_path",
    "file_size",
    "mime_type",
    "created_at",
    "updated_at",
  ],
  prj_board_columns: [
    "id",
    "workspace_id",
    "project_id",
    "key",
    "name",
    "color",
    "is_done",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  crm_idea_columns: ["id", "workspace_id", "name", "position", "created_at", "updated_at"],
  crm_ideas: ["id", "workspace_id", "column_id", "title", "body", "created_at", "updated_at"],
  crm_media: [
    "id",
    "workspace_id",
    "name",
    "file_path",
    "mime_type",
    "size_bytes",
    "folder",
    "created_by",
    "created_at",
    "updated_at",
  ],
  prj_progress_reports: [
    "id",
    "workspace_id",
    "project_id",
    "report_no",
    "report_date",
    "period_label",
    "progress_pct",
    "work_done",
    "issues",
    "next_plan",
    "photos",
    "status",
    "created_at",
    "updated_at",
  ],
  crm_tender_template_versions: [
    "id",
    "workspace_id",
    "template_id",
    "version",
    "template_path",
    "template_name",
    "size",
    "created_at",
  ],
  crm_social_comments: [
    "id",
    "workspace_id",
    "account_id",
    "provider_comment_id",
    "post_id",
    "author_name",
    "body",
    "reply",
    "status",
    "created_at",
    "liked_at",
  ],
  crm_client_groups: ["id", "workspace_id", "name", "color", "created_at", "updated_at"],
  crm_social_accounts: [
    "id",
    "workspace_id",
    "client_group_id",
    "platform",
    "account_name",
    "handle",
    "profile_url",
    "webhook_url",
    "status",
    "external_id",
    "source",
    "created_at",
    "updated_at",
  ],
  crm_scheduled_posts: [
    "id",
    "workspace_id",
    "title",
    "caption",
    "media_url",
    "media_paths",
    "account_ids",
    "scheduled_at",
    "status",
    "last_error",
    "published_at",
    "results",
    "external_id",
    "source",
    "permalinks",
    "created_at",
    "updated_at",
  ],
  omnix_stores: [
    "id",
    "workspace_id",
    "channel",
    "store_name",
    "shop_ref",
    "status",
    "last_sync_at",
    "created_at",
    "updated_at",
  ],
  omnix_orders: [
    "id",
    "workspace_id",
    "store_id",
    "channel",
    "order_no",
    "buyer_name",
    "order_date",
    "status",
    "items",
    "gross_amount",
    "marketplace_fee",
    "net_amount",
    "omnix_fee",
    "fee_charged",
    "courier",
    "tracking_no",
    "packing_status",
    "packed_at",
    "picked_up_at",
    "completed_at",
    "created_at",
    "updated_at",
  ],
  crm_broadcasts: [
    "id",
    "workspace_id",
    "name",
    "channel",
    "message",
    "status",
    "scheduled_at",
    "sent_at",
    "total_recipients",
    "sent_count",
    "failed_count",
    "created_by",
    "created_at",
    "updated_at",
  ],
  crm_broadcast_recipients: [
    "id",
    "broadcast_id",
    "workspace_id",
    "lead_id",
    "name",
    "phone",
    "email",
    "status",
    "error",
    "sent_at",
    "created_at",
    "updated_at",
  ],
  crm_campaigns: [
    "id",
    "workspace_id",
    "name",
    "objective",
    "platforms",
    "content",
    "media_url",
    "budget",
    "start_date",
    "end_date",
    "status",
    "reach",
    "clicks",
    "leads_generated",
    "owner_name",
    "created_by",
    "created_at",
    "updated_at",
  ],
  crm_targets: [
    "id",
    "workspace_id",
    "owner_user_id",
    "owner_name",
    "period_month",
    "target_amount",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  crm_templates: [
    "id",
    "workspace_id",
    "name",
    "channel",
    "body",
    "is_active",
    "created_by",
    "created_at",
    "updated_at",
  ],
};

const SEARCHABLE = new Set([
  "code",
  "name",
  "city",
  "phone",
  "barcode",
  "uom_code",
  "item_code",
  "doc_number",
  "trx_no",
  "tax_no",
  "tracking_no",
  "customer_name",
  "supplier_name",
  "supplier_code",
  "customer_code",
  "reference",
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

/** Tabel Qalling yang kuotanya ditegakkan saat tulis (padanan trigger `enforce_qalling_quota`). */
const QALLING_QUOTA_TABLES = new Set(["crm_social_accounts", "crm_media", "crm_scheduled_posts"]);

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

    // Kolom urut default. `code` hanya ada di sebagian tabel (master data) —
    // tabel seperti `workspace_role_access`, `cb_transactions`, `sls_documents`
    // tidak punya `code`, dan dulu ORDER BY `code` menghasilkan
    // "Unknown column 'code' in 'order clause'" sehingga daftar/panel gagal
    // dimuat (mis. matriks Role Access di halaman Team).
    const allowed = COLS[table];
    const orderBy =
      data.orderBy && allowed.includes(data.orderBy)
        ? `\`${data.orderBy}\``
        : allowed.includes("code")
          ? "`code`"
          : allowed.includes("created_at")
            ? "`created_at`"
            : "`id`";
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
    const idColumn =
      data.idColumn && COLS[table].includes(data.idColumn) ? `\`${data.idColumn}\`` : "`id`";
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

/**
 * Ronde 31 (parity BS New 8/10): tulis satu baris jejak audit. New 8/10 memakai
 * trigger Postgres; repo ini tidak memakai trigger, jadi jejaknya dicatat di
 * lapisan aplikasi pada jalur tulis generik di bawah.
 */
async function logAudit(
  run: (sql: string, params: unknown[]) => Promise<unknown>,
  context: { userId: string; user?: { email?: string | null } | null },
  table: string,
  action: "INSERT" | "UPDATE" | "DELETE",
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  if (!AUDITED_TABLE_SET.has(table)) return;
  const row = after ?? before;
  const workspaceId = String(row?.workspace_id ?? "");
  if (!workspaceId) return;
  const changed = action === "UPDATE" ? auditChangedFields(before, after) : null;
  // UPDATE tanpa perubahan berarti tidak dicatat (sama seperti trigger New 10).
  if (action === "UPDATE" && !changed) return;
  await run(
    `INSERT INTO audit_logs
       (id, workspace_id, table_name, record_id, action, doc_ref, changed_fields, old_data, new_data, actor_id, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      workspaceId,
      table,
      row?.id ?? null,
      action,
      auditDocRef(row),
      changed ? JSON.stringify(changed) : null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      context.userId,
      context.user?.email ?? null,
    ],
  );
}

export const saveWorkspaceRow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as SaveRowInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    if (data.id) {
      const cols = cleanColumns(
        table,
        Object.keys(data.data ?? {}),
        new Set(["id", "workspace_id"]),
      );
      if (!cols.length) throw new Error("No valid columns to update");
      if (QALLING_QUOTA_TABLES.has(table)) {
        const { enforceWorkspaceWriteQuota } = await import("@/lib/qalling-quota.server");
        await enforceWorkspaceWriteQuota(table, data.workspaceId, data.data ?? {}, data.id);
      }
      const before = AUDITED_TABLE_SET.has(table)
        ? ((await executeOne<Record<string, unknown>>(
            `SELECT * FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ?`,
            [data.id, data.workspaceId],
          )) ?? null)
        : null;
      // Postingan sosial yang sudah diproses/diterbitkan/milik Tebar tidak boleh diubah (anti kirim dobel).
      const postGuard =
        table === "crm_scheduled_posts"
          ? " AND `status` IN ('draft','scheduled') AND `source` <> 'tebar' AND `external_id` IS NULL"
          : "";
      const { result: runResult } = await import("@/integrations/mysql/pool");
      const updated = await runResult(
        `UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE \`id\` = ? AND \`workspace_id\` = ?${postGuard}`,
        [...cols.map((c) => data.data[c]), data.id, data.workspaceId],
      );
      if (postGuard && !updated.affectedRows)
        throw new Error("Postingan sudah diproses. Muat ulang; jadwal tidak dapat diubah.");
      if (before) {
        const after: Record<string, unknown> = { ...before };
        for (const c of cols) after[c] = data.data[c];
        await logAudit(execute, context, table, "UPDATE", before, after);
      }
      return { id: data.id };
    }

    const payload: Record<string, unknown> = { id: uuid(), workspace_id: data.workspaceId };
    for (const c of cleanColumns(
      table,
      Object.keys(data.data ?? {}),
      new Set(["id", "workspace_id"]),
    )) {
      payload[c] = data.data[c];
    }
    const cols = Object.keys(payload);
    if (QALLING_QUOTA_TABLES.has(table)) {
      const { enforceWorkspaceWriteQuota } = await import("@/lib/qalling-quota.server");
      await enforceWorkspaceWriteQuota(table, data.workspaceId, payload);
    }
    await execute(
      `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => payload[c]),
    );
    await logAudit(execute, context, table, "INSERT", null, payload);
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
  /** Status yang TIDAK boleh dihapus (mis. penawaran `cancelled`). */
  forbidStatus?: string;
}

export const deleteWorkspaceRow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as DeleteRowInput)
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute, executeOne, result } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const before = AUDITED_TABLE_SET.has(table)
      ? ((await executeOne<Record<string, unknown>>(
          `SELECT * FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ?`,
          [data.id, data.workspaceId],
        )) ?? null)
      : null;
    if (data.forbidStatus) {
      const r = await result(
        `DELETE FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ? AND \`status\` <> ?`,
        [data.id, data.workspaceId, data.forbidStatus],
      );
      if (r.affectedRows === 0)
        throw new Error(`Rows with status ${data.forbidStatus} cannot be deleted.`);
      if (before) await logAudit(execute, context, table, "DELETE", before, null);
      return { ok: true };
    }
    const res = data.requireStatus
      ? await result(
          `DELETE FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ? AND \`status\` = ?`,
          [data.id, data.workspaceId, data.requireStatus],
        )
      : await result(`DELETE FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ?`, [
          data.id,
          data.workspaceId,
        ]);
    if (data.requireStatus && res.affectedRows === 0) {
      throw new Error(`Only rows with status ${data.requireStatus} can be deleted.`);
    }
    if (before && res.affectedRows > 0) {
      await logAudit(execute, context, table, "DELETE", before, null);
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
    const statusClause = excluded.length
      ? ` AND \`status\` NOT IN (${excluded.map(() => "?").join(", ")})`
      : "";

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
      await conn.execute(
        `DELETE FROM \`${table}\` WHERE \`${parentColumn}\` = ? AND \`workspace_id\` = ?`,
        [data.parentId, data.workspaceId],
      );
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
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const table = assertTable(data.table);
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const audited = AUDITED_TABLE_SET.has(table);
    const omit = new Set(["id", "workspace_id"]);
    for (const row of data.rows ?? []) {
      const payload: Record<string, unknown> = {
        id: typeof row.id === "string" && row.id ? row.id : uuid(),
        workspace_id: data.workspaceId,
      };
      for (const c of cleanColumns(table, Object.keys(row), omit)) payload[c] = row[c];
      const cols = Object.keys(payload);
      if (QALLING_QUOTA_TABLES.has(table)) {
        const { enforceWorkspaceWriteQuota } = await import("@/lib/qalling-quota.server");
        const exists = await executeOne(`SELECT 1 AS ok FROM \`${table}\` WHERE id = ?`, [
          payload.id,
        ]);
        await enforceWorkspaceWriteQuota(
          table,
          data.workspaceId,
          payload,
          exists ? String(payload.id) : null,
        );
      }
      const before = audited
        ? ((await executeOne<Record<string, unknown>>(
            `SELECT * FROM \`${table}\` WHERE \`id\` = ? AND \`workspace_id\` = ?`,
            [payload.id, data.workspaceId],
          )) ?? null)
        : null;
      const updates = cols
        .filter((c) => !omit.has(c))
        .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
        .join(", ");
      await execute(
        `INSERT INTO \`${table}\` (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})
         ON DUPLICATE KEY UPDATE ${updates}`,
        cols.map((c) => payload[c]),
      );
      if (audited) {
        const after: Record<string, unknown> = { ...(before ?? {}), ...payload };
        await logAudit(execute, context, table, before ? "UPDATE" : "INSERT", before, after);
      }
    }
    return { ok: true };
  });
