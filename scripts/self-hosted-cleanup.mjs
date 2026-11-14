// Instalasi mandiri (self-hosted): cabut akun Super Admin bawaan dari seed inti.
// Dijalankan oleh deploy/self-hosted (job `db`) setelah migrate + seed. Idempoten.
// Akun platform tidak boleh ada di server klien; kendali platform hanya dari pusat.
import { connect } from "./lib/db.mjs";

if (process.env.XPERD_INSTANCE_MODE !== "self_hosted") {
  console.log("[self-hosted] XPERD_INSTANCE_MODE bukan self_hosted — dilewati.");
  process.exit(0);
}
const conn = await connect();
try {
  const [roles] = await conn.query("DELETE FROM user_roles WHERE role = 'admin'");
  const [users] = await conn.query(
    `UPDATE app_users SET is_active = 0, password_hash = '!'
      WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
        AND id NOT IN (SELECT owner_id FROM tenants WHERE owner_id IS NOT NULL)`,
  );
  console.log(
    `[self-hosted] peran admin dicabut: ${roles.affectedRows}, akun bawaan dinonaktifkan: ${users.affectedRows}`,
  );
} finally {
  await conn.end();
}
