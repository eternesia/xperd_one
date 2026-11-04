// Peran kustom workspace (BS New 16): CRUD oleh owner/admin workspace, penetapan ke anggota, dan penurunan izin ke `getWorkspaceAccess`.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export type Perms = Record<string, { view: boolean; edit: boolean }>;
export interface CustomRole {
  id: string;
  name: string;
  base_role: "admin" | "staff" | "viewer";
  permissions: Perms;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const parse = <T>(v: unknown, d: T): T => {
  if (v == null) return d;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return d;
    }
  }
  return v as T;
};

async function assertManager(workspaceId: string, userId: string) {
  const { hasWorkspaceRole, ownsTenant } = await import("@/lib/auth-context.server");
  const { executeOne } = await import("@/integrations/mysql/pool");
  if (await hasWorkspaceRole(workspaceId, userId, ["owner", "admin"])) return;
  const ws = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM workspaces WHERE id = ?",
    [workspaceId],
  );
  if (ws && (await ownsTenant(ws.tenant_id, userId))) return;
  throw new Error("Forbidden");
}

function cleanPerms(input: unknown): Perms {
  const out: Perms = {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Izin tidak valid");
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/i.test(k)) throw new Error("Kunci izin tidak valid");
    const view = Boolean(v?.view);
    out[k] = { view, edit: view && Boolean(v?.edit) }; // edit hanya bila view
  }
  return out;
}

export const listCustomRoles = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
    return d;
  })
  .handler(async ({ data, context }): Promise<CustomRole[]> => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const rows = await execute<Record<string, unknown>>(
      "SELECT id, name, base_role, permissions FROM workspace_custom_roles WHERE workspace_id = ? ORDER BY name",
      [data.workspaceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      base_role: r.base_role as CustomRole["base_role"],
      permissions: parse<Perms>(r.permissions, {}),
    }));
  });

export const saveCustomRole = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      workspaceId: string;
      id?: string;
      name: string;
      base_role: string;
      permissions: unknown;
    }) => {
      if (!isId(d?.workspaceId)) throw new Error("Workspace is required");
      const name = String(d.name ?? "").trim();
      if (name.length < 2 || name.length > 60) throw new Error("Nama role minimal 2 karakter");
      if (!["admin", "staff", "viewer"].includes(d.base_role))
        throw new Error("Level dasar tidak valid");
      if (d.id && !isId(d.id)) throw new Error("Role tidak valid");
      return {
        workspaceId: d.workspaceId,
        id: d.id,
        name,
        base_role: d.base_role,
        permissions: cleanPerms(d.permissions),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertManager(data.workspaceId, context.userId);
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    return transaction(async (conn) => {
      let id = data.id;
      try {
        if (id) {
          const [res] = await conn.execute(
            "UPDATE workspace_custom_roles SET name = ?, base_role = ?, permissions = ? WHERE id = ? AND workspace_id = ?",
            [data.name, data.base_role, JSON.stringify(data.permissions), id, data.workspaceId],
          );
          if (!(res as { affectedRows: number }).affectedRows)
            throw new Error("Role tidak ditemukan");
          // Perubahan level dasar merambat ke anggota yang memakai peran ini (pengganti trigger propagate).
          await conn.execute(
            "UPDATE workspace_members SET role = ? WHERE custom_role_id = ? AND workspace_id = ? AND role <> 'owner'",
            [data.base_role, id, data.workspaceId],
          );
        } else {
          id = uuid();
          await conn.execute(
            "INSERT INTO workspace_custom_roles (id, workspace_id, name, base_role, permissions) VALUES (?, ?, ?, ?, ?)",
            [id, data.workspaceId, data.name, data.base_role, JSON.stringify(data.permissions)],
          );
        }
      } catch (e) {
        if ((e as { code?: string }).code === "ER_DUP_ENTRY")
          throw new Error("Nama role sudah dipakai di workspace ini");
        throw e;
      }
      return { id };
    });
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; id: string }) => {
    if (!isId(d?.workspaceId) || !isId(d?.id)) throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertManager(data.workspaceId, context.userId);
    const { transaction } = await import("@/integrations/mysql/pool");
    await transaction(async (conn) => {
      // Anggota kembali ke role dasar (kolom `role` sudah berisi level dasar); izin kustom dilepas.
      await conn.execute(
        "UPDATE workspace_members SET custom_role_id = NULL WHERE custom_role_id = ? AND workspace_id = ?",
        [data.id, data.workspaceId],
      );
      await conn.execute("DELETE FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?", [
        data.id,
        data.workspaceId,
      ]);
    });
    return { ok: true };
  });

/** Ubah peran anggota: peran bawaan (admin/staff/viewer) atau peran kustom. Owner tidak bisa diubah. */
export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: { workspaceId: string; memberId: string; role?: string; customRoleId?: string | null }) => {
      if (!isId(d?.workspaceId) || !isId(d?.memberId)) throw new Error("Input tidak valid");
      if (d.customRoleId) {
        if (!isId(d.customRoleId)) throw new Error("Role tidak valid");
      } else if (!["admin", "staff", "viewer"].includes(String(d.role)))
        throw new Error("Role tidak valid");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    await assertManager(data.workspaceId, context.userId);
    const { transaction } = await import("@/integrations/mysql/pool");
    await transaction(async (conn) => {
      const [m] = await conn.execute(
        "SELECT id, role FROM workspace_members WHERE id = ? AND workspace_id = ? FOR UPDATE",
        [data.memberId, data.workspaceId],
      );
      const member = (m as { role: string }[])[0];
      if (!member) throw new Error("Anggota tidak ditemukan");
      if (member.role === "owner") throw new Error("Owner tidak bisa memakai atau mengganti role");
      if (data.customRoleId) {
        const [r] = await conn.execute(
          "SELECT base_role FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?",
          [data.customRoleId, data.workspaceId],
        );
        const role = (r as { base_role: string }[])[0];
        if (!role) throw new Error("Custom role not found in workspace");
        await conn.execute(
          "UPDATE workspace_members SET custom_role_id = ?, role = ? WHERE id = ?",
          [data.customRoleId, role.base_role, data.memberId],
        );
      } else {
        await conn.execute(
          "UPDATE workspace_members SET custom_role_id = NULL, role = ? WHERE id = ?",
          [data.role ?? "viewer", data.memberId],
        );
      }
    });
    return { ok: true };
  });
