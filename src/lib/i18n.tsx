import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "id";

const STORAGE_KEY = "xperd-lang";

type Dict = Record<string, { en: string; id: string }>;

export const DICT: Dict = {
  "nav.products": { en: "Products", id: "Produk" },
  "nav.solutions": { en: "Solutions", id: "Solusi" },
  "nav.industries": { en: "Industries", id: "Industri" },
  "nav.technology": { en: "Technology", id: "Teknologi" },
  "nav.pricing": { en: "Pricing", id: "Harga" },
  "nav.resources": { en: "Resources", id: "Resources" },
  "nav.about": { en: "About", id: "Tentang" },
  "cta.contactSales": { en: "Contact Sales", id: "Hubungi Sales" },
  "cta.signIn": { en: "Sign In", id: "Masuk" },
  "cta.register": { en: "Sign Up Online", id: "Daftar Online" },
  "cta.openMenu": { en: "Open menu", id: "Buka menu" },
  "footer.products": { en: "Products", id: "Produk" },
  "footer.industries": { en: "Industries", id: "Industri" },
  "footer.company": { en: "Company", id: "Perusahaan" },
  "footer.pricing": { en: "Pricing", id: "Harga" },
  "footer.about": { en: "About XPERD", id: "Tentang XPERD" },
  "footer.technology": { en: "Technology", id: "Teknologi" },
  "footer.solutions": { en: "Solutions", id: "Solusi" },
  "footer.resources": { en: "Resources", id: "Resources" },
  "footer.contact": { en: "Contact Sales", id: "Hubungi Sales" },
  "footer.rights": { en: "All rights reserved.", id: "Seluruh hak cipta dilindungi." },
  "footer.tagline": {
    en: "Built in Indonesia for the world",
    id: "Dibangun di Indonesia untuk dunia",
  },
  "brand.promise": {
    en: "Enterprise Resource Planning for every scale of Indonesian business.",
    id: "Enterprise Resource Planning untuk setiap skala bisnis Indonesia.",
  },
};

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  pick: (en?: string | null, id?: string | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Default Indonesia (BS New 12); pilihan pengguna tersimpan di localStorage.
  const [lang, setLangState] = useState<Lang>("id");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "id" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key) => DICT[key]?.[lang] ?? key,
      pick: (en, id) => (lang === "id" ? (id ?? en ?? "") : (en ?? id ?? "")),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
