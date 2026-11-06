// Production M5 — mutu: spesifikasi QC, inspeksi, hasil (lulus/gagal dihitung server), keputusan lot (tanpa OTP), deviasi/CAPA.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";
import { evaluateQcValue, qcSpecSchema } from "@/lib/production-quality";

const ws = z.object({ workspaceId: zId });
const reason = z.string().trim().min(1).max(2000);
const QC_ROLES = ["qa_manager", "qc_analyst"];
const QA_ONLY = ["qa_manager"];
const DEV_ROLES = ["qa_manager", "qc_analyst", "production_supervisor"];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const getProductionQuality = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws)
  .handler(async ({ data, context }) => {
    const { mfgAssert, d10 } = await import("@/lib/production.server");
    const { mfgActionAllowed, mfgStrictRole } = await import("@/lib/production-lots.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "quality", false);
    const w = data.workspaceId;
    const [specs, params, inspections, deviations, lots, items, canWrite, qa] = await Promise.all([
      execute<any>("SELECT * FROM mfg_qc_specs WHERE workspace_id = ? ORDER BY code LIMIT 500", [w]),
      execute<any>("SELECT * FROM mfg_qc_spec_params WHERE workspace_id = ? AND is_active = 1 ORDER BY sequence LIMIT 5000", [w]),
      execute<any>("SELECT * FROM mfg_qc_inspections WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100", [w]),
      execute<any>("SELECT * FROM mfg_deviations WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100", [w]),
      execute<any>("SELECT id, lot_no, item_id, qc_status, expiry_date FROM mfg_lots WHERE workspace_id = ? AND is_active = 1 ORDER BY lot_no LIMIT 1000", [w]),
      execute<any>("SELECT id, code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 1000", [w]),
      mfgActionAllowed(w, context.userId, "quality", QC_ROLES),
      mfgStrictRole(w, context.userId, QA_ONLY),
    ]);
    return {
      specs: specs.map((s) => ({ ...s, status: (s.status ?? "approved") as "draft" | "approved", approved_at: iso(s.approved_at), is_active: Number(s.is_active) === 1, created_at: iso(s.created_at), updated_at: iso(s.updated_at) })) as any[],
      params: params.map((p) => ({ ...p, min_value: n(p.min_value), max_value: n(p.max_value), is_critical: Number(p.is_critical) === 1, is_active: true })) as any[],
      inspections: inspections.map((i) => ({ ...i, signed_at: iso(i.signed_at), created_at: iso(i.created_at) })) as any[],
      deviations: deviations.map((v) => ({ ...v, closed_at: iso(v.closed_at), created_at: iso(v.created_at), updated_at: iso(v.updated_at) })) as any[],
      lots: lots.map((l) => ({ ...l, expiry_date: l.expiry_date ? d10(l.expiry_date) : null })) as any[],
      items: items as { id: string; code: string; name: string }[],
      canWrite,
      isQaManager: qa && (await mfgActionAllowed(w, context.userId, "quality", QA_ONLY)),
    };
  });

export const getInspectionResults = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ inspectionId: zId }))
  .handler(async ({ data, context }) => {
    const { mfgAssert } = await import("@/lib/production.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "quality", false);
    const r = await execute<any>("SELECT * FROM mfg_qc_results WHERE workspace_id = ? AND inspection_id = ?", [data.workspaceId, data.inspectionId]);
    return r.map((x) => ({ ...x, value: Number(x.value), pass: Number(x.pass) === 1 })) as any[];
  });

export const saveQcSpec = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(qcSpecSchema.and(ws).and(z.object({ id: zId.nullable(), reason })))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "quality", QC_ROLES);
    const v = data.values;
    return transaction(async (conn) => {
      let id = data.id;
      let before: any = null;
      if (!id) {
        const [it] = await conn.execute<any[]>("SELECT 1 FROM md_items WHERE id = ? AND workspace_id = ?", [v.item_id, data.workspaceId]);
        if (!it.length) throw new ProductionError("Item lintas-workspace ditolak.");
        let bom: string | null = v.bom_version_id || null;
        if (bom) {
          if (!/^[0-9a-f-]{36}$/i.test(bom)) throw new ProductionError("Versi BOM tidak valid.");
          const [b] = await conn.execute<any[]>("SELECT 1 FROM mfg_bom_versions WHERE id = ? AND workspace_id = ?", [bom, data.workspaceId]).catch(() => [[{ x: 1 }]] as any);
          if (!b.length) throw new ProductionError("Versi BOM tidak tersedia.");
        }
        id = uuid();
        try {
          await conn.execute(
            "INSERT INTO mfg_qc_specs (id, workspace_id, item_id, bom_version_id, stage, code, name, status, created_by) VALUES (?,?,?,?,?,?,?,'draft',?)",
            [id, data.workspaceId, v.item_id, bom, v.stage, v.code, v.name, context.userId],
          );
        } catch (e: any) {
          if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Kode spesifikasi sudah dipakai.");
          throw e;
        }
      } else {
        const [r] = await conn.execute<any[]>("SELECT * FROM mfg_qc_specs WHERE id = ? AND workspace_id = ? FOR UPDATE", [id, data.workspaceId]);
        before = r[0];
        if (!before) throw new ProductionError("Spesifikasi tidak tersedia.", 403);
        if ((before.status ?? "approved") !== "draft") throw new ProductionError("Spesifikasi approved terkunci; kembalikan ke draft untuk mengubah.");
        const [used] = await conn.execute<any[]>("SELECT 1 FROM mfg_qc_inspections WHERE workspace_id = ? AND spec_id = ? LIMIT 1", [data.workspaceId, id]);
        if (used.length) throw new ProductionError("Spesifikasi sudah dipakai; buat kode baru.");
        await conn.execute("UPDATE mfg_qc_specs SET name = ?, is_active = ? WHERE id = ?", [v.name, v.is_active ? 1 : 0, id]);
        await conn.execute("UPDATE mfg_qc_spec_params SET is_active = 0 WHERE workspace_id = ? AND spec_id = ?", [data.workspaceId, id]);
      }
      let seq = 0;
      for (const p of data.params) {
        seq++;
        const pid = uuid();
        await conn.execute(
          "INSERT INTO mfg_qc_spec_params (id, workspace_id, spec_id, sequence, param, method, unit, min_value, max_value, is_critical) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [pid, data.workspaceId, id, seq, p.param, p.method || null, p.unit || null, p.min_value, p.max_value, p.is_critical ? 1 : 0],
        );
      }
      const [after] = await conn.execute<any[]>("SELECT * FROM mfg_qc_specs WHERE id = ?", [id]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_qc_specs", entityId: id!, action: before ? "UPDATE" : "INSERT", oldValue: before, newValue: { ...after[0], params: data.params }, reason: data.reason });
      return { id };
    });
  });

export const transitionQcSpec = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ id: zId, status: z.enum(["draft", "approved"]) }))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "quality", QC_ROLES);
    return transaction(async (conn) => {
      const [r] = await conn.execute<any[]>("SELECT * FROM mfg_qc_specs WHERE id = ? AND workspace_id = ? FOR UPDATE", [data.id, data.workspaceId]);
      const s = r[0];
      if (!s) throw new ProductionError("Spesifikasi tidak tersedia.", 403);
      const cur = (s.status ?? "approved") as string;
      if (cur === data.status) return { id: data.id };
      if (data.status === "approved") {
        const [pc] = await conn.execute<any[]>("SELECT COUNT(*) AS n FROM mfg_qc_spec_params WHERE workspace_id = ? AND spec_id = ? AND is_active = 1", [data.workspaceId, data.id]);
        if (!Number(pc[0]?.n)) throw new ProductionError("Spesifikasi belum punya parameter.");
      } else {
        const [used] = await conn.execute<any[]>("SELECT 1 FROM mfg_qc_inspections WHERE workspace_id = ? AND spec_id = ? LIMIT 1", [data.workspaceId, data.id]);
        if (used.length) throw new ProductionError("Spesifikasi sudah dipakai inspeksi; buat kode baru.");
      }
      await conn.execute("UPDATE mfg_qc_specs SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?", [data.status, data.status === "approved" ? context.userId : null, data.status === "approved" ? new Date() : null, data.id]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_qc_specs", entityId: data.id, action: data.status === "approved" ? "APPROVE" : "UPDATE", oldValue: { status: cur }, newValue: { status: data.status }, reason: data.status === "approved" ? "Approve spesifikasi QC" : "Kembalikan spesifikasi QC ke draft" });
      return { id: data.id };
    });
  });

export const createQcInspection = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ specId: zId, lotId: zId.nullable(), orderId: zId.nullable(), sampleId: z.string().trim().min(1).max(120), key: zId, reason }))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "quality", QC_ROLES);
    if (!data.lotId && !data.orderId) throw new ProductionError("Inspeksi butuh lot atau order.");
    return transaction(async (conn) => {
      const [dup] = await conn.execute<any[]>("SELECT id FROM mfg_qc_inspections WHERE workspace_id = ? AND idempotency_key = ?", [data.workspaceId, data.key]);
      if (dup[0]) return { id: dup[0].id as string };
      const [sp] = await conn.execute<any[]>("SELECT * FROM mfg_qc_specs WHERE workspace_id = ? AND id = ? AND is_active = 1", [data.workspaceId, data.specId]);
      const s = sp[0];
      if (!s) throw new ProductionError("Spesifikasi tidak tersedia.");
      if ((s.status ?? "approved") !== "approved") throw new ProductionError("Spesifikasi harus berstatus approved.");
      if (data.lotId) {
        const [l] = await conn.execute<any[]>("SELECT item_id FROM mfg_lots WHERE workspace_id = ? AND id = ?", [data.workspaceId, data.lotId]);
        if (!l[0] || l[0].item_id !== s.item_id) throw new ProductionError("Spesifikasi tidak cocok dengan item lot.");
      }
      const id = uuid();
      await conn.execute(
        "INSERT INTO mfg_qc_inspections (id, workspace_id, lot_id, order_id, spec_id, stage, sample_id, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, data.workspaceId, data.lotId, data.orderId, data.specId, s.stage, data.sampleId, data.key, context.userId],
      );
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_qc_inspections", entityId: id, action: "INSERT", newValue: { lot_id: data.lotId, spec_id: data.specId, sample_id: data.sampleId, stage: s.stage }, reason: data.reason });
      return { id };
    });
  });

export const recordQcResults = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      inspectionId: zId,
      results: z.array(z.object({ param_id: zId, value: z.number().finite(), method_note: z.string().max(500), instrument_id: z.string().max(120) })).min(1).max(60),
      reason,
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAudit, mfgAllocateNumber, mfgEnsureSettings, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "quality", QC_ROLES);
    return transaction(async (conn) => {
      const [ir] = await conn.execute<any[]>("SELECT * FROM mfg_qc_inspections WHERE workspace_id = ? AND id = ? FOR UPDATE", [data.workspaceId, data.inspectionId]);
      const ins = ir[0];
      if (!ins) throw new ProductionError("Inspeksi tidak tersedia.", 403);
      if (ins.status !== "pending") throw new ProductionError("Inspeksi sudah dievaluasi.");
      const [pr] = await conn.execute<any[]>("SELECT * FROM mfg_qc_spec_params WHERE workspace_id = ? AND spec_id = ? AND is_active = 1", [data.workspaceId, ins.spec_id]);
      const params = new Map(pr.map((p) => [p.id as string, p]));
      const seen = new Set<string>();
      let allOk = true;
      for (const r of data.results) {
        const prm = params.get(r.param_id);
        if (!prm) throw new ProductionError("Parameter tidak ada dalam spesifikasi.");
        if (seen.has(r.param_id)) throw new ProductionError("Parameter ganda.");
        seen.add(r.param_id);
        if (Math.abs(r.value - Math.round(r.value * 1e6) / 1e6) > 1e-9) throw new ProductionError("Nilai maksimal 6 desimal.");
        const ok = evaluateQcValue(r.value, n(prm.min_value), n(prm.max_value));
        allOk = allOk && ok;
        const rid = uuid();
        await conn.execute(
          "INSERT INTO mfg_qc_results (id, workspace_id, inspection_id, param_id, value, unit, pass, method_note, instrument_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [rid, data.workspaceId, data.inspectionId, prm.id, r.value, prm.unit, ok ? 1 : 0, r.method_note || null, r.instrument_id || null, context.userId],
        );
        await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_qc_results", entityId: rid, action: "INSERT", newValue: { param_id: prm.id, value: r.value, pass: ok }, reason: data.reason });
      }
      if (params.size !== seen.size) throw new ProductionError("Semua parameter spesifikasi wajib diisi.");
      const status = allOk ? "passed" : "failed";
      await conn.execute("UPDATE mfg_qc_inspections SET status = ?, inspector_id = ?, signed_at = ? WHERE id = ?", [status, context.userId, new Date(), data.inspectionId]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_qc_inspections", entityId: data.inspectionId, action: "UPDATE", oldValue: { status: "pending" }, newValue: { status }, reason: data.reason });
      if (!allOk) {
        await mfgEnsureSettings(conn, data.workspaceId, context.userId);
        const did = uuid();
        const no = await mfgAllocateNumber(conn, data.workspaceId, "deviation", did, did);
        await conn.execute(
          "INSERT INTO mfg_deviations (id, workspace_id, deviation_no, source, lot_id, order_id, inspection_id, description, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
          [did, data.workspaceId, no, "qc_failure", ins.lot_id, ins.order_id, data.inspectionId, `Hasil QC di luar spesifikasi (sampel ${ins.sample_id})`, context.userId],
        );
        await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_deviations", entityId: did, action: "INSERT", newValue: { deviation_no: no, source: "qc_failure" }, reason: data.reason });
      }
      return { status };
    });
  });

export const decideLot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ lotId: zId, status: z.enum(["released", "rejected", "hold"]), reason }))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError, jakartaToday, d10 } = await import("@/lib/production.server");
    const { mfgActionAllowed, mfgStrictRole } = await import("@/lib/production-lots.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    if (!(await mfgActionAllowed(data.workspaceId, context.userId, "quality", QA_ONLY)) || !(await mfgStrictRole(data.workspaceId, context.userId, QA_ONLY)))
      throw new ProductionError("Persetujuan QA manager diperlukan.", 403);
    return transaction(async (conn) => {
      const [lr] = await conn.execute<any[]>("SELECT * FROM mfg_lots WHERE workspace_id = ? AND id = ? FOR UPDATE", [data.workspaceId, data.lotId]);
      const l = lr[0];
      if (!l) throw new ProductionError("Lot tidak tersedia.", 403);
      if (["rejected", "expired"].includes(l.qc_status)) throw new ProductionError("Status akhir lot tidak dapat diubah.");
      if (l.qc_status === data.status) return { status: data.status as string };
      if (data.status === "released") {
        const [li] = await conn.execute<any[]>("SELECT status FROM mfg_qc_inspections WHERE workspace_id = ? AND lot_id = ? AND status <> 'pending' ORDER BY signed_at DESC, created_at DESC LIMIT 1", [data.workspaceId, data.lotId]);
        if (!li[0] || li[0].status === "failed") throw new ProductionError("Lot butuh inspeksi lulus sebelum rilis.");
        const [od] = await conn.execute<any[]>("SELECT 1 FROM mfg_deviations WHERE workspace_id = ? AND lot_id = ? AND status <> 'closed' LIMIT 1", [data.workspaceId, data.lotId]);
        if (od.length) throw new ProductionError("Tutup deviasi terbuka sebelum rilis.");
        if (l.expiry_date && d10(l.expiry_date) < jakartaToday()) throw new ProductionError("Lot kedaluwarsa tidak dapat dirilis.");
      }
      await conn.execute("UPDATE mfg_lots SET qc_status = ? WHERE id = ?", [data.status, data.lotId]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_lots", entityId: data.lotId, action: "UPDATE", oldValue: { qc_status: l.qc_status }, newValue: { qc_status: data.status }, reason: data.reason });
      return { status: data.status as string };
    });
  });

export const saveDeviation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      id: zId.nullable(),
      values: z.object({ lot_id: z.string(), order_id: z.string(), description: z.string().trim().max(4000), impact: z.string().max(4000), root_cause: z.string().max(4000), capa: z.string().max(4000) }),
      reason,
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAudit, mfgAllocateNumber, mfgEnsureSettings, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "quality", DEV_ROLES);
    const v = data.values;
    return transaction(async (conn) => {
      let id = data.id;
      let before: any = null;
      if (!id) {
        if (!v.description.trim()) throw new ProductionError("Deskripsi deviasi wajib diisi.");
        if (v.lot_id) {
          const [l] = await conn.execute<any[]>("SELECT 1 FROM mfg_lots WHERE workspace_id = ? AND id = ?", [data.workspaceId, v.lot_id]);
          if (!l.length) throw new ProductionError("Lot lintas-workspace ditolak.");
        }
        await mfgEnsureSettings(conn, data.workspaceId, context.userId);
        id = uuid();
        const no = await mfgAllocateNumber(conn, data.workspaceId, "deviation", id, id);
        await conn.execute(
          "INSERT INTO mfg_deviations (id, workspace_id, deviation_no, source, lot_id, order_id, description, impact, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
          [id, data.workspaceId, no, "manual", v.lot_id || null, v.order_id || null, v.description, v.impact || null, context.userId],
        );
      } else {
        const [r] = await conn.execute<any[]>("SELECT * FROM mfg_deviations WHERE workspace_id = ? AND id = ? FOR UPDATE", [data.workspaceId, id]);
        before = r[0];
        if (!before || before.status === "closed") throw new ProductionError("Deviasi tidak tersedia atau sudah ditutup.");
        await conn.execute(
          "UPDATE mfg_deviations SET impact = ?, root_cause = ?, capa = ?, status = IF(status = 'open','investigating',status) WHERE id = ?",
          [v.impact || null, v.root_cause || null, v.capa || null, id],
        );
      }
      const [after] = await conn.execute<any[]>("SELECT * FROM mfg_deviations WHERE id = ?", [id]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_deviations", entityId: id!, action: before ? "UPDATE" : "INSERT", oldValue: before, newValue: after[0], reason: data.reason });
      return { id };
    });
  });

export const closeDeviation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ id: zId, reason }))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAllowed, mfgStrictRole } = await import("@/lib/production-lots.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    if (!(await mfgActionAllowed(data.workspaceId, context.userId, "quality", QA_ONLY)) || !(await mfgStrictRole(data.workspaceId, context.userId, QA_ONLY)))
      throw new ProductionError("Persetujuan QA manager diperlukan.", 403);
    return transaction(async (conn) => {
      const [r] = await conn.execute<any[]>("SELECT * FROM mfg_deviations WHERE workspace_id = ? AND id = ? FOR UPDATE", [data.workspaceId, data.id]);
      const d = r[0];
      if (!d || d.status === "closed") throw new ProductionError("Deviasi tidak tersedia atau sudah ditutup.");
      if (!String(d.root_cause ?? "").trim() || !String(d.capa ?? "").trim()) throw new ProductionError("Akar masalah dan CAPA wajib.");
      await conn.execute("UPDATE mfg_deviations SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?", [context.userId, new Date(), data.id]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_deviations", entityId: data.id, action: "UPDATE", oldValue: { status: d.status }, newValue: { status: "closed" }, reason: data.reason });
      return { id: data.id };
    });
  });
