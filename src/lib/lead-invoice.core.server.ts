/** Invoice ringan dari prospek: dibuat di Qalling, dibagikan lewat link publik/PDF/WhatsApp. */
import { randomBytes, randomUUID } from "node:crypto";
import { execute, executeOne } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { jakartaToday } from "./billing-wallet.server";

export type InvoiceItem = { description: string; qty: number; price: number };
export type InvoiceInput = {
  leadId: string;
  dueDate?: string | null;
  taxRate?: number;
  notes?: string | null;
  items: InvoiceItem[];
  customerName?: string;
  customerCompany?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
};
type Actor = { id: string; email?: string | null };

const money = (n: number) => Math.round(n * 100) / 100;
const asItems = (v: unknown): InvoiceItem[] => {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x)
      ? x.map((i) => ({
          description: String(i.description ?? ""),
          qty: Number(i.qty ?? 0),
          price: Number(i.price ?? 0),
        }))
      : [];
  } catch {
    return [];
  }
};

async function audit(
  ws: string,
  id: string,
  action: "INSERT" | "UPDATE",
  ref: string,
  data: object,
  a: Actor,
) {
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, table_name, record_id, action, doc_ref, new_data, actor_id, actor_email)
     VALUES (?, ?, 'crm_invoices', ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), ws, id, action, ref.slice(0, 255), JSON.stringify(data), a.id, a.email ?? null],
  );
}

async function nextNumber(ws: string) {
  const ym = jakartaToday().slice(0, 7).replace("-", "");
  const row = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM crm_invoices WHERE workspace_id = ? AND invoice_number LIKE ?",
    [ws, `INV-${ym}-%`],
  );
  return `INV-${ym}-${String(Number(row?.c ?? 0) + 1).padStart(4, "0")}`;
}

export async function createInvoiceCore(ws: string, v: InvoiceInput, actor: Actor) {
  const lead = await executeOne<{
    name: string;
    company_name: string | null;
    phone: string | null;
    email: string | null;
  }>("SELECT name, company_name, phone, email FROM crm_leads WHERE id = ? AND workspace_id = ?", [
    v.leadId,
    ws,
  ]);
  if (!lead) throw new Error("Prospek tidak ditemukan.");
  const items = v.items
    .map((i) => ({
      description: i.description.trim().slice(0, 300),
      qty: Math.max(0, Number(i.qty) || 0),
      price: Math.max(0, Number(i.price) || 0),
    }))
    .filter((i) => i.description && i.qty > 0);
  if (!items.length) throw new Error("Tambahkan minimal satu item dengan jumlah lebih dari 0.");
  const subtotal = money(items.reduce((s, i) => s + i.qty * i.price, 0));
  const taxRate = Math.min(Math.max(Number(v.taxRate) || 0, 0), 100);
  const tax = money((subtotal * taxRate) / 100);
  const id = randomUUID();
  const token = randomBytes(24).toString("hex");
  const issue = jakartaToday();
  const due = v.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(v.dueDate) ? v.dueDate : null;
  // Nomor bisa bentrok bila dua invoice dibuat bersamaan: ulangi beberapa kali.
  let number = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    number = await nextNumber(ws);
    try {
      await execute(
        `INSERT INTO crm_invoices (id, workspace_id, lead_id, token, invoice_number, issue_date, due_date, customer_name, customer_company,
           customer_phone, customer_email, items, subtotal, tax_rate, tax_amount, total, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ws,
          v.leadId,
          token,
          number,
          issue,
          due,
          (v.customerName || lead.name).slice(0, 255),
          (v.customerCompany ?? lead.company_name)?.slice(0, 255) || null,
          (v.customerPhone ?? lead.phone)?.slice(0, 50) || null,
          (v.customerEmail ?? lead.email)?.slice(0, 255) || null,
          JSON.stringify(items),
          subtotal,
          taxRate,
          tax,
          money(subtotal + tax),
          v.notes?.slice(0, 2000) || null,
          actor.id,
        ],
      );
      break;
    } catch (e) {
      if (attempt === 4 || !/Duplicate/i.test(String((e as Error).message))) throw e;
    }
  }
  await audit(ws, id, "INSERT", number, { total: money(subtotal + tax), leadId: v.leadId }, actor);
  return { id, token, invoiceNumber: number };
}

export async function listInvoicesCore(ws: string, leadId?: string) {
  const rows = await execute<{
    id: string;
    lead_id: string | null;
    token: string;
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    customer_name: string;
    customer_phone: string | null;
    total: number;
    status: string;
    paid_at: string | null;
    sent_at: string | null;
  }>(
    `SELECT id, lead_id, token, invoice_number, DATE_FORMAT(issue_date,'%Y-%m-%d') AS issue_date,
            DATE_FORMAT(due_date,'%Y-%m-%d') AS due_date, customer_name, customer_phone, total, status, paid_at, sent_at
       FROM crm_invoices WHERE workspace_id = ? ${leadId ? "AND lead_id = ?" : ""} ORDER BY created_at DESC LIMIT 200`,
    leadId ? [ws, leadId] : [ws],
  );
  const today = jakartaToday();
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    token: r.token,
    number: r.invoice_number,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    customer: r.customer_name,
    phone: r.customer_phone,
    total: Number(r.total),
    status: r.status,
    overdue: r.status === "unpaid" && !!r.due_date && r.due_date < today,
    paidAt: r.paid_at,
    sentAt: r.sent_at,
  }));
}

export async function setInvoiceStatusCore(
  ws: string,
  id: string,
  status: "unpaid" | "paid" | "cancelled",
  actor: Actor,
) {
  const inv = await executeOne<{ invoice_number: string }>(
    "SELECT invoice_number FROM crm_invoices WHERE id = ? AND workspace_id = ?",
    [id, ws],
  );
  if (!inv) throw new Error("Invoice tidak ditemukan.");
  await execute(
    "UPDATE crm_invoices SET status = ?, paid_at = ? WHERE id = ? AND workspace_id = ?",
    [status, status === "paid" ? sqlDateTime(new Date()) : null, id, ws],
  );
  await audit(ws, id, "UPDATE", inv.invoice_number, { status }, actor);
}

export async function markInvoiceSentCore(ws: string, id: string) {
  await execute("UPDATE crm_invoices SET sent_at = ? WHERE id = ? AND workspace_id = ?", [
    sqlDateTime(new Date()),
    id,
    ws,
  ]);
}

export async function getPublicInvoice(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const i = await executeOne<{
    workspace_id: string;
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    customer_name: string;
    customer_company: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    items: unknown;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    notes: string | null;
    status: string;
    paid_at: string | null;
  }>(
    `SELECT workspace_id, invoice_number, DATE_FORMAT(issue_date,'%Y-%m-%d') AS issue_date,
            DATE_FORMAT(due_date,'%Y-%m-%d') AS due_date, customer_name, customer_company, customer_phone,
            customer_email, items, subtotal, tax_rate, tax_amount, total, notes, status, paid_at
       FROM crm_invoices WHERE token = ?`,
    [token],
  );
  if (!i) return null;
  const w = await executeOne<{
    name: string;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    bank_info: string | null;
    doc_footer_note: string | null;
    logo_url: string | null;
  }>(
    "SELECT name, legal_name, address, phone, email, bank_info, doc_footer_note, logo_url FROM workspaces WHERE id = ?",
    [i.workspace_id],
  );
  return {
    number: i.invoice_number,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    status: i.status,
    paidAt: i.paid_at,
    customer: {
      name: i.customer_name,
      company: i.customer_company,
      phone: i.customer_phone,
      email: i.customer_email,
    },
    items: asItems(i.items),
    subtotal: Number(i.subtotal),
    taxRate: Number(i.tax_rate),
    taxAmount: Number(i.tax_amount),
    total: Number(i.total),
    notes: i.notes,
    seller: {
      name: w?.legal_name || w?.name || "",
      address: w?.address ?? null,
      phone: w?.phone ?? null,
      email: w?.email ?? null,
      bank: w?.bank_info ?? null,
      footer: w?.doc_footer_note ?? null,
      logoUrl: w?.logo_url ?? null,
    },
  };
}

/** Kirim invoice ke pelanggan lewat WhatsApp resmi (template Kirimdev): {{1}} nama, {{2}} nomor invoice, {{3}} total, {{4}} link. */
export async function sendInvoiceWaCore(ws: string, id: string, link: string, actor: Actor) {
  const { loadWaSettings, sendWaTemplate } = await import("./wa-send.server");
  const s = await loadWaSettings(ws);
  if (!s || !s.is_active || s.provider !== "kirimdev")
    throw new Error("WhatsApp Kirimdev belum aktif. Atur di Penjualan → WA Gateway.");
  if (!s.invoice_template)
    throw new Error("Nama template invoice belum diisi di pengaturan WA Gateway.");
  const inv = await executeOne<{
    invoice_number: string;
    customer_name: string;
    customer_phone: string | null;
    total: number;
    status: string;
  }>(
    "SELECT invoice_number, customer_name, customer_phone, total, status FROM crm_invoices WHERE id = ? AND workspace_id = ?",
    [id, ws],
  );
  if (!inv) throw new Error("Invoice tidak ditemukan.");
  if (inv.status === "cancelled") throw new Error("Invoice sudah dibatalkan.");
  if (!inv.customer_phone) throw new Error("Nomor WhatsApp pelanggan belum diisi pada prospek.");
  const total = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(inv.total));
  const messageId = await sendWaTemplate(
    s,
    inv.customer_phone,
    s.invoice_template,
    s.template_lang,
    [inv.customer_name, inv.invoice_number, total, link],
  );
  await execute("UPDATE crm_invoices SET sent_at = ? WHERE id = ? AND workspace_id = ?", [
    sqlDateTime(new Date()),
    id,
    ws,
  ]);
  await audit(ws, id, "UPDATE", inv.invoice_number, { sentVia: "whatsapp", messageId }, actor);
  return { ok: true, messageId };
}
