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
      if (new Set(data.lines.map((l) => `${l.item_id}|${l.phase ?? ""}`)).size !== data.lines.length)
        throw new ProductionError("Bahan yang sama tidak boleh muncul dua kali pada phase yang sama.");
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
              "INSERT INTO mfg_boms (id, workspace_id, item_id, code, formulation_code, target_content, target_unit, bom_level, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
              [bomId, w, v.item_id, v.code, v.formulation_code, v.target_content, v.target_unit, v.bom_level ?? 1, context.userId],
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
      status: z.enum(["draft", "approved"]),
      key: zId,
      reason: z.string().trim().min(1).max(2000),
      override: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAudit, mfgRoles, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-access.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await mfgActionAssert(w, context.userId, "boms", EDIT_ROLES);
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
      const ok = ver.status === "draft" && data.status === "approved";
      if (!ok) throw new ProductionError("Transisi BOM tidak valid.");
      let issues: string[] = [];
      if (data.status === "approved") {
        const cnt = await one("SELECT COUNT(*) AS n FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ?", [w, data.versionId]);
        if (Number(cnt.n) === 0) throw new ProductionError("BOM kosong.");
        issues = await compositionIssues(conn, w, data.versionId);
        if (issues.length && !data.override) throw new ProductionError(`Komposisi tidak sesuai: ${issues.join("; ")}`);
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
              });
      return { id: data.versionId };
    });
  });

/** Data halaman form BoM (baru / buka / revisi): master + versi yang dibuka. */
export const getBomFormData = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ versionId: zId.nullable() }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, ProductionError, d10 } = await import("@/lib/production.server");
    const { mfgActionAllowed } = await import("@/lib/production-access.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await mfgAssert(w, context.userId, "boms", false);
    const [items, units, regs, codes, canWrite] = await Promise.all([
      execute<any>("SELECT id, code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 2000", [w]),
      execute<any>("SELECT code FROM md_uoms WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at, code", [w]),
      execute<any>("SELECT id, item_id, registration_no FROM mfg_product_registrations WHERE workspace_id = ? AND is_active = 1", [w]),
      execute<any>("SELECT code FROM mfg_formulation_codes WHERE workspace_id = ? AND is_active = 1", [w]),
      mfgActionAllowed(w, context.userId, "boms", EDIT_ROLES),
    ]);
    let version: any = null;
    let bom: any = null;
    if (data.versionId) {
      version = await executeOne<any>("SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND id = ?", [w, data.versionId]);
      if (!version) throw new ProductionError("Versi tidak tersedia.", 403);
      bom = await executeOne<any>("SELECT * FROM mfg_boms WHERE workspace_id = ? AND id = ?", [w, version.bom_id]);
    }
    return {
      items: items as { id: string; code: string; name: string }[],
      units: units as { code: string }[],
      registrations: regs as { id: string; item_id: string; registration_no: string }[],
      codes: codes as { code: string }[],
      canWrite,
      version: version
        ? {
            id: version.id as string,
            bom_id: version.bom_id as string,
            version_no: Number(version.version_no),
            status: version.status as "draft" | "approved",
            base_batch_qty: Number(version.base_batch_qty),
            base_uom: version.base_uom as string,
            std_yield_pct: Number(version.std_yield_pct),
            effective_from: d10(version.effective_from),
            effective_to: version.effective_to ? d10(version.effective_to) : null,
            registration_id: (version.registration_id ?? null) as string | null,
            dosage_form: (version.dosage_form ?? null) as string | null,
            source_document: (version.source_document ?? null) as string | null,
          }
        : null,
      bom: bom
        ? {
            id: bom.id as string,
            item_id: bom.item_id as string,
            code: bom.code as string,
            formulation_code: (bom.formulation_code ?? null) as string | null,
            target_content: bom.target_content === null ? null : Number(bom.target_content),
            target_unit: (bom.target_unit ?? null) as "%w/w" | "g/L" | null,
            bom_level: Number(bom.bom_level ?? 1),
          }
        : null,
    };
  });
