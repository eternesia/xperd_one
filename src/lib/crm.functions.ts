// Qalling CRM — bespoke MySQL server functions (ported from Business Suite's
// Supabase crm.functions.ts into the Old Production data layer).
// Only logic that the generic workspace data layer (@/lib/data.functions.ts)
// cannot express lives here:
//   * crm_wa_settings — secrets-bearing, one-per-workspace upsert + owner/admin gate
//   * crm_broadcasts delete — cascades recipients in a transaction
//   * convertLeadToQuotation — cross-table (crm_leads -> md_customers + sls_documents)
// Server-only: all DB imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface WaSettingsRow {
  id: string;
  workspace_id: string;
  provider: string;
  sender_number: string | null;
  endpoint_url: string | null;
  api_token: string | null;
  is_active: boolean;
  notes: string | null;
  last_checked_at: string | null;
  last_status: string | null;
}

function docNumber(prefix: string, seq: number, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${prefix}/${y}${m}/${String(seq).padStart(4, "0")}`;
}

/** Read the workspace's WhatsApp gateway settings (one row per workspace). */
export const getCrmWaSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) throw new Error("Forbidden");

    const row = await executeOne<{
      id: string;
      workspace_id: string;
      provider: string;
      sender_number: string | null;
      endpoint_url: string | null;
      api_token: string | null;
      is_active: number;
      notes: string | null;
      last_checked_at: string | null;
      last_status: string | null;
    }>(
      `SELECT id, workspace_id, provider, sender_number, endpoint_url, api_token,
              is_active, notes, last_checked_at, last_status
         FROM crm_wa_settings
        WHERE workspace_id = ?
        LIMIT 1`,
      [data.workspaceId],
    );
    if (!row) return null;
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      provider: row.provider,
      sender_number: row.sender_number,
      endpoint_url: row.endpoint_url,
      api_token: row.api_token,
      is_active: Boolean(row.is_active),
      notes: row.notes,
      last_checked_at: row.last_checked_at,
      last_status: row.last_status,
    } satisfies WaSettingsRow;
  });

export interface SaveWaSettingsInput {
  workspaceId: string;
  provider: string;
  sender_number?: string | null;
  endpoint_url?: string | null;
  api_token?: string | null;
  is_active: boolean;
  notes?: string | null;
}

/** Upsert the workspace WhatsApp gateway settings (unique on workspace_id). */
export const saveCrmWaSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: SaveWaSettingsInput) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!["manual", "custom"].includes(data.provider)) throw new Error("Invalid provider");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) throw new Error("Forbidden");

    await execute(
      `INSERT INTO crm_wa_settings
         (id, workspace_id, provider, sender_number, endpoint_url, api_token, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         sender_number = VALUES(sender_number),
         endpoint_url = VALUES(endpoint_url),
         api_token = VALUES(api_token),
         is_active = VALUES(is_active),
         notes = VALUES(notes)`,
      [
        uuid(),
        data.workspaceId,
        data.provider,
        data.sender_number?.trim() || null,
        data.endpoint_url?.trim() || null,
        data.api_token?.trim() || null,
        data.is_active ? 1 : 0,
        data.notes?.trim() || null,
      ],
    );
    return { ok: true };
  });

/** Delete a broadcast together with its recipient rows (transaction). */
export const deleteCrmBroadcast = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; broadcastId: string }) => {
    if (!data?.workspaceId || !data?.broadcastId) throw new Error("Broadcast is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    await transaction(async (conn) => {
      await conn.execute("DELETE FROM crm_broadcast_recipients WHERE broadcast_id = ? AND workspace_id = ?", [
        data.broadcastId,
        data.workspaceId,
      ]);
      await conn.execute("DELETE FROM crm_broadcasts WHERE id = ? AND workspace_id = ?", [
        data.broadcastId,
        data.workspaceId,
      ]);
    });
    return { ok: true };
  });

export interface ConvertLeadInput {
  workspaceId: string;
  leadId: string;
}

/** Convert a CRM lead into a customer + draft quotation in the Sales module. */
export const convertLeadToQuotation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: ConvertLeadInput) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data?.leadId) throw new Error("Lead is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { execute, executeOne, transaction, uuid } = await import("@/integrations/mysql/pool");

    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const lead = await executeOne<{
      id: string;
      code: string;
      name: string;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      estimated_value: string | number;
      customer_code: string | null;
      converted_customer_code: string | null;
      quotation_id: string | null;
    }>(
      `SELECT id, code, name, company_name, email, phone, estimated_value,
              customer_code, converted_customer_code, quotation_id
         FROM crm_leads
        WHERE id = ? AND workspace_id = ?
        LIMIT 1`,
      [data.leadId, data.workspaceId],
    );
    if (!lead) throw new Error("Lead not found");
    if (lead.quotation_id) throw new Error("This lead already has a quotation");

    const partyName = lead.company_name?.trim() || lead.name;
    const amount = Number(lead.estimated_value) || 0;

    // Reads are computed before the transaction; the writes below are atomic.
    let customerCode = lead.customer_code || lead.converted_customer_code || null;
    if (!customerCode) {
      const existing = await executeOne<{ code: string }>(
        "SELECT code FROM md_customers WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        [data.workspaceId, partyName],
      );
      customerCode = existing?.code ?? null;
    }

    let createCustomer = false;
    if (!customerCode) {
      const [{ c }] = await execute<{ c: number }>(
        "SELECT COUNT(*) AS c FROM md_customers WHERE workspace_id = ?",
        [data.workspaceId],
      );
      customerCode = `CUST-${String(Number(c) + 1).padStart(4, "0")}`;
      createCustomer = true;
    }

    const [{ q }] = await execute<{ q: number }>(
      "SELECT COUNT(*) AS q FROM sls_documents WHERE workspace_id = ? AND doc_type = 'quotation'",
      [data.workspaceId],
    );
    const number = docNumber("QUO", Number(q) + 1);
    const documentId = uuid();

    await transaction(async (conn) => {
      if (createCustomer && customerCode) {
        await conn.execute(
          `INSERT INTO md_customers (id, workspace_id, code, name, contact_name, email, phone, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [uuid(), data.workspaceId, customerCode, partyName, lead.name, lead.email, lead.phone],
        );
      }
      await conn.execute(
        `INSERT INTO sls_documents
           (id, workspace_id, doc_type, doc_number, doc_date, customer_code, customer_name,
            reference, status, subtotal, discount_amount, tax_amount, total, notes, created_by)
         VALUES (?, ?, 'quotation', ?, CURDATE(), ?, ?, ?, 'draft', ?, 0, 0, ?, ?, ?)`,
        [
          documentId,
          data.workspaceId,
          number,
          customerCode,
          partyName,
          lead.code,
          amount,
          amount,
          `Converted from CRM lead ${lead.code}`,
          context.userId,
        ],
      );

      if (amount > 0) {
        await conn.execute(
          `INSERT INTO sls_document_lines
             (id, workspace_id, document_id, line_no, description, qty, unit_price, discount, tax_rate, line_total)
           VALUES (?, ?, ?, 1, ?, 1, ?, 0, 0, ?)`,
          [uuid(), data.workspaceId, documentId, `Estimated opportunity — ${lead.code}`, amount, amount],
        );
      }

      await conn.execute(
        `UPDATE crm_leads
            SET customer_code = ?, converted_customer_code = ?, quotation_id = ?,
                stage = 'proposal', probability = 70, status = 'open', stage_changed_at = NOW()
          WHERE id = ?`,
        [customerCode, customerCode, documentId, lead.id],
      );
    });

    return { customerCode, documentId, docNumber: number };
  });
