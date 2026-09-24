/**
 * ============================================================================
 * BOILERPLATE PENGINGAT JATUH TEMPO (#22) — OPSIONAL, TIDAK WAJIB.
 * ============================================================================
 * Memilih dokumen yang sudah lewat jatuh tempo / follow-up CRM yang telat, lalu
 * mengirim pengingat lewat adapter WhatsApp (`src/lib/whatsapp.server.ts`).
 *
 * Semua bersifat *read-only*: tidak ada tabel atau kolom baru, tidak ada
 * migrasi, dan tidak ada scheduler in-process. Pemicu yang disediakan:
 *
 *   POST /api/cron/reminders   (header `x-cron-secret`)
 *
 * Dipanggil dari cron eksternal. Contoh crontab harian jam 08:00:
 *
 *   0 8 * * * curl -fsS -X POST https://<host>/api/cron/reminders \
 *     -H "x-cron-secret: $CRON_SECRET" >/dev/null
 *
 * CATATAN / TODO (semuanya opsional):
 *   - Dedupe pengiriman belum ada (belum ada kolom `last_reminded_at`). Bila
 *     perlu, tambahkan lewat migration baru, lalu isi di sini.
 *   - Saat ini pengingat hanya dicatat di hasil respons + log. Integrasi WA
 *     hanya aktif bila env `WA_ENABLED` diisi.
 * ============================================================================
 */

import { sendWhatsAppMessage, whatsappConfigured } from "@/lib/whatsapp.server";

export interface ReminderStats {
  arInvoices: number;
  crmFollowUps: number;
  whatsappConfigured: boolean;
  sent: number;
  skipped: number;
  failures: number;
}

interface ArRow {
  doc_number: string | null;
  customer_name: string | null;
  due_date: string | null;
  total: string | number | null;
}

interface LeadRow {
  code: string | null;
  name: string | null;
  phone: string | null;
  next_follow_up_at: string | null;
}

function idr(value: unknown) {
  const n = Number(value) || 0;
  return `Rp${n.toLocaleString("id-ID")}`;
}

export async function runDueReminders(limit = 50): Promise<ReminderStats> {
  const { execute } = await import("@/integrations/mysql/pool");
  const configured = whatsappConfigured();
  const stats: ReminderStats = {
    arInvoices: 0,
    crmFollowUps: 0,
    whatsappConfigured: configured,
    sent: 0,
    skipped: 0,
    failures: 0,
  };

  const invoices = await execute<ArRow>(
    `SELECT doc_number, customer_name, due_date, total
       FROM sls_documents
      WHERE doc_type = 'ar_invoice'
        AND status IN ('invoiced', 'partial')
        AND due_date IS NOT NULL
        AND due_date <= CURDATE()
      ORDER BY due_date ASC
      LIMIT ${Number(limit) || 50}`,
  );
  stats.arInvoices = invoices.length;

  const leads = await execute<LeadRow>(
    `SELECT code, name, phone, next_follow_up_at
       FROM crm_leads
      WHERE next_follow_up_at IS NOT NULL
        AND next_follow_up_at <= NOW()
        AND status <> 'lost'
      ORDER BY next_follow_up_at ASC
      LIMIT ${Number(limit) || 50}`,
  );
  stats.crmFollowUps = leads.length;

  // Nomor tujuan pengingat belum ditentukan (owner/penagih per workspace).
  // TODO(opsional): ambil dari `profiles.phone` / konfigurasi workspace.
  const recipients = (process.env.WA_REMINDER_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const row of invoices) {
    const text = `Pengingat: faktur ${row.doc_number ?? "-"} (${row.customer_name ?? "-"}) jatuh tempo ${row.due_date ?? "-"} senilai ${idr(row.total)}.`;
    for (const to of recipients) {
      const res = await sendWhatsAppMessage(to, text);
      if (res.sent) stats.sent += 1;
      else if (res.skipped) stats.skipped += 1;
      else stats.failures += 1;
    }
    console.info(`[reminders] AR ${row.doc_number ?? "-"} jatuh tempo ${row.due_date ?? "-"}`);
  }

  for (const lead of leads) {
    const text = `Pengingat CRM: follow-up lead ${lead.code ?? "-"} (${lead.name ?? "-"}) dijadwalkan ${lead.next_follow_up_at ?? "-"}.`;
    for (const to of recipients) {
      const res = await sendWhatsAppMessage(to, text);
      if (res.sent) stats.sent += 1;
      else if (res.skipped) stats.skipped += 1;
      else stats.failures += 1;
    }
    console.info(`[reminders] CRM ${lead.code ?? "-"} follow-up ${lead.next_follow_up_at ?? "-"}`);
  }

  return stats;
}
