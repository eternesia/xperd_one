// Production M1: pengaturan, peran, pusat kerja, kode formulasi, audit (padanan RPC mfg_save_master/mfg_initialize_codes).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { masterSaveSchema, productionSections, zId } from "@/lib/production";

const FORMULATION_CODES: [string, string, string, string][] = [
  ["EC", "Emulsifiable concentrate", "Konsentrat emulsi", "liquid"],
  ["SC", "Suspension concentrate", "Konsentrat suspensi", "liquid"],
  ["WP", "Wettable powder", "Tepung dapat dibasahkan", "solid"],
  ["WG", "Water dispersible granule", "Granul terdispersi air", "solid"],
  ["SL", "Soluble concentrate", "Konsentrat larut air", "liquid"],
  ["SP", "Water soluble powder", "Tepung larut air", "solid"],
  ["SG", "Water soluble granule", "Granul larut air", "solid"],
  ["GR", "Granule", "Granul", "solid"],
  ["EW", "Emulsion, oil in water", "Emulsi minyak dalam air", "liquid"],
  ["SE", "Suspo-emulsion", "Suspo-emulsi", "liquid"],
  ["CS", "Capsule suspension", "Suspensi kapsul", "liquid"],
  ["OD", "Oil dispersion", "Dispersi minyak", "liquid"],
  ["ME", "Micro-emulsion", "Mikroemulsi", "liquid"],
  ["FS", "Flowable concentrate for seed treatment", "Konsentrat untuk perlakuan benih", "liquid"],
  ["WS", "Slurry seed treatment powder", "Tepung untuk perlakuan benih", "solid"],
  ["DP", "Dustable powder", "Tepung tabur", "solid"],
  ["UL", "ULV liquid", "Cairan ULV", "liquid"],
  ["TC", "Technical material", "Bahan teknis", "other"],
  ["TK", "Technical concentrate", "Konsentrat teknis", "other"],
  ["XX", "Others", "Lainnya", "other"],
];

export const initializeProductionCodes = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, reason: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit } = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "formulation-codes", true);
    return transaction(async (conn) => {
      let inserted = 0;
      for (const [code, en, id, state] of FORMULATION_CODES) {
        const newId = uuid();
        const [r] = await conn.execute<any>(
          "INSERT IGNORE INTO mfg_formulation_codes (id, workspace_id, code, name_en, name_id, physical_state, created_by) VALUES (?,?,?,?,?,?,?)",
          [newId, data.workspaceId, code, en, id, state, context.userId],
        );
        if (r.affectedRows) {
          inserted++;
          await mfgAudit(conn, {
            workspaceId: data.workspaceId,
            userId: context.userId,
            table: "mfg_formulation_codes",
            entityId: newId,
            action: "INSERT",
            newValue: { code, name_en: en, name_id: id, physical_state: state },
            reason: data.reason,
          });
        }
      }
      return { inserted };
    });
  });

export const getProduction = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, section: z.enum(productionSections) }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgCanAccess, jsonOf } = await import("@/lib/production.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, data.section, false);
    const ws = data.workspaceId;
    const [settings, centers, codes, roles, audit, members, units, writable] = await Promise.all([
      executeOne<any>("SELECT * FROM mfg_settings WHERE workspace_id = ?", [ws]),
      execute<any>("SELECT * FROM mfg_work_centers WHERE workspace_id = ? ORDER BY code LIMIT 100", [ws]),
      execute<any>("SELECT * FROM mfg_formulation_codes WHERE workspace_id = ? ORDER BY code LIMIT 100", [ws]),
      execute<any>("SELECT * FROM mfg_workspace_roles WHERE workspace_id = ? LIMIT 200", [ws]),
      data.section === "audit"
        ? execute<any>(
            "SELECT id, created_at, created_by, entity_table, entity_id, action, reason FROM mfg_audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1000",
            [ws],
          )
        : Promise.resolve([] as any[]),
      execute<any>(
        `SELECT m.user_id, m.role, u.full_name, u.email FROM workspace_members m LEFT JOIN app_users u ON u.id = m.user_id WHERE m.workspace_id = ? LIMIT 200`,
        [ws],
      ),
      execute<any>("SELECT code, name FROM md_uoms WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at, code LIMIT 200", [ws]),
      mfgCanAccess(ws, context.userId, data.section, true),
    ]);
    const bool = (v: unknown) => Number(v) === 1;
    return {
      settings: settings
        ? {
            ...settings,
            numbering: jsonOf(settings.numbering, {}),
            fefo: bool(settings.fefo),
            yield_tolerance_pct: Number(settings.yield_tolerance_pct),
            updated_at: new Date(settings.updated_at).toISOString(),
          }
        : null,
      centers: centers.map((c) => ({
        ...c,
        capacity_per_hour: Number(c.capacity_per_hour),
        labor_rate_per_hour: Number(c.labor_rate_per_hour),
        overhead_rate_per_hour: Number(c.overhead_rate_per_hour),
        is_active: bool(c.is_active),
      })),
      codes: codes.map((c) => ({ ...c, is_active: bool(c.is_active) })),
      roles: roles.map((r) => ({ ...r, is_active: bool(r.is_active) })),
      audit: audit.map((a) => ({ ...a, created_at: new Date(a.created_at).toISOString() })),
      members: members.map((m) => ({
        user_id: String(m.user_id),
        role: String(m.role),
        label: (m.full_name as string) || (m.email as string) || String(m.user_id),
      })),
      units: units as { code: string; name: string }[],
      canWrite: writable === true,
    };
  });

export const saveProductionMaster = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(masterSaveSchema)
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit, mfgEnsureSettings, ProductionError, jsonOf } = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const section = {
      mfg_settings: "settings",
      mfg_workspace_roles: "roles",
      mfg_work_centers: "work-centers",
      mfg_formulation_codes: "formulation-codes",
    }[data.table];
    await mfgAssert(data.workspaceId, context.userId, section, true);
    const v = data.values as Record<string, any>;
    return transaction(async (conn) => {
      // Rujukan lintas-workspace ditolak (padanan mfg_master_guard).
      if (data.table === "mfg_workspace_roles") {
        const [m] = await conn.execute<any[]>(
          `SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?
           UNION SELECT 1 FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.id = ? AND t.owner_id = ?`,
          [data.workspaceId, v.user_id, data.workspaceId, v.user_id],
        );
        if (!m.length) throw new ProductionError("Pengguna peran harus anggota workspace ini.");
      }
      if (data.table === "mfg_work_centers" && v.uom_code) {
        const [u] = await conn.execute<any[]>(
          "SELECT 1 FROM md_uoms WHERE workspace_id = ? AND code = ? AND is_active = 1",
          [data.workspaceId, v.uom_code],
        );
        if (!u.length) throw new ProductionError("Satuan harus milik workspace ini.");
      }
      let id = data.id;
      let existing: any = null;
      if (data.table === "mfg_settings") {
        await mfgEnsureSettings(conn, data.workspaceId, context.userId);
        const [s] = await conn.execute<any[]>(
          "SELECT * FROM mfg_settings WHERE workspace_id = ? FOR UPDATE",
          [data.workspaceId],
        );
        existing = s[0];
        id = existing.id;
      } else if (id) {
        const [r] = await conn.execute<any[]>(
          `SELECT * FROM ${data.table} WHERE id = ? AND workspace_id = ? FOR UPDATE`,
          [id, data.workspaceId],
        );
        existing = r[0];
        if (!existing) throw new ProductionError("Data Production tidak tersedia.", 403);
      }
      const cols = Object.keys(v);
      const val = (k: string) =>
        typeof v[k] === "boolean" ? (v[k] ? 1 : 0) : k === "numbering" ? JSON.stringify(v[k]) : v[k];
      try {
        if (!id) {
          id = uuid();
          await conn.execute(
            `INSERT INTO ${data.table} (id, workspace_id, created_by, ${cols.map((c) => `\`${c}\``).join(",")}) VALUES (?,?,?,${cols.map(() => "?").join(",")})`,
            [id, data.workspaceId, context.userId, ...cols.map(val)],
          );
        } else {
          await conn.execute(
            `UPDATE ${data.table} SET ${cols.map((c) => `\`${c}\` = ?`).join(",")} WHERE id = ? AND workspace_id = ?`,
            [...cols.map(val), id, data.workspaceId],
          );
        }
      } catch (e: any) {
        if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Kode atau data duplikat.");
        throw e;
      }
      const [after] = await conn.execute<any[]>(`SELECT * FROM ${data.table} WHERE id = ?`, [id]);
      await mfgAudit(conn, {
        workspaceId: data.workspaceId,
        userId: context.userId,
        table: data.table,
        entityId: id!,
        action: existing ? "UPDATE" : "INSERT",
        oldValue: existing,
        newValue: after[0],
        reason: data.reason,
      });
      void jsonOf;
      return { id };
    });
  });
