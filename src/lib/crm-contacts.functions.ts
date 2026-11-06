import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const ws = z.object({ workspaceId: z.string().uuid() });
const contactFields = {
  name: z.string().max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  company_name: z.string().max(255).nullable().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  notes: z.string().max(5000).nullable().optional(),
};

async function gate(workspaceId: string, userId: string, write: boolean) {
  const { isWorkspaceMember, canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await isWorkspaceMember(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ke workspace ini.");
  if (!(await workspaceHasFeature(workspaceId, "crm")))
    throw new Error("Kontak tersedia mulai paket Pro. Upgrade paket untuk mengaktifkan fitur ini.");
  if (write && !(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ubah di workspace ini.");
}

export const listSocialContacts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        query: z.string().max(100).optional(),
        tag: z.string().max(30).optional(),
        page: z.number().int().min(0).max(1000).default(0),
        pageSize: z.number().int().min(5).max(100).default(25),
        sync: z.boolean().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, false);
    const core = await import("@/lib/crm-contacts.core.server");
    if (data.sync)
      await core.syncContactsFromConversations(data.workspaceId, context.userId).catch(() => 0);
    return core.listContactsCore(data.workspaceId, {
      query: data.query,
      tag: data.tag,
      limit: data.pageSize,
      offset: data.page * data.pageSize,
    });
  });

export const getSocialContact = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ contactId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, false);
    const { getContactCore } = await import("@/lib/crm-contacts.core.server");
    return getContactCore(data.workspaceId, data.contactId);
  });

export const saveSocialContact = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws.extend({ contactId: z.string().uuid().optional(), ...contactFields }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const core = await import("@/lib/crm-contacts.core.server");
    const { workspaceId, contactId, ...fields } = data;
    return contactId
      ? core.updateContactCore(workspaceId, contactId, fields)
      : core.createContactCore(workspaceId, context.userId, fields);
  });

export const deleteSocialContact = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ contactId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { deleteContactCore } = await import("@/lib/crm-contacts.core.server");
    return deleteContactCore(data.workspaceId, data.contactId);
  });

export const createLeadFromContact = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ contactId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { createLeadFromContactCore } = await import("@/lib/crm-contacts.core.server");
    return createLeadFromContactCore(context.userId, data.workspaceId, data.contactId);
  });
