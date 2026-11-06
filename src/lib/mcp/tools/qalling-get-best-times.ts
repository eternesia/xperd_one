import { defineTool } from "../framework";
import { z } from "zod/v4";
import { getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { GOLDEN_HOURS, nextGoldenSlot } from "../../golden-hours";

const WIB_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** ISO 8601 with +07:00 offset, ready to pass as scheduled_at. */
const wibIso = (d: Date) => {
  const w = new Date(d.getTime() + WIB_MS);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:00+07:00`;
};

export default defineTool({
  name: "qalling_get_best_times",
  title: "Best posting times",
  description:
    "Qalling's recommended posting windows for an Indonesian audience (WIB, UTC+7: Pagi, Siang, Sore, Malam) plus the next upcoming slots as ready-to-use scheduled_at values. These are Qalling's built-in recommendations, not account-specific statistics; use qalling_get_post_insights to see what performed well.",
  inputSchema: {
    count: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(4)
      .describe("How many upcoming slots to return."),
    slot: z
      .enum(["pagi", "siang", "sore", "malam"])
      .optional()
      .describe("Only slots of this window."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ count, slot }, ctx) => {
    requireAuth(ctx);
    await getTokenUser(ctx);
    const upcoming: { slot: string; scheduled_at: string }[] = [];
    let cursor = new Date();
    for (let i = 0; i < count; i++) {
      const next = nextGoldenSlot(cursor, slot);
      if (next.getTime() < cursor.getTime()) break;
      const id =
        GOLDEN_HOURS.find((g) => {
          const w = new Date(next.getTime() + WIB_MS);
          return g.start === `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
        })?.id ?? "";
      upcoming.push({ slot: id, scheduled_at: wibIso(next) });
      cursor = new Date(next.getTime() + 1);
    }
    return json({
      timezone: "Asia/Jakarta (UTC+7)",
      windows: GOLDEN_HOURS.map((g) => ({ id: g.id, label: g.label, start: g.start, end: g.end })),
      upcoming,
    });
  },
});
