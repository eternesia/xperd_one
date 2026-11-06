import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Mengubah percakapan DM sosial menjadi lead CRM (BS New 12). Butuh fitur CRM (Pro ke atas) dan izin tulis. */
export const convertConversationToLead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        conversationId: z.string().uuid(),
        phone: z.string().max(40).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const { workspaceHasFeature } = await import("@/lib/entitlements.server");
    if (!(await workspaceHasFeature(data.workspaceId, "crm")))
      throw new Error(
        "Simpan ke Leads tersedia mulai paket Pro. Upgrade paket untuk mengaktifkan integrasi ini.",
      );
    if (!(await canWriteWorkspace(data.workspaceId, context.userId)))
      throw new Error("Anda tidak memiliki akses ubah di workspace ini.");
    const { convertConversationToLeadCore } = await import("@/lib/inbox-lead.core.server");
    return convertConversationToLeadCore(context.userId, data);
  });
