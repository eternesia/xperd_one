/**
 * Instalasi klien (self-hosted): server functions pusat (Super Admin) + info instalasi untuk UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { LICENSE_MODULE_KEYS } from "@/lib/instance";

async function admin(userId: string) {
  const { requireAdmin } = await import("@/lib/auth-context.server");
  await requireAdmin(userId);
}

const input = z.object({
  name: z.string().trim().min(2).max(150),
  client_name: z.string().trim().max(150).nullable().optional(),
  domain: z.string().trim().max(255).nullable().optional(),
  modules: z.array(z.enum(LICENSE_MODULE_KEYS)).min(1),
  max_users: z.number().int().min(1).max(100000),
  expires_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  grace_days: z.number().int().min(0).max(90),
  notes: z.string().max(2000).nullable().optional(),
});

export const adminListInstances = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    await admin(context.userId);
    const { listInstances, publicKeyOneLine } = await import("@/lib/managed-instances.server");
    return { instances: await listInstances(), publicKey: await publicKeyOneLine() };
  });

export const adminCreateInstance = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { createInstance } = await import("@/lib/managed-instances.server");
    return createInstance(data, context.userId);
  });

export const adminUpdateInstance = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    input.extend({ id: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { updateInstance } = await import("@/lib/managed-instances.server");
    await updateInstance(data.id, data);
    return { ok: true };
  });

export const adminRotateInstanceToken = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { rotateInstanceToken } = await import("@/lib/managed-instances.server");
    return rotateInstanceToken(data.id);
  });

export const adminDeleteInstance = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { deleteInstance } = await import("@/lib/managed-instances.server");
    await deleteInstance(data.id);
    return { ok: true };
  });

/** Info instalasi (mode self-hosted, lisensi, modul) untuk UI aplikasi. Tanpa login. */
export const getInstanceInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { instanceInfo } = await import("@/lib/instance.server");
  return instanceInfo();
});

/** Server klien: paksa sinkron ke pusat sekarang (pemilik perusahaan atau admin platform). */
export const syncInstanceNow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { executeOne } = await import("@/integrations/mysql/pool");
    const owner = await executeOne("SELECT id FROM tenants WHERE owner_id = ? LIMIT 1", [
      context.userId,
    ]);
    if (!owner) await admin(context.userId);
    const { syncWithControl, instanceInfo } = await import("@/lib/instance.server");
    const r = await syncWithControl();
    return { ...r, info: await instanceInfo(true) };
  });

/** Penyiapan pertama instalasi mandiri: apakah halaman /setup perlu ditampilkan. */
export const getSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { setupNeeded, isSelfHosted } = await import("@/lib/instance.server");
  return { selfHosted: isSelfHosted(), needed: await setupNeeded() };
});

export const completeInstanceSetup = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(200),
        company: z.string().trim().min(2).max(150),
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(190),
        password: z.string().min(8).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { completeSetup } = await import("@/lib/instance.server");
    return completeSetup(data);
  });
