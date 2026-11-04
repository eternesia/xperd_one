// Production e-sign: kode sekali pakai yang dikirim ke email akun, terikat pelaku + entitas + aksi.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";

// Seksi & peran yang boleh meminta tanda tangan per tabel (pelaku harus bisa melakukan aksinya).
const SIGN_POLICY: Record<string, { section: string; roles: string[] }> = {
  mfg_lots: { section: "quality", roles: ["qa_manager"] },
  mfg_deviations: { section: "quality", roles: ["qa_manager"] },
  mfg_orders: { section: "orders", roles: ["production_planner", "production_supervisor", "qa_manager"] },
  mfg_batch_steps: { section: "execution", roles: ["operator", "production_supervisor", "qa_manager"] },
};
const target = z.object({
  workspaceId: zId,
  entityTable: z.enum(["mfg_lots", "mfg_orders", "mfg_batch_steps", "mfg_deviations"]),
  entityId: zId,
  action: z.string().regex(/^[a-z_]{1,60}$/),
});

export const sendProductionSignCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(target)
  .handler(async ({ data, context }) => {
    const { mfgActionAllowed } = await import("@/lib/production-lots.server");
    const { ProductionError } = await import("@/lib/production.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const pol = SIGN_POLICY[data.entityTable];
    if (!(await mfgActionAllowed(data.workspaceId, context.userId, pol.section, pol.roles)))
      throw new ProductionError("Akses tanda tangan dibatasi.", 403);
    const email = (context.user as { email?: string }).email;
    if (!email) throw new ProductionError("Email akun belum tersedia.");
    const recent = await executeOne(
      "SELECT id FROM mfg_esign_challenges WHERE actor = ? AND created_at >= ? LIMIT 1",
      [context.userId, new Date(Date.now() - 60_000)],
    );
    if (recent) throw new ProductionError("Tunggu satu menit sebelum mengirim ulang kode.");
    const { loadGateway, sendViaGateway, PLATFORM_SCOPE } = await import("@/lib/email-gateway.server");
    const g = await loadGateway(PLATFORM_SCOPE);
    if (!g) throw new ProductionError("Email tanda tangan belum dikonfigurasi di Super Admin.");
    const { randomInt } = await import("node:crypto");
    const { esignHash } = await import("@/lib/production-esign.server");
    const id = uuid();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await execute(
      `INSERT INTO mfg_esign_challenges (id, workspace_id, entity_table, entity_id, action, actor, code_hash, expires_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, data.workspaceId, data.entityTable, data.entityId, data.action, context.userId, esignHash(id, code), new Date(Date.now() + 300_000)],
    );
    try {
      await sendViaGateway(g, {
        to: email,
        subject: "Tanda tangan elektronik Production — XPERD",
        html: `<p>Kode tanda tangan Anda: <strong>${code}</strong>. Berlaku 5 menit.</p>`,
        text: `Kode tanda tangan: ${code}. Berlaku 5 menit.`,
      });
    } catch (e) {
      // kode yang tak terkirim tidak boleh tersisa sebagai tantangan aktif
      await execute("DELETE FROM mfg_esign_challenges WHERE id = ?", [id]);
      throw e;
    }
    return { id };
  });

export const verifyProductionSignCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, challengeId: zId, code: z.string().regex(/^\d{6}$/) }))
  .handler(async ({ data, context }) => {
    const { transaction } = await import("@/integrations/mysql/pool");
    const { verifyEsign, esignHash } = await import("@/lib/production-esign.server");
    const { ProductionError } = await import("@/lib/production.server");
    const ok = await transaction((conn) => verifyEsign(conn, data.workspaceId, context.userId, data.challengeId, esignHash(data.challengeId, data.code)));
    if (!ok) throw new ProductionError("Kode salah, kedaluwarsa, atau sudah dipakai.");
    return { id: data.challengeId };
  });
