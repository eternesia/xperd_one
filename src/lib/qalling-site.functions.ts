import { createServerFn } from "@tanstack/react-start";

/** Kontak Qalling yang dikelola Super Admin (Website Content, bagian `qalling.kontak`); publik. */
export const getQallingContactRows = createServerFn({ method: "GET" }).handler(async () => {
  const { execute } = await import("@/integrations/mysql/pool");
  return execute<{ key: string; title_id: string | null; title_en: string | null }>(
    "SELECT `key`, title_id, title_en FROM site_content WHERE section = 'qalling.kontak' AND is_published = 1",
  );
});
