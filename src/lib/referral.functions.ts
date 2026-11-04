import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const getMyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { referralMyCode } = await import("@/lib/referral.server");
    return referralMyCode(context.userId);
  });

export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { code: string }) => {
    if (!/^[A-Za-z0-9]{4,16}$/.test(d?.code ?? "")) throw new Error("Kode tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { referralClaim } = await import("@/lib/referral.server");
    return { claimed: await referralClaim(context.userId, data.code) };
  });

/** Pengaturan komisi + daftar referral tenant (hanya anggota tenant). */
export const getReferralOverview = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { tenantId: string }) => {
    if (!d?.tenantId) throw new Error("Tenant wajib");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { userCanAccessTenant } = await import("@/lib/auth-context.server");
    if (!(await userCanAccessTenant(data.tenantId, context.userId))) throw new Error("Forbidden");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const s = await executeOne<{
      enabled: number;
      percent: number;
      max_idr: number;
      min_topup_idr: number;
    }>(
      "SELECT enabled, percent, max_idr, min_topup_idr FROM referral_settings WHERE singleton = 1",
    );
    const rows = await execute<{
      referred_tenant_id: string;
      status: string;
      commission_idr: number;
      created_at: string;
    }>(
      `SELECT referred_tenant_id, status, commission_idr, created_at FROM referrals
        WHERE referrer_tenant_id = ? ORDER BY created_at DESC LIMIT 200`,
      [data.tenantId],
    );
    return {
      settings: s
        ? {
            enabled: Boolean(s.enabled),
            percent: Number(s.percent),
            max_idr: Number(s.max_idr),
            min_topup_idr: Number(s.min_topup_idr),
          }
        : null,
      rows: rows.map((r) => ({
        referred_tenant_id: r.referred_tenant_id,
        status: r.status,
        commission_idr: Number(r.commission_idr),
        created_at: new Date(`${String(r.created_at).replace(" ", "T")}Z`).toISOString(),
      })),
    };
  });

export type ReferralSettings = {
  enabled: boolean;
  percent: number;
  max_idr: number;
  min_topup_idr: number;
};

/** Pengaturan program referral (hanya Super Admin). */
export const getReferralSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }): Promise<ReferralSettings> => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const r = await executeOne<Record<string, unknown>>(
      "SELECT enabled, percent, max_idr, min_topup_idr FROM referral_settings WHERE singleton = 1",
    );
    return {
      enabled: Boolean(Number(r?.enabled ?? 1)),
      percent: Number(r?.percent ?? 10),
      max_idr: Number(r?.max_idr ?? 100000),
      min_topup_idr: Number(r?.min_topup_idr ?? 50000),
    };
  });

export const saveReferralSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: ReferralSettings) => d)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const percent = Number(data.percent);
    const max = Number(data.max_idr);
    const min = Number(data.min_topup_idr);
    if (!(percent >= 0 && percent <= 100)) throw new Error("Persentase harus 0–100");
    if (!(max >= 0) || !(min >= 0) || !Number.isFinite(max) || !Number.isFinite(min))
      throw new Error("Nominal tidak boleh negatif");
    await execute(
      "UPDATE referral_settings SET enabled = ?, percent = ?, max_idr = ?, min_topup_idr = ? WHERE singleton = 1",
      [data.enabled ? 1 : 0, percent, Math.round(max), Math.round(min)],
    );
    return { ok: true };
  });

/* ---------- Materi promosi referral (Super Admin mengatur; pengguna Qalling menyalin/membagikan) ---------- */
export const PROMO_DEFAULTS = {
  whatsapp:
    "Aku pakai Qalling buat jadwal posting, kelola komentar dan DM, sampai follow-up leads. Cocok buat bisnis dan pengelola medsos! Coba lewat link-ku: {link}",
  social:
    "Konten jalan, percakapan tertata, peluang closing nggak terlewat. Kelola medsos dan leads bareng Qalling. Yuk coba: {link}\nKode referral: {code}",
};
export type ReferralPromo = {
  enabled: boolean;
  whatsapp: string;
  social: string;
  poster_url: string | null;
};

async function loadPromo(): Promise<ReferralPromo> {
  const { execute } = await import("@/integrations/mysql/pool");
  const rows = await execute<{
    key: string;
    body_id: string | null;
    image_url: string | null;
    is_published: number;
  }>(
    "SELECT `key`, body_id, image_url, is_published FROM site_content WHERE section = 'qalling.referral'",
  );
  const w = rows.find((r) => r.key === "whatsapp");
  const s = rows.find((r) => r.key === "social");
  return {
    // Belum pernah diatur = aktif dengan teks bawaan; dimatikan bila salah satu entri tidak dipublikasikan.
    enabled: rows.length === 0 ? true : rows.every((r) => Number(r.is_published) === 1),
    whatsapp: w?.body_id?.trim() || PROMO_DEFAULTS.whatsapp,
    social: s?.body_id?.trim() || PROMO_DEFAULTS.social,
    poster_url: s?.image_url || null,
  };
}

export const getReferralPromo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => loadPromo());

export const getReferralPromoAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    return loadPromo();
  });

export const saveReferralPromo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { enabled: boolean; whatsapp: string; social: string }) => {
    const whatsapp = String(d?.whatsapp ?? "").trim();
    const social = String(d?.social ?? "").trim();
    if (!whatsapp || !social)
      throw new Error("Pesan WhatsApp dan caption media sosial wajib diisi.");
    if (whatsapp.length > 2000 || social.length > 2000)
      throw new Error("Teks maksimal 2000 karakter.");
    return { enabled: Boolean(d.enabled), whatsapp, social };
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    for (const [key, text, order] of [
      ["whatsapp", data.whatsapp, 1],
      ["social", data.social, 2],
    ] as const) {
      await execute(
        `INSERT INTO site_content (id, section, \`key\`, title_en, title_id, body_en, body_id, sort_order, is_published)
         VALUES (?, 'qalling.referral', ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE body_en = VALUES(body_en), body_id = VALUES(body_id), is_published = VALUES(is_published)`,
        [uuid(), key, key, key, text, text, order, data.enabled ? 1 : 0],
      );
    }
    return { ok: true };
  });

const POSTER_MIME = ["image/png", "image/jpeg", "image/webp"];
export const uploadReferralPoster = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { mime: string; base64: string }) => {
    if (!POSTER_MIME.includes(d?.mime)) throw new Error("Poster harus PNG, JPG, atau WebP.");
    if (typeof d.base64 !== "string" || !d.base64) throw new Error("Berkas kosong.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024)
      throw new Error("Ukuran poster maksimal 5 MB.");
    const magic = bytes.subarray(0, 12);
    const okMagic =
      (data.mime === "image/png" && magic.subarray(0, 4).toString("hex") === "89504e47") ||
      (data.mime === "image/jpeg" && magic.subarray(0, 3).toString("hex") === "ffd8ff") ||
      (data.mime === "image/webp" &&
        magic.subarray(0, 4).toString() === "RIFF" &&
        magic.subarray(8, 12).toString() === "WEBP");
    if (!okMagic) throw new Error("Isi berkas tidak sesuai tipe gambar.");
    await execute(
      `INSERT INTO site_assets (asset_key, mime, size_bytes, data) VALUES ('referral-poster', ?, ?, ?)
       ON DUPLICATE KEY UPDATE mime = VALUES(mime), size_bytes = VALUES(size_bytes), data = VALUES(data)`,
      [data.mime, bytes.length, bytes],
    );
    const url = `/api/public/site-asset/referral-poster?v=${Date.now()}`;
    await execute(
      `INSERT INTO site_content (id, section, \`key\`, title_en, title_id, image_url, sort_order, is_published)
       VALUES (?, 'qalling.referral', 'social', 'social', 'social', ?, 2, 1)
       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url)`,
      [uuid(), url],
    );
    return { url };
  });

export const deleteReferralPoster = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute("DELETE FROM site_assets WHERE asset_key = 'referral-poster'");
    await execute(
      "UPDATE site_content SET image_url = NULL WHERE section = 'qalling.referral' AND `key` = 'social'",
    );
    return { ok: true };
  });
