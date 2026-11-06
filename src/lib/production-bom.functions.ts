// Production M3: BOM/formulasi berversi. Padanan RPC mfg_save_bom / mfg_transition_bom / mfg_bom_composition_issues /
// mfg_verify_approval_code dan guard trigger (versi approved terkunci, pemisahan penyusun/penyetuju) — semua di kode server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";
import { saveBomSchema, bomCompositionIssues } from "@/lib/production-bom";

const ws = z.object({ workspaceId: zId });
const EDIT_ROLES = ["production_planner", "production_supervisor", "qa_manager"];
const bool = (v: unknown) => Number(v) === 1;
const sha = async (s: string) => (await import("node:crypto")).createHash("sha256").update(s).digest("hex");

/** Hitung masalah komposisi untuk satu versi (dipakai tampilan & persetujuan). */
async function compositionIssues(conn: any, workspaceId: string, versionId: string): Promise<string[]> {
  const { d10, jakartaToday, jsonOf, ProductionError } = await import("@/lib/production.server");
  const q = async (sql: string, p: unknown[]) => (await conn.execute(sql, p as any[]))[0] as any[];
  const [v] = await q(
    `SELECT bv.*, b.item_id AS bom_item_id, b.formulation_code AS bom_fc FROM mfg_bom_versions bv JOIN mfg_boms b ON b.id = bv.bom_id
      WHERE bv.workspace_id = ? AND bv.id = ?`,
    [workspaceId, versionId],
  );
  if (!v) throw new ProductionError("Versi tidak tersedia.");
  const [set] = await q("SELECT bom_ai_tolerance_pct FROM mfg_settings WHERE workspace_id = ?", [workspaceId]);
  const [prof] = await q(
    "SELECT 1 FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND item_class = 'finished_good'",
    [workspaceId, v.bom_item_id],
  );
  const [reg] = v.registration_id
    ? await q("SELECT * FROM mfg_product_registrations WHERE workspace_id = ? AND id = ?", [workspaceId, v.registration_id])
    : [null];
  const lines = await q(
    "SELECT item_id, line_type, basis, uom, qty_per_base FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ?",
    [workspaceId, versionId],
  );
  const aiItems = await q(
    "SELECT item_id FROM mfg_item_profiles WHERE workspace_id = ? AND item_class = 'active_ingredient'",
    [workspaceId],
  );
  return bomCompositionIssues({
    base_uom: v.base_uom,
    base_batch_qty: Number(v.base_batch_qty),
    effective_from: d10(v.effective_from),
    registration_id: v.registration_id,
    bomItemId: v.bom_item_id,
    bomFormulationCode: v.bom_fc,
    today: jakartaToday(),
    tolerance: Number(set?.bom_ai_tolerance_pct ?? 0),
    // Skincare tanpa registrasi produk tidak dihambat; gerbang aktif bila workspace sudah memakai registrasi.
    requiresRegistration:
      Boolean(prof) && (await q("SELECT 1 AS x FROM mfg_product_registrations WHERE workspace_id = ? LIMIT 1", [workspaceId])).length > 0,
    registration: reg
      ? {
          item_id: reg.item_id,
          formulation_code: reg.formulation_code,
          is_active: bool(reg.is_active),
          status: reg.status,
          valid_from: d10(reg.valid_from),
          valid_until: d10(reg.valid_until),
          ai_declared: jsonOf<any[]>(reg.ai_declared, []).map((a) => ({ ...a, content: Number(a.content) })),
        }
      : null,
    lines: lines.map((l) => ({ ...l, qty_per_base: Number(l.qty_per_base) })),
    activeIngredientItemIds: new Set(aiItems.map((a) => a.item_id as string)),
  });
}

export const getProductionBoms = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ page: z.number().int().min(0) }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, d10 } = await import("@/lib/production.server");
    const { mfgActionAllowed } = await import("@/lib/production-access.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "boms", false);
    const w = data.workspaceId;
    const boms = await execute<any>(
      `SELECT * FROM mfg_boms WHERE workspace_id = ? ORDER BY created_at DESC, id LIMIT 25 OFFSET ${Math.trunc(data.page) * 25}`,
      [w],
    );
    const total = Number((await executeOne<any>("SELECT COUNT(*) AS n FROM mfg_boms WHERE workspace_id = ?", [w]))?.n ?? 0);
    const ids = boms.map((b) => b.id);
    const versions = ids.length
      ? await execute<any>(
          `SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND bom_id IN (${ids.map(() => "?").join(",")}) ORDER BY version_no DESC`,
          [w, ...ids],
        )
      : [];
    const [items, units, regs, codes, canWrite, canApprove] = await Promise.all([
      execute<any>("SELECT id, code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 1000", [w]),
      execute<any>("SELECT code FROM md_uoms WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at, code", [w]),
      execute<any>("SELECT id, item_id, registration_no FROM mfg_product_registrations WHERE workspace_id = ? AND is_active = 1", [w]),
      execute<any>("SELECT code FROM mfg_formulation_codes WHERE workspace_id = ? AND is_active = 1", [w]),
      mfgActionAllowed(w, context.userId, "boms", EDIT_ROLES),
      mfgActionAllowed(w, context.userId, "boms", ["qa_manager"]),
    ]);
    return {
      boms: boms.map((b) => ({
        ...b,
        target_content: b.target_content === null ? null : Number(b.target_content),
        created_at: new Date(b.created_at).toISOString(),
      })),
      total,
      versions: versions.map((v) => ({
        ...v,
        base_batch_qty: Number(v.base_batch_qty),
        std_yield_pct: Number(v.std_yield_pct),
        effective_from: d10(v.effective_from),
        effective_to: v.effective_to ? d10(v.effective_to) : null,
        approved_at: v.approved_at ? new Date(v.approved_at).toISOString() : null,
        created_at: new Date(v.created_at).toISOString(),
        updated_at: new Date(v.updated_at).toISOString(),
      })),
      items: items as { id: string; code: string; name: string }[],
      units: units as { code: string }[],
      registrations: regs as { id: string; item_id: string; registration_no: string }[],
      codes: codes as { code: string }[],
      canWrite,
      canApprove,
      userId: context.userId,
    };
  });

export const getBomLines = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ versionId: zId }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, ProductionError } = await import("@/lib/production.server");
    const { execute, transaction } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "boms", false);
    const lines = await execute<any>(
      "SELECT * FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ? ORDER BY sequence",
      [data.workspaceId, data.versionId],
    );
    const issues = await transaction(async (conn) => {
      try {
        return await compositionIssues(conn, data.workspaceId, data.versionId);
      } catch (e) {
        if (e instanceof ProductionError) throw new ProductionError("Versi tidak tersedia.", 403);
        throw e;
      }
    });
    return {
      lines: lines.map((l) => ({
        ...l,
        qty_per_base: Number(l.qty_per_base),
        ai_target_pct: l.ai_target_pct === null ? null : Number(l.ai_target_pct),
        tolerance_pct: Number(l.tolerance_pct),
        potency_compensate: bool(l.potency_compensate),
        is_critical: bool(l.is_critical),
        created_at: undefined,
      })),
      issues,
    };
  });

export const saveProductionBom = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(saveBomSchema)
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-access.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await mfgActionAssert(w, context.userId, "boms", EDIT_ROLES);
    const v = data.values;
    return transaction(async (conn) => {
      const one = async (sql: string, p: unknown[]) => (await conn.execute<any[]>(sql, p as any[]))[0][0];
      if (!(await one("SELECT code FROM md_uoms WHERE workspace_id = ? AND code = ? AND is_active = 1", [w, v.base_uom])))
        throw new ProductionError("Satuan batch tidak valid.");
      for (const l of data.lines) {
        if (
          !(await one("SELECT id FROM md_items WHERE workspace_id = ? AND id = ? AND is_active = 1", [w, l.item_id])) ||
          !(await one("SELECT code FROM md_uoms WHERE workspace_id = ? AND code = ? AND is_active = 1", [w, l.uom]))
        )
          throw new ProductionError("Bahan atau satuan tidak valid.");
      }
      if (new Set(data.lines.map((l) => l.item_id)).size !== data.lines.length)
        throw new ProductionError("Bahan yang sama tidak boleh muncul dua kali dalam satu versi.");
      let bomId: string | null = data.bomId;
      let versionId: string;
      let before: any = null;
      if (data.versionId) {
        const ver = await one("SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND id = ? FOR UPDATE", [w, data.versionId]);
        if (!ver || ver.status !== "draft") throw new ProductionError("Versi draft tidak tersedia.");
        bomId = ver.bom_id;
        versionId = ver.id;
        before = ver;
      } else {
        if (!bomId) {
          if (!(await one("SELECT id FROM md_items WHERE workspace_id = ? AND id = ? AND is_active = 1", [w, v.item_id])))
            throw new ProductionError("Produk tidak valid.");
          if (v.formulation_code && !(await one("SELECT id FROM mfg_formulation_codes WHERE workspace_id = ? AND code = ?", [w, v.formulation_code])))
            throw new ProductionError("Kode formulasi tidak dikenal.");
          bomId = uuid();
          try {
            await conn.execute(
              "INSERT INTO mfg_boms (id, workspace_id, item_id, code, formulation_code, target_content, target_unit, created_by) VALUES (?,?,?,?,?,?,?,?)",
              [bomId, w, v.item_id, v.code, v.formulation_code, v.target_content, v.target_unit, context.userId],
            );
          } catch (e: any) {
            if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Kode BOM sudah dipakai.");
            throw e;
          }
          await mfgAudit(conn, { workspaceId: w, userId: context.userId, table: "mfg_boms", entityId: bomId, action: "INSERT", newValue: { code: v.code, item_id: v.item_id }, reason: data.reason });
        }
        if (!(await one("SELECT id FROM mfg_boms WHERE workspace_id = ? AND id = ? FOR UPDATE", [w, bomId])))
          throw new ProductionError("BOM tidak tersedia.", 403);
        versionId = uuid();
      }
      const bom = await one("SELECT item_id FROM mfg_boms WHERE id = ?", [bomId]);
      if (v.registration_id && !(await one("SELECT id FROM mfg_product_registrations WHERE id = ? AND workspace_id = ? AND item_id = ?", [v.registration_id, w, bom.item_id])))
        throw new ProductionError("Registrasi tidak sesuai produk.");
      if (before) {
        await conn.execute(
          `UPDATE mfg_bom_versions SET base_batch_qty=?, base_uom=?, std_yield_pct=?, effective_from=?, effective_to=?, registration_id=?,
             dosage_form=?, source_document=?, change_reason=?, last_modified_by=? WHERE id = ? AND workspace_id = ?`,
          [v.base_batch_qty, v.base_uom, v.std_yield_pct, v.effective_from, v.effective_to || null, v.registration_id, v.dosage_form || null, v.source_document || null, data.reason, context.userId, versionId, w],
        );
        await conn.execute("DELETE FROM mfg_bom_lines WHERE bom_version_id = ? AND workspace_id = ?", [versionId, w]);
      } else {
        const m = await one("SELECT COALESCE(MAX(version_no),0) + 1 AS n FROM mfg_bom_versions WHERE workspace_id = ? AND bom_id = ?", [w, bomId]);
        await conn.execute(
          `INSERT INTO mfg_bom_versions (id, workspace_id, bom_id, version_no, base_batch_qty, base_uom, std_yield_pct, effective_from, effective_to,
             registration_id, dosage_form, source_document, change_reason, created_by, last_modified_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [versionId, w, bomId, Number(m.n), v.base_batch_qty, v.base_uom, v.std_yield_pct, v.effective_from, v.effective_to || null, v.registration_id, v.dosage_form || null, v.source_document || null, data.reason, context.userId, context.userId],
        );
      }
      for (const [i, l] of data.lines.entries()) {
        await conn.execute(
          `INSERT INTO mfg_bom_lines (id, workspace_id, bom_version_id, item_id, line_type, phase, qty_per_base, uom, basis, ai_target_pct, potency_compensate,
             tolerance_pct, is_critical, sequence, add_step_note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), w, versionId, l.item_id, l.line_type, l.phase || "", l.qty_per_base, l.uom, l.basis, l.ai_target_pct, l.potency_compensate ? 1 : 0, l.tolerance_pct, l.is_critical ? 1 : 0, i + 1, l.add_step_note || null, context.userId],
        );
      }
      await mfgAudit(conn, {
        workspaceId: w,
        userId: context.userId,
        table: "mfg_bom_versions",
        entityId: versionId,
        action: before ? "UPDATE" : "INSERT",
        oldValue: before,
        newValue: { ...v, lines: data.lines },
        reason: data.reason,
      });
      return { id: versionId };
    });
  });

export const transitionProductionBom = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      versionId: zId,
      status: z.enum(["draft", "in_review", "approved"]),
      key: zId,
      reason: z.string().trim().min(1).max(2000),
      signature: zId.nullable(),
      override: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAudit, mfgRoles, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-access.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await mfgActionAssert(w, context.userId, "boms", data.status === "approved" ? ["qa_manager"] : EDIT_ROLES);
    return transaction(async (conn) => {
      const one = async (sql: string, p: unknown[]) => (await conn.execute<any[]>(sql, p as any[]))[0][0];
      const ver = await one("SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND id = ? FOR UPDATE", [w, data.versionId]);
      if (!ver) throw new ProductionError("Versi tidak tersedia.", 403);
      const prev = await one("SELECT * FROM mfg_bom_transitions WHERE workspace_id = ? AND idempotency_key = ?", [w, data.key]);
      if (prev) {
        if (prev.version_id !== data.versionId || prev.to_status !== data.status || prev.created_by !== context.userId)
          throw new ProductionError("Konflik pengulangan permintaan.");
        return { id: data.versionId };
      }
      const ok = (ver.status === "draft" && data.status === "in_review") || (ver.status === "in_review" && ["draft", "approved"].includes(data.status));
      if (!ok) throw new ProductionError("Transisi BOM tidak valid.");
      let issues: string[] = [];
      if (data.status === "approved") {
        if (ver.created_by === context.userId || ver.last_modified_by === context.userId)
          throw new ProductionError("Persetujuan ditolak: pembuat/penyunting tidak dapat menyetujui BOM sendiri.");
        const cnt = await one("SELECT COUNT(*) AS n FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ?", [w, data.versionId]);
        if (Number(cnt.n) === 0) throw new ProductionError("BOM kosong.");
        issues = await compositionIssues(conn, w, data.versionId);
        if (issues.length && !data.override) throw new ProductionError(`Komposisi tidak sesuai: ${issues.join("; ")}`);
        if (data.override && !(await mfgRoles(w, context.userId)).includes("qa_manager"))
          throw new ProductionError("Pengecualian memerlukan peran QA manager eksplisit.", 403);
        const [r] = await conn.execute<any>(
          `UPDATE mfg_approval_challenges SET consumed_at = NOW(6) WHERE id = ? AND workspace_id = ? AND version_id = ? AND actor = ?
              AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > NOW(6)`,
          [data.signature ?? "", w, data.versionId, context.userId],
        );
        if (!r.affectedRows) throw new ProductionError("Verifikasi ulang baru diperlukan.", 403);
      }
      await conn.execute(
        "INSERT INTO mfg_bom_transitions (id, workspace_id, version_id, from_status, to_status, idempotency_key, reason, created_by) VALUES (?,?,?,?,?,?,?,?)",
        [uuid(), w, data.versionId, ver.status, data.status, data.key, data.reason, context.userId],
      );
      await conn.execute(
        "UPDATE mfg_bom_versions SET status = ?, approved_by = ?, approved_at = ? WHERE id = ? AND workspace_id = ?",
        [data.status, data.status === "approved" ? context.userId : null, data.status === "approved" ? new Date() : null, data.versionId, w],
      );
      await mfgAudit(conn, {
        workspaceId: w,
        userId: context.userId,
        table: "mfg_bom_versions",
        entityId: data.versionId,
        action: data.status === "approved" ? (data.override ? "APPROVE_OVERRIDE" : "APPROVE") : "UPDATE",
        oldValue: { status: ver.status },
        newValue: data.status === "approved" ? { status: "approved", composition_issues: issues } : { status: data.status },
        reason: data.reason,
        signed: data.status === "approved" ? "otp" : null,
      });
      return { id: data.versionId };
    });
  });

export const sendBomApprovalCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ versionId: zId }))
  .handler(async ({ data, context }) => {
    const { ProductionError } = await import("@/lib/production.server");
    const { mfgActionAllowed } = await import("@/lib/production-access.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    const v = await executeOne<any>("SELECT created_by, last_modified_by, status FROM mfg_bom_versions WHERE workspace_id = ? AND id = ?", [w, data.versionId]);
    if (
      !(await mfgActionAllowed(w, context.userId, "boms", ["qa_manager"])) ||
      !v ||
      v.created_by === context.userId ||
      v.last_modified_by === context.userId ||
      v.status !== "in_review"
    )
      throw new ProductionError("Pembuat tidak dapat menyetujui versinya sendiri.", 403);
    const email = context.user.email;
    if (!email) throw new ProductionError("Email akun belum tersedia.");
    const recent = await execute<any>(
      "SELECT id FROM mfg_approval_challenges WHERE actor = ? AND created_at >= (NOW(6) - INTERVAL 60 SECOND) LIMIT 1",
      [context.userId],
    );
    if (recent.length) throw new ProductionError("Tunggu satu menit sebelum mengirim ulang kode.");
    const { loadGateway, sendViaGateway, PLATFORM_SCOPE } = await import("@/lib/email-gateway.server");
    const demo = process.env.MFG_ESIGN_DEMO === "1";
    const g = demo ? null : await loadGateway(PLATFORM_SCOPE);
    if (!g && !demo) throw new ProductionError("Email persetujuan belum dikonfigurasi.");
    const id = uuid();
    const code = String((await import("node:crypto")).randomInt(0, 1_000_000)).padStart(6, "0");
    await execute(
      "INSERT INTO mfg_approval_challenges (id, workspace_id, version_id, actor, code_hash, expires_at) VALUES (?,?,?,?,?, NOW(6) + INTERVAL 300 SECOND)",
      [id, w, data.versionId, context.userId, await sha(`${id}:${code}`)],
    );
    if (demo || !g) return { id, demoCode: code as string | null };
    await sendViaGateway(g, {
      to: email,
      subject: "Persetujuan BOM — XPERD",
      html: `<p>Kode persetujuan BOM Anda: <strong>${code}</strong>. Berlaku 5 menit.</p>`,
      text: `Kode persetujuan BOM: ${code}. Berlaku 5 menit.`,
    });
    return { id, demoCode: null as string | null };
  });

export const verifyBomApprovalCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ challengeId: zId, code: z.string().regex(/^\d{6}$/) }))
  .handler(async ({ data, context }) => {
    const { ProductionError } = await import("@/lib/production.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    const hash = await sha(`${data.challengeId}:${data.code}`);
    const ok = await transaction(async (conn) => {
      const [rows] = await conn.execute<any[]>(
        "SELECT * FROM mfg_approval_challenges WHERE id = ? AND workspace_id = ? AND actor = ? FOR UPDATE",
        [data.challengeId, data.workspaceId, context.userId],
      );
      const c = rows[0];
      if (!c || c.consumed_at || c.verified_at || new Date(c.expires_at).getTime() <= Date.now() || c.attempts >= 5) return false;
      const match = c.code_hash === hash;
      await conn.execute(
        "UPDATE mfg_approval_challenges SET attempts = attempts + 1, verified_at = ? WHERE id = ?",
        [match ? new Date() : null, data.challengeId],
      );
      return match;
    });
    if (!ok) throw new ProductionError("Kode salah, kedaluwarsa, atau sudah dipakai.");
    return { id: data.challengeId };
  });
