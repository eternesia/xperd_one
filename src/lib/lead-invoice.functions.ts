import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const ws = z.object({ workspaceId: z.string().uuid() });

async function gate(workspaceId: string, userId: string, write: boolean) {
  const { isWorkspaceMember, canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await isWorkspaceMember(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ke workspace ini.");
  if (!(await workspaceHasFeature(workspaceId, "lead_invoice")))
    throw new Error(
      "Invoice prospek tersedia mulai paket Pro. Upgrade paket untuk mengaktifkannya.",
    );
  if (write && !(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ubah di workspace ini.");
}
const actorOf = (c: { userId: string; user?: { email?: string | null } | null }) => ({
  id: c.userId,
  email: c.user?.email ?? null,
});

export const createLeadInvoice = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        leadId: z.string().uuid(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        taxRate: z.number().min(0).max(100).optional(),
        notes: z.string().max(2000).nullable().optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1).max(300),
              qty: z.number().min(0).max(1_000_000),
              price: z.number().min(0).max(1_000_000_000_000),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { createInvoiceCore } = await import("@/lib/lead-invoice.core.server");
    return createInvoiceCore(data.workspaceId, data, actorOf(context));
  });

export const listLeadInvoices = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ leadId: z.string().uuid().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, false);
    const { listInvoicesCore } = await import("@/lib/lead-invoice.core.server");
    return listInvoicesCore(data.workspaceId, data.leadId);
  });

export const setLeadInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({ invoiceId: z.string().uuid(), status: z.enum(["unpaid", "paid", "cancelled"]) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { setInvoiceStatusCore } = await import("@/lib/lead-invoice.core.server");
    await setInvoiceStatusCore(data.workspaceId, data.invoiceId, data.status, actorOf(context));
    return { ok: true };
  });

export const markLeadInvoiceSent = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ invoiceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { markInvoiceSentCore } = await import("@/lib/lead-invoice.core.server");
    await markInvoiceSentCore(data.workspaceId, data.invoiceId);
    return { ok: true };
  });

/* Publik (tanpa login): dibuka pelanggan lewat link. */
export const getInvoicePublic = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ token: z.string().max(64) }).parse(v))
  .handler(async ({ data }) => {
    const { getPublicInvoice } = await import("@/lib/lead-invoice.core.server");
    return getPublicInvoice(data.token);
  });

export const sendLeadInvoiceWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws.extend({ invoiceId: z.string().uuid(), link: z.string().url().max(500) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { sendInvoiceWaCore } = await import("@/lib/lead-invoice.core.server");
    return sendInvoiceWaCore(data.workspaceId, data.invoiceId, data.link, actorOf(context));
  });
