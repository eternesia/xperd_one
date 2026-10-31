import { createServerFn } from "@tanstack/react-start";

/** Kontak Qalling yang dikelola Super Admin (Website Content, bagian `qalling.kontak`); publik. */
export const getQallingContactRows = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  return execute<{ key: string; title_id: string | null; title_en: string | null }>(
    "SELECT `key`, title_id, title_en FROM site_content WHERE section = 'qalling.kontak' AND is_published = 1",
  );
});

const PUBLIC_TIERS = ["qalling_lite", "qalling_pro", "qalling_agency"];

/** Katalog publik: hanya tier Qalling aktif (Lite/Pro/Agency) — padanan policy `anon` New 12. */
export const getPublicQallingCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  const rows = await execute<Record<string, unknown>>(
    `SELECT id, code, name, monthly_price, limits, features, sort_order FROM addon_tiers
      WHERE is_active = 1 AND code IN (${PUBLIC_TIERS.map(() => "?").join(",")}) ORDER BY sort_order`,
    PUBLIC_TIERS,
  );
  const j = <T>(v: unknown, d: T): T =>
    v == null ? d : typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    monthly_price: Number(r.monthly_price),
    limits: j<Record<string, number | null>>(r.limits, {}),
    features: j<Record<string, boolean>>(r.features, {}),
    sort_order: Number(r.sort_order),
  }));
});

/** Banner & fitur beranda Qalling yang dikelola Super Admin (section `qalling.hero` / `qalling.features`). */
export const getQallingHomeContentRows = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  return execute<{
    id: string;
    section: string;
    key: string;
    title_id: string | null;
    title_en: string | null;
    body_id: string | null;
    body_en: string | null;
    image_url: string | null;
    link_url: string | null;
  }>(
    `SELECT id, section, \`key\`, title_id, title_en, body_id, body_en, image_url, link_url FROM site_content
      WHERE section IN ('qalling.hero','qalling.features') AND is_published = 1 ORDER BY sort_order`,
  );
});
