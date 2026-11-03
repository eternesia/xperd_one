// Kelola sambungan Integrasi AI (MCP) milik pengguna: token pribadi dan akses OAuth aplikasi AI.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export type { McpConnection } from "@/lib/mcp/auth.server";

export const listMcpConnections = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { listConnections } = await import("@/lib/mcp/auth.server");
    return listConnections(context.userId);
  });

/** Nilai token hanya dikembalikan sekali di sini; yang tersimpan hanya hash-nya. */
export const createMcpToken = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { name: string }) => {
    const name = String(d?.name ?? "").trim();
    if (!name) throw new Error("Beri nama token (mis. Claude Code).");
    return { name: name.slice(0, 100) };
  })
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const { workspaceHasFeature } = await import("@/lib/entitlements.server");
    const ws = await execute<{ workspace_id: string }>(
      "SELECT workspace_id FROM workspace_members WHERE user_id = ?",
      [context.userId],
    );
    let allowed = false;
    for (const w of ws) if (await workspaceHasFeature(w.workspace_id, "mcp_api")) allowed = true;
    if (!allowed) throw new Error("Paket Anda tidak menyertakan Integrasi AI.");
    const { count } = (
      await execute<{ count: number }>(
        "SELECT COUNT(*) AS count FROM mcp_tokens WHERE user_id = ? AND kind = 'pat' AND revoked_at IS NULL",
        [context.userId],
      )
    )[0] ?? { count: 0 };
    if (Number(count) >= 20) throw new Error("Maksimal 20 token aktif. Cabut yang tidak dipakai.");
    const { createPersonalToken } = await import("@/lib/mcp/auth.server");
    return createPersonalToken(context.userId, data.name);
  });

export const revokeMcpConnection = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { kind: "pat" | "oauth"; id: string }) => {
    if (!d || !["pat", "oauth"].includes(d.kind) || !/^[0-9a-f-]{36}$/i.test(String(d.id)))
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { revokeConnection } = await import("@/lib/mcp/auth.server");
    if (!(await revokeConnection(context.userId, data.kind, data.id)))
      throw new Error("Sambungan tidak ditemukan.");
    return { ok: true };
  });
