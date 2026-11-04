// Production M2 — helper server (dipakai juga tahap lain): kevalidan registrasi produk.
import { executeOne } from "@/integrations/mysql/pool";
import { jakartaToday } from "@/lib/production.server";

/** Padanan `mfg_registration_valid` (tanpa pemeriksaan akses; pemanggil sudah terotorisasi). */
export async function mfgRegistrationValid(workspaceId: string, itemId: string, date = jakartaToday()): Promise<boolean> {
  const r = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM mfg_product_registrations r
       JOIN mfg_item_profiles p ON p.workspace_id = r.workspace_id AND p.item_id = r.item_id
       JOIN md_items i ON i.workspace_id = r.workspace_id AND i.id = r.item_id
      WHERE r.workspace_id = ? AND r.item_id = ? AND p.is_active = 1 AND i.is_active = 1 AND p.item_class = 'finished_good'
        AND r.is_active = 1 AND r.status = 'active' AND r.valid_from <= ? AND r.valid_until >= ?`,
    [workspaceId, itemId, date, date],
  );
  return Number(r?.n ?? 0) > 0;
}
