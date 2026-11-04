// Production M2: profil item, registrasi produk, dokumen kepatuhan privat.
// Padanan RPC mfg_save_profile / mfg_save_registration / mfg_attach_document / mfg_record_document_access + guard trigger-nya.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";
import {
  profileSchema,
  registrationSchema,
  documentKinds,
  documentMimeSchema,
  validateProductionDocument,
} from "@/lib/production-compliance";

const reasonSchema = z.string().trim().min(1).max(2000);
const sectionOf = (kind: string) => (kind === "sds" ? "profiles" : "registrations");
const bool = (v: unknown) => Number(v) === 1;

export const getProductionCompliance = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, section: z.enum(["profiles", "registrations"]) }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgCanAccess, jsonOf, d10, jakartaToday } = await import("@/lib/production.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, data.section, false);
    const ws = data.workspaceId;
    const [items, profiles, registrations, codes, writable, suppliers, customers, documents] = await Promise.all([
      execute<any>("SELECT id, code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 200", [ws]),
      execute<any>("SELECT * FROM mfg_item_profiles WHERE workspace_id = ? LIMIT 200", [ws]),
      execute<any>("SELECT * FROM mfg_product_registrations WHERE workspace_id = ? ORDER BY valid_until LIMIT 100", [ws]),
      execute<any>("SELECT code, name_id FROM mfg_formulation_codes WHERE workspace_id = ? AND is_active = 1 ORDER BY code", [ws]),
      mfgCanAccess(ws, context.userId, data.section, true),
      execute<any>("SELECT id, code, name FROM md_suppliers WHERE workspace_id = ? AND is_active = 1 LIMIT 200", [ws]),
      execute<any>("SELECT id, code, name FROM md_customers WHERE workspace_id = ? AND is_active = 1 LIMIT 200", [ws]),
      execute<any>(
        "SELECT id, entity_id, kind, filename, created_at FROM mfg_document_links WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500",
        [ws],
      ),
    ]);
    return {
      suppliers,
      customers,
      documents: documents.map((d) => ({ ...d, created_at: new Date(d.created_at).toISOString() })),
      items,
      profiles: profiles.map((p) => ({
        ...p,
        ghs_classes: jsonOf<string[]>(p.ghs_classes, []),
        incompatible_classes: jsonOf<string[]>(p.incompatible_classes, []),
        density_g_ml: p.density_g_ml === null ? null : Number(p.density_g_ml),
        is_b3: bool(p.is_b3),
        requires_qc_incoming: bool(p.requires_qc_incoming),
        fefo: bool(p.fefo),
        is_active: bool(p.is_active),
        created_at: undefined,
        updated_at: undefined,
      })),
      registrations: registrations.map((r) => ({
        ...r,
        valid_from: d10(r.valid_from),
        valid_until: d10(r.valid_until),
        ai_declared: jsonOf<any[]>(r.ai_declared, []).map((a) => ({ ...a, content: Number(a.content) })),
        is_active: bool(r.is_active),
        created_at: undefined,
        updated_at: undefined,
      })),
      codes,
      canWrite: writable === true,
      today: jakartaToday(),
    };
  });

export const saveProductionProfile = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, itemId: zId, values: profileSchema, reason: reasonSchema }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "profiles", true);
    const v = data.values;
    return transaction(async (conn) => {
      const [it] = await conn.execute<any[]>(
        "SELECT id FROM md_items WHERE id = ? AND workspace_id = ? AND is_active = 1",
        [data.itemId, data.workspaceId],
      );
      if (!it.length) throw new ProductionError("Item tidak ditemukan di workspace ini.");
      const [ex] = await conn.execute<any[]>(
        "SELECT * FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? FOR UPDATE",
        [data.workspaceId, data.itemId],
      );
      const cols = [
        v.item_class,
        v.cas_no,
        JSON.stringify(v.ghs_classes),
        v.un_number,
        v.is_b3 ? 1 : 0,
        v.shelf_life_days,
        v.storage_condition,
        JSON.stringify(v.incompatible_classes),
        v.density_g_ml,
        v.potency_basis,
        v.requires_qc_incoming ? 1 : 0,
        v.fefo ? 1 : 0,
        v.is_active ? 1 : 0,
      ];
      let id: string;
      if (ex[0]) {
        id = ex[0].id;
        await conn.execute(
          `UPDATE mfg_item_profiles SET item_class=?, cas_no=?, ghs_classes=?, un_number=?, is_b3=?, shelf_life_days=?, storage_condition=?,
             incompatible_classes=?, density_g_ml=?, potency_basis=?, requires_qc_incoming=?, fefo=?, is_active=? WHERE id = ? AND workspace_id = ?`,
          [...cols, id, data.workspaceId],
        );
      } else {
        id = uuid();
        await conn.execute(
          `INSERT INTO mfg_item_profiles (item_class, cas_no, ghs_classes, un_number, is_b3, shelf_life_days, storage_condition,
             incompatible_classes, density_g_ml, potency_basis, requires_qc_incoming, fefo, is_active, id, workspace_id, item_id, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [...cols, id, data.workspaceId, data.itemId, context.userId],
        );
      }
      const [after] = await conn.execute<any[]>("SELECT * FROM mfg_item_profiles WHERE id = ?", [id]);
      await mfgAudit(conn, {
        workspaceId: data.workspaceId,
        userId: context.userId,
        table: "mfg_item_profiles",
        entityId: id,
        action: ex[0] ? "UPDATE" : "INSERT",
        oldValue: ex[0] ?? null,
        newValue: after[0],
        reason: data.reason,
      });
      return { id };
    });
  });

export const saveProductionRegistration = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, id: zId.nullable(), values: registrationSchema, reason: reasonSchema }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit, ProductionError, jakartaToday } = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "registrations", true);
    const v = data.values;
    const ws = data.workspaceId;
    return transaction(async (conn) => {
      const one = async (sql: string, p: unknown[]) => (await conn.execute<any[]>(sql, p as any[]))[0][0];
      // Rujukan lintas-workspace ditolak (mfg_master_guard).
      if (!(await one("SELECT id FROM md_items WHERE id = ? AND workspace_id = ? AND is_active = 1", [v.item_id, ws])))
        throw new ProductionError("Item tidak ditemukan di workspace ini.");
      if (v.holder_supplier_id && !(await one("SELECT id FROM md_suppliers WHERE id = ? AND workspace_id = ?", [v.holder_supplier_id, ws])))
        throw new ProductionError("Prinsipal bukan milik workspace ini.");
      if (v.holder_customer_id && !(await one("SELECT id FROM md_customers WHERE id = ? AND workspace_id = ?", [v.holder_customer_id, ws])))
        throw new ProductionError("Prinsipal bukan milik workspace ini.");
      if (v.formulation_code && !(await one("SELECT id FROM mfg_formulation_codes WHERE workspace_id = ? AND code = ?", [ws, v.formulation_code])))
        throw new ProductionError("Kode formulasi tidak dikenal.");
      // mfg_registration_guard
      if (!(await one("SELECT id FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND item_class = 'finished_good' AND is_active = 1", [ws, v.item_id])))
        throw new ProductionError("Registrasi memerlukan profil barang jadi.");
      if (v.status === "active" && v.valid_until < jakartaToday())
        throw new ProductionError("Registrasi kedaluwarsa tidak dapat diaktifkan.");
      for (const a of v.ai_declared) {
        if (!(await one(
          `SELECT i.id FROM md_items i JOIN mfg_item_profiles p ON p.item_id = i.id AND p.workspace_id = i.workspace_id
            WHERE i.id = ? AND i.workspace_id = ? AND i.is_active = 1 AND p.is_active = 1 AND p.item_class IN ('active_ingredient','technical')`,
          [a.item_id, ws],
        ))) throw new ProductionError("Bahan aktif terdaftar tidak valid.");
        if (a.unit === "%w/w" && a.content >= 1000) throw new ProductionError("Presisi konsentrasi tidak valid.");
      }
      let id = data.id;
      let existing: any = null;
      if (id) {
        existing = await one("SELECT * FROM mfg_product_registrations WHERE id = ? AND workspace_id = ? FOR UPDATE", [id, ws]);
        if (!existing) throw new ProductionError("Registrasi tidak tersedia.", 403);
        if (existing.item_id !== v.item_id) throw new ProductionError("Identitas item produksi tidak dapat diubah.");
      }
      const cols = [
        v.registration_no,
        v.permit_type,
        v.holder_supplier_id,
        v.holder_customer_id,
        v.formulation_code,
        JSON.stringify(v.ai_declared),
        v.valid_from,
        v.valid_until,
        v.status,
        v.is_active ? 1 : 0,
      ];
      try {
        if (id) {
          await conn.execute(
            `UPDATE mfg_product_registrations SET registration_no=?, permit_type=?, holder_supplier_id=?, holder_customer_id=?, formulation_code=?,
               ai_declared=?, valid_from=?, valid_until=?, status=?, is_active=? WHERE id = ? AND workspace_id = ?`,
            [...cols, id, ws],
          );
        } else {
          id = uuid();
          await conn.execute(
            `INSERT INTO mfg_product_registrations (registration_no, permit_type, holder_supplier_id, holder_customer_id, formulation_code,
               ai_declared, valid_from, valid_until, status, is_active, id, workspace_id, item_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [...cols, id, ws, v.item_id, context.userId],
          );
        }
      } catch (e: any) {
        if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Nomor registrasi sudah dipakai.");
        throw e;
      }
      const after = await one("SELECT * FROM mfg_product_registrations WHERE id = ?", [id]);
      await mfgAudit(conn, {
        workspaceId: ws,
        userId: context.userId,
        table: "mfg_product_registrations",
        entityId: id!,
        action: existing ? "UPDATE" : "INSERT",
        oldValue: existing,
        newValue: after,
        reason: data.reason,
      });
      return { id };
    });
  });

export const uploadProductionDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      workspaceId: zId,
      entityId: zId,
      kind: z.enum(documentKinds),
      filename: z.string().trim().min(1).max(200),
      mime: documentMimeSchema,
      base64: z.string().max(6990510),
      reason: reasonSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const { saveWorkspaceFile, deleteWorkspaceFile } = await import("@/lib/files.server");
    await mfgAssert(data.workspaceId, context.userId, sectionOf(data.kind), true);
    const table = data.kind === "sds" ? "mfg_item_profiles" : "mfg_product_registrations";
    const col = `${data.kind}_file_id`;
    const bytes = Buffer.from(data.base64, "base64");
    try {
      validateProductionDocument(bytes, data.mime);
    } catch (e) {
      throw new ProductionError((e as Error).message);
    }
    const ext = data.mime === "application/pdf" ? "pdf" : data.mime === "image/png" ? "png" : "jpg";
    const docId = uuid();
    const path = `mfg-documents/${data.workspaceId}/${data.entityId}/${data.kind}/${docId}.${ext}`;
    await saveWorkspaceFile(path, bytes);
    try {
      return await transaction(async (conn) => {
        const [t] = await conn.execute<any[]>(
          `SELECT id FROM ${table} WHERE id = ? AND workspace_id = ? AND is_active = 1 FOR UPDATE`,
          [data.entityId, data.workspaceId],
        );
        if (!t.length) throw new ProductionError("Simpan data aktif sebelum mengunggah dokumen.");
        await conn.execute(
          `INSERT INTO mfg_document_links (id, workspace_id, entity_id, kind, path, filename, mime, size_bytes, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
          [docId, data.workspaceId, data.entityId, data.kind, path, data.filename, data.mime, bytes.length, context.userId],
        );
        await conn.execute(`UPDATE ${table} SET ${col} = ? WHERE id = ? AND workspace_id = ?`, [docId, data.entityId, data.workspaceId]);
        await mfgAudit(conn, {
          workspaceId: data.workspaceId,
          userId: context.userId,
          table,
          entityId: data.entityId,
          action: "UPDATE",
          newValue: { [col]: docId, filename: data.filename },
          reason: data.reason,
        });
        return { id: docId };
      });
    } catch (e) {
      await deleteWorkspaceFile(path).catch(() => undefined);
      throw e;
    }
  });

/** Tautan baca berumur 5 menit (JWT bertanda tangan) + catatan audit READ; berkas disajikan rute /api/production-document. */
export const openProductionDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId, id: zId }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    const { signDocumentToken } = await import("@/lib/production-documents.server");
    return transaction(async (conn) => {
      const [r] = await conn.execute<any[]>("SELECT id, kind, entity_id FROM mfg_document_links WHERE workspace_id = ? AND id = ?", [
        data.workspaceId,
        data.id,
      ]);
      if (!r[0]) throw new ProductionError("Dokumen tidak tersedia.", 403);
      await mfgAssert(data.workspaceId, context.userId, sectionOf(r[0].kind), false);
      await mfgAudit(conn, {
        workspaceId: data.workspaceId,
        userId: context.userId,
        table: "mfg_document_links",
        entityId: r[0].id,
        action: "READ",
        newValue: { kind: r[0].kind, entity_id: r[0].entity_id },
        reason: "Private compliance document access",
      });
      return { url: `/api/production-document?token=${encodeURIComponent(await signDocumentToken(context.userId, data.workspaceId, data.id))}` };
    });
  });
