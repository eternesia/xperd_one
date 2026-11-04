import { Link } from "@tanstack/react-router";

import { Logo } from "./Logo";
import { ContactItems } from "./ContactItems";
import { BRAND, INDUSTRIES, PRODUCTS } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="surface-navy relative overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="container-x relative py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo onDark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-primary-foreground/65">
              {t("brand.promise")}
            </p>
            <ContactItems
              className="mt-6 space-y-3 text-sm text-primary-foreground/65"
              iconClassName="mt-0.5 h-4 w-4 shrink-0 text-gold"
            />
          </div>

          <FooterColumn title={t("footer.products")}>
            {PRODUCTS.map((p) => (
              <FooterLink key={p.slug} to={`/products/${p.slug}`}>
                {p.name}
              </FooterLink>
            ))}
            <FooterLink to="/pricing">{t("footer.pricing")}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t("footer.industries")}>
            {INDUSTRIES.slice(0, 6).map((i) => (
              <FooterLink key={i.slug} to="/industries">
                {i.name}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title={t("footer.company")}>
            <FooterLink to="/about">{t("footer.about")}</FooterLink>
            <FooterLink to="/technology">{t("footer.technology")}</FooterLink>
            <FooterLink to="/solutions">{t("footer.solutions")}</FooterLink>
            <FooterLink to="/resources">{t("footer.resources")}</FooterLink>
            <FooterLink to="/contact">{t("footer.contact")}</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-primary-foreground/50 md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {BRAND.legal}. {t("footer.rights")}
          </p>
          <p className="tracking-[0.2em] uppercase">{t("footer.tagline")}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">{title}</h3>
      <ul className="mt-5 space-y-3">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-primary-foreground/65 transition-colors hover:text-gold"
      >
        {children}
      </Link>
    </li>
  );
}
