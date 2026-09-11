import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, ArrowRight } from "lucide-react";

import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-navy data-[status=active]:text-navy"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          <Button asChild variant="outline" size="sm">
            <Link to="/contact">{t("cta.contactSales")}</Link>
          </Button>
          <Button asChild variant="gold" size="sm">
            <Link to="/auth" search={{ next: undefined }}>
              {t("cta.signIn")} / {t("cta.register")} <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("cta.openMenu")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <div className="mt-8 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-base font-medium text-navy transition-colors hover:bg-secondary"
                  >
                    {t(link.key)}
                  </Link>
                ))}
                <div className="mt-6 flex flex-col gap-2">
                  <Button asChild variant="gold" size="lg" onClick={() => setOpen(false)}>
                    <Link to="/auth" search={{ next: undefined }}>
                      {t("cta.signIn")} / {t("cta.register")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" onClick={() => setOpen(false)}>
                    <Link to="/contact">{t("cta.contactSales")}</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
