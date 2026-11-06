/**
 * Inti konversi percakapan DM → lead CRM (tanpa autentikasi). Dipakai server fn UI dan tool MCP;
 * pemanggil WAJIB sudah memeriksa fitur `crm` dan hak tulis workspace.
 */
import { nextLeadCode } from "./crm";

export async function convertConversationToLeadCore(
  userId: string,
  data: { workspaceId: string; conversationId: string; phone?: string; notes?: string },
) {
  const { transaction, uuid } = await import("@/integrations/mysql/pool");

  return transaction(async (conn) => {
    const [crows] = await conn.execute(
      `SELECT c.id, c.participant_name, c.last_message, c.lead_id, a.platform, a.account_name
         FROM crm_conversations c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? AND c.id = ? FOR UPDATE`,
      [data.workspaceId, data.conversationId],
    );
    const conv = (
      crows as {
        id: string;
        participant_name: string | null;
        last_message: string | null;
        lead_id: string | null;
        platform: string | null;
        account_name: string | null;
      }[]
    )[0];
    if (!conv) throw new Error("Percakapan tidak ditemukan.");
    if (conv.lead_id) return { leadId: conv.lead_id, existing: true };

    // Kunci baris workspace agar kode lead berikutnya tidak bentrok (padanan select-lalu-insert New 12).
    await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [data.workspaceId]);
    const [codes] = await conn.execute("SELECT code FROM crm_leads WHERE workspace_id = ?", [
      data.workspaceId,
    ]);
    const leadId = uuid();
    await conn.execute(
      `INSERT INTO crm_leads (id, workspace_id, code, name, phone, source, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        data.workspaceId,
        nextLeadCode((codes as { code: string }[]).map((c) => c.code)),
        conv.participant_name || "Prospek DM",
        data.phone || null,
        `DM ${conv.platform ?? "sosial"}${conv.account_name ? ` · ${conv.account_name}` : ""}`.slice(
          0,
          60,
        ),
        data.notes || (conv.last_message ? `Pesan terakhir: ${conv.last_message}` : null),
        userId,
      ],
    );
    await conn.execute(
      "UPDATE crm_conversations SET lead_id = ? WHERE id = ? AND lead_id IS NULL",
      [leadId, conv.id],
    );
    return { leadId, existing: false };
  });
}
