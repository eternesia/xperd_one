/** Uji minat fitur yang belum dibangun: catat klik & pendaftaran minat, ringkas untuk Super Admin. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const FEATURES = ["ai_photo_video"] as const;

export const recordFeatureInterest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        feature: z.enum(FEATURES),
        event: z.enum(["click", "want"]),
        workspaceId: z.string().uuid().optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      `INSERT INTO feature_interest (feature, event, user_id, workspace_id, note) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
      [data.feature, data.event, context.userId, data.workspaceId ?? null, data.note || null],
    );
    return { ok: true };
  });

export const adminFeatureInterest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const totals = await execute<{ feature: string; event: string; n: number }>(
      "SELECT feature, event, COUNT(*) AS n FROM feature_interest GROUP BY feature, event",
    );
    const people = await execute<{
      feature: string;
      email: string | null;
      note: string | null;
      created_at: string;
    }>(
      `SELECT f.feature, u.email, f.note, f.created_at
         FROM feature_interest f LEFT JOIN app_users u ON u.id = f.user_id
        WHERE f.event = 'want' ORDER BY f.created_at DESC LIMIT 300`,
    );
    return { totals: totals.map((t) => ({ ...t, n: Number(t.n) })), people };
  });
