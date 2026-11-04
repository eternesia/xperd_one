// Kontak situs XPERD (section `contact`) dan Qalling (section `qalling.kontak`), BS New 16: nilai bawaan di kode; Super Admin menimpanya di Admin → Konten Website.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const CONTACT_KEYS = ["email", "phone", "whatsapp", "address", "hours", "website"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export type XperdContactValues = Partial<Record<ContactKey, string>>;
export type WebsiteSite = "xperd" | "qalling";
const SECTION: Record<WebsiteSite, string> = { xperd: "contact", qalling: "qalling.kontak" };
const siteOf = (s: unknown): WebsiteSite => (s === "qalling" ? "qalling" : "xperd");

async function readStored(site: WebsiteSite = "xperd"): Promise<XperdContactValues> {
  const { execute } = await import("@/integrations/mysql/pool");
  const rows = await execute<{ key: string; title_id: string | null; title_en: string | null }>(
    "SELECT `key`, title_id, title_en FROM site_content WHERE section = ? AND is_published = 1",
    [SECTION[site]],
  );
  const out: XperdContactValues = {};
  for (const r of rows) {
    const v = (r.title_id ?? r.title_en)?.trim();
    if ((CONTACT_KEYS as readonly string[]).includes(r.key) && v) out[r.key as ContactKey] = v;
  }
  return out;
}

/** Publik (dipakai footer, Kontak, Tentang): hanya nilai yang diisi admin; sisanya memakai bawaan di klien. */
export const getWebsiteContacts = createServerFn({ method: "GET" })
  .validator((d: { site?: WebsiteSite } | undefined) => ({ site: siteOf(d?.site) }))
  .handler(async ({ data }) => readStored(data.site));
export const getXperdContact = createServerFn({ method: "GET" }).handler(async () =>
  readStored("xperd"),
);

export const saveXperdContact = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { site?: WebsiteSite; values: XperdContactValues }) => {
    const out: XperdContactValues = {};
    for (const k of CONTACT_KEYS) {
      const v = String(d?.values?.[k] ?? "").trim();
      if (v.length > 255) throw new Error("Maksimal 255 karakter per kolom.");
      out[k] = v;
    }
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))
      throw new Error("Format email tidak valid.");
    if (out.website && !/^https?:\/\//i.test(out.website))
      throw new Error("Website harus diawali http:// atau https://");
    return { site: siteOf(d?.site), values: out };
  })
  .handler(async ({ data: input, context }) => {
    const data = input.values;
    const section = SECTION[input.site];
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    let i = 0;
    for (const k of CONTACT_KEYS) {
      i += 1;
      const v = data[k] ?? "";
      if (!v) {
        await execute("DELETE FROM site_content WHERE section = ? AND `key` = ?", [section, k]);
        continue;
      }
      await execute(
        `INSERT INTO site_content (id, section, \`key\`, title_en, title_id, sort_order, is_published)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE title_en = VALUES(title_en), title_id = VALUES(title_id), is_published = 1`,
        [uuid(), section, k, v, v, i],
      );
    }
    return { ok: true };
  });
