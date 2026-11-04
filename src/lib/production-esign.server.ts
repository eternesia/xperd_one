// Tanda tangan elektronik Production: kode 6 digit via email, di-hash (sha256 `id:kode`), berlaku 5 menit, maks. 5 percobaan,
// sekali pakai (consume). Padanan mfg_verify_esign / mfg_consume_esign. Dipakai M5 (lot, deviasi) dan M6–M10 (order, langkah batch).
import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { ProductionError } from "./production.server";

export const esignHash = (challengeId: string, code: string) =>
  createHash("sha256").update(`${challengeId}:${code}`).digest("hex");

/** Verifikasi kode. Selalu menaikkan `attempts`; salah/kedaluwarsa/terpakai → false (tidak melempar, agar penambahan percobaan ikut commit). */
export async function verifyEsign(
  conn: PoolConnection,
  workspaceId: string,
  actor: string,
  id: string,
  hash: string,
): Promise<boolean> {
  const [r] = await conn.execute<any[]>(
    "SELECT * FROM mfg_esign_challenges WHERE id = ? AND workspace_id = ? AND actor = ? FOR UPDATE",
    [id, workspaceId, actor],
  );
  const c = r[0];
  if (!c || c.consumed_at || c.verified_at || new Date(c.expires_at).getTime() <= Date.now() || Number(c.attempts) >= 5) return false;
  const ok = c.code_hash === hash;
  await conn.execute(
    "UPDATE mfg_esign_challenges SET attempts = attempts + 1, verified_at = ? WHERE id = ?",
    [ok ? new Date() : null, id],
  );
  return ok;
}

/** Konsumsi tanda tangan terverifikasi untuk satu entitas+aksi (sekali pakai, masih berlaku). */
export async function consumeEsign(
  conn: PoolConnection,
  workspaceId: string,
  actor: string,
  signature: string,
  table: string,
  entityId: string,
  action: string,
) {
  const [res] = await conn.execute<any>(
    `UPDATE mfg_esign_challenges SET consumed_at = ?
      WHERE id = ? AND workspace_id = ? AND entity_table = ? AND entity_id = ? AND action = ? AND actor = ?
        AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > ?`,
    [new Date(), signature, workspaceId, table, entityId, action, actor, new Date()],
  );
  if (!res.affectedRows) throw new ProductionError("Tanda tangan elektronik baru diperlukan.", 403);
}
