// Qalling CRM — WhatsApp broadcast delivery server functions (MySQL-backed).
// Ported from Business Suite's Supabase crm-broadcast.functions.ts. Calls a
// workspace-configured custom HTTP gateway ({ sender, to, message } POST +
// optional bearer token) per recipient, or "manual" provider = wa.me links only.
// Server-only: all DB imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { normalizeWaNumber, renderBroadcastMessage } from "@/lib/crm";

interface WaGatewayRow {
  provider: string;
  endpoint_url: string | null;
  api_token: string | null;
  sender_number: string | null;
  is_active: number;
  last_checked_at: string | null;
  last_status: string | null;
}

export interface SendBroadcastInput {
  workspaceId: string;
  broadcastId: string;
}

interface RecipientRow {
  id: string;
  name: string | null;
  phone: string | null;
}

/** Push a saved broadcast to the workspace WhatsApp gateway, recipient by recipient. */
export const sendWaBroadcast = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: SendBroadcastInput) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data?.broadcastId) throw new Error("Broadcast is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const settings = await executeOne<WaGatewayRow>(
      `SELECT provider, endpoint_url, api_token, sender_number, is_active, last_checked_at, last_status
         FROM crm_wa_settings
        WHERE workspace_id = ?
        LIMIT 1`,
      [data.workspaceId],
    );
    if (!settings || !Boolean(settings.is_active)) {
      throw new Error("WhatsApp gateway is not active for this workspace");
    }
    if (settings.provider === "manual") {
      throw new Error("Manual provider cannot send automatically. Use the WhatsApp links instead.");
    }
    if (settings.provider === "kirimdev")
      throw new Error(
        "Broadcast lewat Kirimdev memerlukan template yang disetujui Meta dan belum didukung di menu ini. Gunakan tautan WhatsApp, atau kirim invoice lewat panel prospek.",
      );
    if (!settings.endpoint_url) throw new Error("Gateway endpoint URL is not configured");

    const broadcast = await executeOne<{ id: string; message: string; status: string }>(
      `SELECT id, message, status FROM crm_broadcasts WHERE id = ? AND workspace_id = ? LIMIT 1`,
      [data.broadcastId, data.workspaceId],
    );
    if (!broadcast) throw new Error("Broadcast not found");

    const recipients = await execute<RecipientRow>(
      `SELECT id, name, phone FROM crm_broadcast_recipients
        WHERE broadcast_id = ? AND workspace_id = ? AND status != 'sent'`,
      [data.broadcastId, data.workspaceId],
    );

    const rows = recipients ?? [];
    let sent = 0;
    let failed = 0;

    for (const r of rows) {
      const to = r.phone ? normalizeWaNumber(r.phone) : "";
      if (!to) {
        failed += 1;
        await execute(
          "UPDATE crm_broadcast_recipients SET status = 'failed', error = ? WHERE id = ?",
          ["Missing phone number", r.id],
        );
        continue;
      }
      try {
        const res = await fetch(settings.endpoint_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(settings.api_token ? { Authorization: `Bearer ${settings.api_token}` } : {}),
          },
          body: JSON.stringify({
            sender: settings.sender_number ?? undefined,
            to,
            message: renderBroadcastMessage(broadcast.message, r.name ?? ""),
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Gateway responded ${res.status}: ${body.slice(0, 200)}`);
        }
        sent += 1;
        await execute(
          `UPDATE crm_broadcast_recipients SET status = 'sent', error = NULL, sent_at = NOW() WHERE id = ?`,
          [r.id],
        );
      } catch (err) {
        failed += 1;
        await execute(
          "UPDATE crm_broadcast_recipients SET status = 'failed', error = ? WHERE id = ?",
          [err instanceof Error ? err.message : "Unknown error", r.id],
        );
      }
    }

    const [{ c }] = await execute<{ c: number }>(
      `SELECT COUNT(*) AS c FROM crm_broadcast_recipients
        WHERE broadcast_id = ? AND status = 'sent'`,
      [data.broadcastId],
    );

    await execute(
      `UPDATE crm_broadcasts
          SET status = ?, sent_at = NOW(), sent_count = ?, failed_count = ?
        WHERE id = ?`,
      [failed > 0 && sent === 0 ? "failed" : "sent", Number(c) || sent, failed, data.broadcastId],
    );

    return { sent, failed, total: rows.length };
  });

/** Ping the configured gateway endpoint so admins can validate credentials. */
export const testWaGateway = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; testNumber: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data?.testNumber?.trim()) throw new Error("Test number is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const settings = await executeOne<WaGatewayRow>(
      `SELECT provider, endpoint_url, api_token, sender_number, is_active, last_checked_at, last_status
         FROM crm_wa_settings
        WHERE workspace_id = ?
        LIMIT 1`,
      [data.workspaceId],
    );
    if (settings?.provider === "kirimdev") {
      const { loadWaSettings, testKirimdev, recordWaStatus } = await import("@/lib/wa-send.server");
      const full = await loadWaSettings(data.workspaceId);
      let st = "ok";
      let det = "";
      try {
        det = await testKirimdev(full!);
      } catch (err) {
        st = "failed";
        det = err instanceof Error ? err.message : "Unknown error";
      }
      await recordWaStatus(data.workspaceId, `${st}: ${det}`);
      return { status: st, detail: det };
    }
    if (!settings?.endpoint_url) throw new Error("Gateway endpoint URL is not configured");

    let status = "ok";
    let detail = "";
    try {
      const res = await fetch(settings.endpoint_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.api_token ? { Authorization: `Bearer ${settings.api_token}` } : {}),
        },
        body: JSON.stringify({
          sender: settings.sender_number ?? undefined,
          to: normalizeWaNumber(data.testNumber),
          message: "XPERD Qalling gateway test message.",
        }),
      });
      detail = `${res.status} ${(await res.text()).slice(0, 200)}`;
      if (!res.ok) status = "failed";
    } catch (err) {
      status = "failed";
      detail = err instanceof Error ? err.message : "Unknown error";
    }

    await execute(
      `UPDATE crm_wa_settings SET last_checked_at = NOW(), last_status = ? WHERE workspace_id = ?`,
      [`${status}: ${detail}`.slice(0, 500), data.workspaceId],
    );

    return { status, detail };
  });
