import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface EmailGatewayInput {
  workspaceId: string | null; // null = gateway platform (Super Admin) untuk OTP pendaftaran
  enabled: boolean;
  provider: "smtp" | "resend" | "brevo" | "sendgrid";
  from_name: string;
  from_email: string;
  reply_to: string;
  smtp_host: string;
  smtp_port: number | null;
  smtp_user: string;
  smtp_secure: string;
  secret?: string; // kosong/undefined = pertahankan yang lama
  events: Record<string, boolean>;
}

async function authorize(userId: string, workspaceId: string | null) {
  const { hasRole, hasWorkspaceRole, canWriteWorkspace } =
    await import("@/lib/auth-context.server");
  if (!workspaceId) {
    if (!(await hasRole(userId, "admin"))) throw new Error("Hanya Super Admin");
    return "platform";
  }
  if (!(await hasWorkspaceRole(workspaceId, userId, ["owner", "admin"]))) {
    if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Hanya Owner/Admin");
  }
  return `ws:${workspaceId}`;
}

export const getEmailGateway = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const scope = await authorize(context.userId, data.workspaceId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const r = await executeOne<Record<string, unknown>>(
      "SELECT * FROM email_gateway_settings WHERE scope_key = ?",
      [scope],
    );
    if (!r) return null;
    const { secret, events, enabled, ...rest } = r;
    const iso = (v: unknown) =>
      v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null;
    return {
      ...rest,
      enabled: Boolean(enabled),
      events: (typeof events === "string" ? JSON.parse(events) : (events ?? {})) as Record<
        string,
        boolean
      >,
      last_test_at: iso(r.last_test_at),
      updated_at: iso(r.updated_at),
      has_secret: !!secret,
    } as unknown as EmailGatewayInput & {
      has_secret: boolean;
      last_test_status: string;
      last_test_at: string;
    };
  });

export const saveEmailGateway = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: EmailGatewayInput) => {
    if (d.from_email && !/^\S+@\S+\.\S+$/.test(d.from_email))
      throw new Error("Email pengirim tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const scope = await authorize(context.userId, data.workspaceId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const cols = [
      data.workspaceId,
      data.enabled ? 1 : 0,
      data.provider,
      data.from_name || null,
      data.from_email || null,
      data.reply_to || null,
      data.smtp_host || null,
      data.smtp_port || null,
      data.smtp_user || null,
      data.smtp_secure || "tls",
      JSON.stringify(data.events ?? {}),
    ];
    await execute(
      `INSERT INTO email_gateway_settings (id, scope_key, workspace_id, enabled, provider, from_name, from_email, reply_to,
         smtp_host, smtp_port, smtp_user, smtp_secure, events, secret)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE workspace_id = VALUES(workspace_id), enabled = VALUES(enabled), provider = VALUES(provider),
         from_name = VALUES(from_name), from_email = VALUES(from_email), reply_to = VALUES(reply_to),
         smtp_host = VALUES(smtp_host), smtp_port = VALUES(smtp_port), smtp_user = VALUES(smtp_user),
         smtp_secure = VALUES(smtp_secure), events = VALUES(events),
         secret = COALESCE(VALUES(secret), secret)`,
      [uuid(), scope, ...cols, data.secret || null],
    );
    return { ok: true };
  });

export const testEmailGateway = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string | null; to: string }) => {
    if (!/^\S+@\S+\.\S+$/.test(d.to)) throw new Error("Email tujuan tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const scope = await authorize(context.userId, data.workspaceId);
    const { execute } = await import("@/integrations/mysql/pool");
    const { loadGateway, sendViaGateway } = await import("@/lib/email-gateway.server");
    const g = await loadGateway(scope);
    if (!g) throw new Error("Simpan pengaturan terlebih dahulu");
    let status = "ok";
    try {
      await sendViaGateway(g, {
        to: data.to,
        subject: "Tes email gateway XPERD One",
        text: "Email gateway Anda berhasil terhubung.",
        html: "<p style='font-family:Arial'>Email gateway Anda berhasil terhubung.</p>",
      });
    } catch (e) {
      status = (e as Error).message;
    }
    await execute(
      "UPDATE email_gateway_settings SET last_test_at = NOW(6), last_test_status = ? WHERE scope_key = ?",
      [status, scope],
    );
    if (status !== "ok") throw new Error(status);
    return { ok: true };
  });
