import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  OTP_TTL_MIN,
  isSignupTier,
  normalizeEmail,
  resolveSignupTier,
  subdomainFromEmail,
  validEmail,
} from "@/lib/qalling-signup-rules";

/* Qalling tanpa kata sandi (BS New 11): daftar (nama+email+paket) dan masuk memverifikasi kode email 6 digit.
   New 11 menukar token magiclink Supabase; di Old server langsung menerbitkan cookie sesi JWT. */

const ts = (v: string) => Date.parse(`${String(v).replace(" ", "T")}Z`);

async function authSettings() {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const r = await executeOne<{ google_enabled: number; email_otp_enabled: number }>(
    "SELECT google_enabled, email_otp_enabled FROM platform_auth_settings WHERE singleton = 1",
  );
  return {
    google_enabled: r ? Boolean(r.google_enabled) : true,
    email_otp_enabled: r ? Boolean(r.email_otp_enabled) : true,
  };
}

async function emailTaken(email: string) {
  const { executeOne } = await import("@/integrations/mysql/pool");
  return Boolean(
    await executeOne(
      `SELECT 1 AS ok FROM profiles WHERE LOWER(email) = ?
       UNION SELECT 1 FROM tenants WHERE LOWER(pic_email) = ?`,
      [email, email],
    ),
  );
}

async function sendCode(to: string, name: string, code: string) {
  const { loadGateway, sendViaGateway, otpEmail, PLATFORM_SCOPE } =
    await import("@/lib/email-gateway.server");
  const g = await loadGateway(PLATFORM_SCOPE);
  if (!g || !g.enabled)
    throw new Error(
      "Pengiriman email belum diatur oleh admin. Silakan gunakan Google atau hubungi kami.",
    );
  await sendViaGateway(g, { to, ...otpEmail(name, code) });
}

/** Terbitkan sesi login (cookie JWT httpOnly) untuk pengguna dengan email ini. */
async function startSession(email: string) {
  const { findAppUserByEmail, signAppJwt, APP_JWT_COOKIE } = await import("@/lib/auth-jwt.server");
  const { execute } = await import("@/integrations/mysql/pool");
  const user = await findAppUserByEmail(email);
  if (!user || !user.is_active) throw new Error("Gagal membuat sesi masuk");
  const token = await signAppJwt({
    sub: user.id,
    email: user.email,
    name: user.full_name,
    auth_user_id: user.auth_user_id,
  });
  setCookie(APP_JWT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  await execute("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [
    user.id,
  ]);
}

/** Pengaturan login/pendaftaran yang boleh dibaca publik (halaman daftar/masuk), termasuk teks persetujuan. */
export const getPublicAuthSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const r = await executeOne<Record<string, unknown>>(
    `SELECT google_enabled, email_otp_enabled, trial_days, terms_label, terms_of_service, privacy_policy, acceptable_use_policy
       FROM platform_auth_settings WHERE singleton = 1`,
  );
  return {
    google_enabled: r ? Boolean(r.google_enabled) : true,
    email_otp_enabled: r ? Boolean(r.email_otp_enabled) : true,
    trial_days: Number(r?.trial_days ?? 14),
    terms_label: String(
      r?.terms_label ??
        "Saya menyetujui Syarat Layanan, Kebijakan Privasi, dan Kebijakan Penggunaan yang Wajar.",
    ),
    terms_of_service: String(r?.terms_of_service ?? ""),
    privacy_policy: String(r?.privacy_policy ?? ""),
    acceptable_use_policy: String(r?.acceptable_use_policy ?? ""),
  };
});

export const savePlatformAuthSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      google_enabled: boolean;
      email_otp_enabled: boolean;
      trial_days: number;
      terms_label?: string;
      terms_of_service?: string;
      privacy_policy?: string;
      acceptable_use_policy?: string;
    }) => {
      if (!Number.isInteger(d?.trial_days) || d.trial_days < 1 || d.trial_days > 90)
        throw new Error("Lama trial harus 1–90 hari");
      if ((d.terms_label ?? "x").trim().length < 1 || (d.terms_label ?? "").length > 300)
        throw new Error("Kalimat persetujuan wajib diisi (maks. 300 karakter)");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin")))
      throw new Error("Hanya Super Admin yang dapat mengubah pengaturan ini");
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      `UPDATE platform_auth_settings SET google_enabled = ?, email_otp_enabled = ?, trial_days = ?,
              terms_label = COALESCE(?, terms_label), terms_of_service = COALESCE(?, terms_of_service),
              privacy_policy = COALESCE(?, privacy_policy), acceptable_use_policy = COALESCE(?, acceptable_use_policy)
        WHERE singleton = 1`,
      [
        data.google_enabled ? 1 : 0,
        data.email_otp_enabled ? 1 : 0,
        data.trial_days,
        data.terms_label ?? null,
        data.terms_of_service ?? null,
        data.privacy_policy ?? null,
        data.acceptable_use_policy ?? null,
      ],
    );
    return { ok: true };
  });

export const startQallingSignup = createServerFn({ method: "POST" })
  .validator((d: { name: string; email: string; tier?: string; acceptTerms?: boolean }) => {
    if (d?.acceptTerms !== true)
      throw new Error("Anda harus menyetujui syarat & kebijakan untuk mendaftar");
    if ((d.name ?? "").trim().length < 2) throw new Error("Nama minimal 2 huruf");
    if (!validEmail(d.email)) throw new Error("Email tidak valid");
    return {
      name: d.name.trim().slice(0, 120),
      email: normalizeEmail(d.email),
      tier: resolveSignupTier(d.tier),
    };
  })
  .handler(async ({ data }) => {
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const s = await authSettings();
    if (!s.email_otp_enabled) throw new Error("Pendaftaran lewat email sedang dinonaktifkan");
    if (await emailTaken(data.email)) throw new Error("Email ini sudah terdaftar. Silakan masuk.");

    const pending = await executeOne<{ id: string }>(
      "SELECT id FROM registrations WHERE LOWER(email) = ? AND status = 'pending' LIMIT 1",
      [data.email],
    );
    let regId: string;
    if (pending) {
      await execute(
        `UPDATE registrations SET company_name = ?, contact_name = ?, email = ?, phone = '-', package_code = ?, notes = 'qalling-signup', terms_accepted_at = NOW(6) WHERE id = ?`,
        [data.name, data.name, data.email, data.tier, pending.id],
      );
      regId = pending.id;
    } else {
      regId = uuid();
      await execute(
        `INSERT INTO registrations (id, company_name, contact_name, email, phone, subdomain, package_code, notes, terms_accepted_at)
         VALUES (?, ?, ?, ?, '-', ?, ?, 'qalling-signup', NOW(6))`,
        [
          regId,
          data.name,
          data.name,
          data.email,
          subdomainFromEmail(data.email, uuid().slice(0, 6)),
          data.tier,
        ],
      );
    }
    const last = await executeOne<{ created_at: string }>(
      "SELECT created_at FROM registration_otps WHERE registration_id = ? ORDER BY created_at DESC LIMIT 1",
      [regId],
    );
    if (last && Date.now() - ts(last.created_at) < OTP_RESEND_SECONDS * 1000)
      return { registrationId: regId, throttled: true };
    const { randomOtp, sha256 } = await import("@/lib/email-gateway.server");
    const code = randomOtp();
    await execute(
      "UPDATE registration_otps SET consumed_at = NOW(6) WHERE registration_id = ? AND consumed_at IS NULL",
      [regId],
    );
    await execute(
      "INSERT INTO registration_otps (id, registration_id, email, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
      [
        uuid(),
        regId,
        data.email,
        await sha256(`${regId}:${code}`),
        new Date(Date.now() + OTP_TTL_MIN * 60_000),
      ],
    );
    await sendCode(data.email, data.name, code);
    return { registrationId: regId, throttled: false };
  });

export const verifyQallingSignup = createServerFn({ method: "POST" })
  .validator((d: { registrationId: string; code: string }) => {
    if (!/^\d{6}$/.test(d?.code ?? "")) throw new Error("Kode harus 6 digit");
    if (!/^[0-9a-f-]{36}$/i.test(d?.registrationId ?? ""))
      throw new Error("Pendaftaran tidak valid");
    return d;
  })
  .handler(async ({ data }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { sha256 } = await import("@/lib/email-gateway.server");
    const reg = await executeOne<{
      id: string;
      email: string;
      package_code: string;
      status: string;
    }>("SELECT id, email, package_code, status FROM registrations WHERE id = ?", [
      data.registrationId,
    ]);
    if (!reg || reg.status !== "pending" || !isSignupTier(reg.package_code))
      throw new Error("Pendaftaran tidak ditemukan");
    const otp = await executeOne<{
      id: string;
      expires_at: string;
      attempts: number;
      code_hash: string;
    }>(
      "SELECT * FROM registration_otps WHERE registration_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [reg.id],
    );
    if (!otp) throw new Error("Kode tidak ditemukan. Kirim ulang kode.");
    if (ts(otp.expires_at) < Date.now())
      throw new Error("Kode sudah kedaluwarsa. Kirim ulang kode.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      throw new Error("Terlalu banyak percobaan. Kirim ulang kode.");
    if ((await sha256(`${reg.id}:${data.code}`)) !== otp.code_hash) {
      await execute("UPDATE registration_otps SET attempts = attempts + 1 WHERE id = ?", [otp.id]);
      throw new Error("Kode salah");
    }
    await execute("UPDATE registration_otps SET consumed_at = NOW(6) WHERE id = ?", [otp.id]);
    const { provisionRegistrationCore } = await import("@/lib/provisioning-core.server");
    const result = await provisionRegistrationCore(reg.id, undefined, {
      qallingTierCode: reg.package_code,
    });
    await startSession(result.email);
    return { trialEndsAt: result.trialEndsAt };
  });

export const requestLoginCode = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => {
    if (!validEmail(d?.email)) throw new Error("Email tidak valid");
    return { email: normalizeEmail(d.email) };
  })
  .handler(async ({ data }) => {
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const s = await authSettings();
    if (!s.email_otp_enabled) throw new Error("Masuk lewat kode email sedang dinonaktifkan");
    const profile = await executeOne<{ id: string; full_name: string | null }>(
      "SELECT id, full_name FROM profiles WHERE LOWER(email) = ? LIMIT 1",
      [data.email],
    );
    // Respons sama untuk email terdaftar/tidak, agar akun tidak bisa ditebak.
    if (!profile) return { ok: true };
    const last = await executeOne<{ created_at: string }>(
      "SELECT created_at FROM login_otps WHERE LOWER(email) = ? ORDER BY created_at DESC LIMIT 1",
      [data.email],
    );
    if (last && Date.now() - ts(last.created_at) < OTP_RESEND_SECONDS * 1000) return { ok: true };
    const { randomOtp, sha256 } = await import("@/lib/email-gateway.server");
    const code = randomOtp();
    await execute(
      "UPDATE login_otps SET consumed_at = NOW(6) WHERE LOWER(email) = ? AND consumed_at IS NULL",
      [data.email],
    );
    await execute("INSERT INTO login_otps (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)", [
      uuid(),
      data.email,
      await sha256(`login:${data.email}:${code}`),
      new Date(Date.now() + OTP_TTL_MIN * 60_000),
    ]);
    await sendCode(data.email, profile.full_name ?? "", code);
    return { ok: true };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .validator((d: { email: string; code: string }) => {
    if (!validEmail(d?.email)) throw new Error("Email tidak valid");
    if (!/^\d{6}$/.test(d?.code ?? "")) throw new Error("Kode harus 6 digit");
    return { email: normalizeEmail(d.email), code: d.code };
  })
  .handler(async ({ data }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { sha256 } = await import("@/lib/email-gateway.server");
    const otp = await executeOne<{
      id: string;
      expires_at: string;
      attempts: number;
      code_hash: string;
    }>(
      "SELECT * FROM login_otps WHERE LOWER(email) = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [data.email],
    );
    if (!otp || ts(otp.expires_at) < Date.now())
      throw new Error("Kode tidak berlaku. Kirim ulang kode.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      throw new Error("Terlalu banyak percobaan. Kirim ulang kode.");
    if ((await sha256(`login:${data.email}:${data.code}`)) !== otp.code_hash) {
      await execute("UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?", [otp.id]);
      throw new Error("Kode salah");
    }
    await execute("UPDATE login_otps SET consumed_at = NOW(6) WHERE id = ?", [otp.id]);
    await startSession(data.email);
    return { ok: true };
  });

/** Pengguna yang sudah masuk (mis. Google) tetapi belum punya tenant: buat trial dengan paket pilihannya. */
export const provisionGoogleSignup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { tier?: string; acceptTerms?: boolean }) => {
    if (d?.acceptTerms !== true)
      throw new Error("Anda harus menyetujui syarat & kebijakan untuk mendaftar");
    return { tier: resolveSignupTier(d?.tier) };
  })
  .handler(async ({ data, context }) => {
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    if (
      await executeOne("SELECT 1 AS ok FROM workspace_members WHERE user_id = ? LIMIT 1", [
        context.userId,
      ])
    )
      return { created: false };
    if (
      await executeOne("SELECT 1 AS ok FROM tenants WHERE owner_id = ? LIMIT 1", [context.userId])
    )
      return { created: false };
    const { findAppUserById } = await import("@/lib/auth-jwt.server");
    const u = await findAppUserById(context.userId);
    const email = normalizeEmail(u?.email ?? "");
    if (!email) throw new Error("Akun tidak memiliki email");
    const name = (u?.full_name || email.split("@")[0]).slice(0, 120);
    await execute(
      `INSERT INTO profiles (id, email, full_name) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), full_name = VALUES(full_name)`,
      [context.userId, email, name],
    );
    const regId = uuid();
    await execute(
      `INSERT INTO registrations (id, company_name, contact_name, email, phone, subdomain, package_code, notes, terms_accepted_at)
       VALUES (?, ?, ?, ?, '-', ?, ?, 'qalling-google', NOW(6))`,
      [regId, name, name, email, subdomainFromEmail(email, uuid().slice(0, 6)), data.tier],
    );
    const { provisionRegistrationCore } = await import("@/lib/provisioning-core.server");
    const result = await provisionRegistrationCore(regId, undefined, {
      ownerId: context.userId,
      qallingTierCode: data.tier,
    });
    return { created: true, trialEndsAt: result.trialEndsAt };
  });
