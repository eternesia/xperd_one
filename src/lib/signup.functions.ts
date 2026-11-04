import { createServerFn } from "@tanstack/react-start";

/* Pendaftaran mandiri publik: register → email OTP → verifikasi → tenant trial dibuat (BS New 11). */

export interface SignupInput {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  subdomain: string;
  city?: string;
  industry?: string;
  notes?: string;
  package_code: string;
  billing_cycle: "monthly" | "yearly";
}

const SELF_SERVE = ["one-starter", "one-professional"];
const OTP_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

async function issueOtp(reg: { id: string; email: string; contact_name: string }) {
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const { loadGateway, sendViaGateway, otpEmail, randomOtp, sha256, PLATFORM_SCOPE } =
    await import("@/lib/email-gateway.server");
  const g = await loadGateway(PLATFORM_SCOPE);
  if (!g || !g.enabled) return { sent: false as const, reason: "gateway_not_configured" };
  const code = randomOtp();
  await execute(
    "UPDATE registration_otps SET consumed_at = NOW(6) WHERE registration_id = ? AND consumed_at IS NULL",
    [reg.id],
  );
  await execute(
    "INSERT INTO registration_otps (id, registration_id, email, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      uuid(),
      reg.id,
      reg.email,
      await sha256(`${reg.id}:${code}`),
      new Date(Date.now() + OTP_TTL_MIN * 60_000),
    ],
  );
  await sendViaGateway(g, { to: reg.email, ...otpEmail(reg.contact_name, code) });
  return { sent: true as const };
}

export const startSignup = createServerFn({ method: "POST" })
  .validator((d: SignupInput) => {
    if (!d?.email || !/^\S+@\S+\.\S+$/.test(d.email)) throw new Error("Email tidak valid");
    if (!SELF_SERVE.includes(d.package_code)) throw new Error("Paket ini harus melalui sales");
    if (!/^[a-z0-9-]{3,40}$/.test(d.subdomain)) throw new Error("Subdomain tidak valid");
    if ((d.company_name ?? "").trim().length < 2 || (d.contact_name ?? "").trim().length < 2)
      throw new Error("Data belum lengkap");
    return d;
  })
  .handler(async ({ data }) => {
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const email = data.email.trim().toLowerCase();
    const used =
      "Email ini sudah pernah didaftarkan dan tidak bisa dipakai untuk trial baru. Silakan masuk.";
    const taken = await executeOne(
      `SELECT 1 AS ok FROM app_users WHERE LOWER(email) = ?
       UNION SELECT 1 FROM profiles WHERE LOWER(email) = ?
       UNION SELECT 1 FROM tenants WHERE LOWER(pic_email) = ?
       UNION SELECT 1 FROM registrations WHERE LOWER(email) = ? AND status IN ('provisioned','rejected')`,
      [email, email, email, email],
    );
    if (taken) throw new Error(used);
    if (await executeOne("SELECT id FROM tenants WHERE subdomain = ?", [data.subdomain]))
      throw new Error("Subdomain sudah dipakai. Pilih yang lain.");

    const pending = await executeOne<{ id: string }>(
      "SELECT id FROM registrations WHERE LOWER(email) = ? AND status <> 'provisioned' LIMIT 1",
      [email],
    );
    const vals = [
      data.company_name.trim(),
      data.contact_name.trim(),
      email,
      data.phone,
      data.subdomain,
      data.city || null,
      data.industry || null,
      data.notes || null,
      data.package_code,
      data.billing_cycle,
    ];
    const dupMsg = (e: unknown) =>
      (e as { code?: string }).code === "ER_DUP_ENTRY"
        ? "Subdomain sudah dipakai."
        : (e as Error).message;
    let regId: string;
    try {
      if (pending) {
        await execute(
          `UPDATE registrations SET company_name = ?, contact_name = ?, email = ?, phone = ?, subdomain = ?, city = ?,
                  industry = ?, notes = ?, package_code = ?, billing_cycle = ? WHERE id = ?`,
          [...vals, pending.id],
        );
        regId = pending.id;
      } else {
        regId = uuid();
        await execute(
          `INSERT INTO registrations (company_name, contact_name, email, phone, subdomain, city, industry, notes, package_code, billing_cycle, id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...vals, regId],
        );
      }
    } catch (e) {
      throw new Error(dupMsg(e));
    }
    const res = await issueOtp({ id: regId, email, contact_name: vals[1] as string });
    return { registrationId: regId, otpSent: res.sent };
  });

export const resendSignupOtp = createServerFn({ method: "POST" })
  .validator((d: { registrationId: string }) => d)
  .handler(async ({ data }) => {
    const { executeOne } = await import("@/integrations/mysql/pool");
    const reg = await executeOne<{
      id: string;
      email: string;
      contact_name: string;
      status: string;
    }>("SELECT id, email, contact_name, status FROM registrations WHERE id = ?", [
      data.registrationId,
    ]);
    if (!reg || reg.status === "provisioned") throw new Error("Pendaftaran tidak ditemukan");
    const last = await executeOne<{ created_at: string }>(
      "SELECT created_at FROM registration_otps WHERE registration_id = ? ORDER BY created_at DESC LIMIT 1",
      [reg.id],
    );
    if (last && Date.now() - Date.parse(`${last.created_at.replace(" ", "T")}Z`) < 60_000)
      throw new Error("Tunggu 1 menit sebelum kirim ulang");
    const res = await issueOtp(reg);
    if (!res.sent) throw new Error("Email gateway belum dikonfigurasi");
    return { ok: true };
  });

export const verifySignupOtp = createServerFn({ method: "POST" })
  .validator((d: { registrationId: string; code: string; password: string }) => {
    if (!/^\d{6}$/.test(d.code ?? "")) throw new Error("Kode OTP harus 6 digit");
    if ((d.password ?? "").length < 8) throw new Error("Kata sandi minimal 8 karakter");
    return d;
  })
  .handler(async ({ data }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { sha256, loadGateway, sendViaGateway, welcomeEmail, PLATFORM_SCOPE } =
      await import("@/lib/email-gateway.server");
    const otp = await executeOne<{
      id: string;
      expires_at: string;
      attempts: number;
      code_hash: string;
    }>(
      `SELECT * FROM registration_otps WHERE registration_id = ? AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [data.registrationId],
    );
    if (!otp) throw new Error("Kode tidak ditemukan. Kirim ulang kode.");
    if (Date.parse(`${otp.expires_at.replace(" ", "T")}Z`) < Date.now())
      throw new Error("Kode sudah kedaluwarsa. Kirim ulang kode.");
    if (otp.attempts >= MAX_ATTEMPTS)
      throw new Error("Terlalu banyak percobaan. Kirim ulang kode.");
    if ((await sha256(`${data.registrationId}:${data.code}`)) !== otp.code_hash) {
      await execute("UPDATE registration_otps SET attempts = attempts + 1 WHERE id = ?", [otp.id]);
      throw new Error("Kode OTP salah");
    }
    await execute("UPDATE registration_otps SET consumed_at = NOW(6) WHERE id = ?", [otp.id]);

    const { provisionRegistrationCore } = await import("@/lib/provisioning-core.server");
    const result = await provisionRegistrationCore(data.registrationId, data.password, {
      signupSource: "xperd",
    });
    try {
      const g = await loadGateway(PLATFORM_SCOPE);
      const reg = await executeOne<{ contact_name: string }>(
        "SELECT contact_name FROM registrations WHERE id = ?",
        [data.registrationId],
      );
      if (g?.enabled) {
        const origin = process.env.PUBLIC_APP_URL || "";
        await sendViaGateway(g, {
          to: result.email,
          ...welcomeEmail(
            reg?.contact_name ?? "",
            result.email,
            result.trialEndsAt,
            `${origin}/auth`,
          ),
        });
      }
    } catch (e) {
      console.error("welcome email failed", e);
    }
    return { email: result.email, trialEndsAt: result.trialEndsAt };
  });
