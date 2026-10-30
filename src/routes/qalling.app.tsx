import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  Sparkles,
  LogOut,
  Menu,
  Plus,
  Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWallet } from "@/lib/wallet.functions";
import { logoutAppUser } from "@/lib/auth.functions";
import { emitAuthChange } from "@/hooks/use-session";

import { AppProvider, useApp } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { findModule } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { QallingLogo } from "@/components/qalling/QallingLogo";

export const Route = createFileRoute("/qalling/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Qalling Dashboard" },
      { name: "description", content: "Workspace Qalling CRM dan publikasi sosial." },
      { property: "og:title", content: "Qalling Dashboard" },
      { property: "og:description", content: "Workspace Qalling CRM dan publikasi sosial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <ThemeProvider>
      <AppProvider>
        <QallingShell />
      </AppProvider>
    </ThemeProvider>
  ),
});

const CRM = findModule("crm");

function QallingShell() {
  const { loading, userId, workspaces, activeWorkspace, canViewSubmodule, accessLoading, tenant } =
    useApp();
  const fetchWallet = useServerFn(getWallet);
  const wallet = useQuery({
    queryKey: ["wallet", tenant?.id, 0],
    enabled: Boolean(tenant?.id),
    queryFn: () => fetchWallet({ data: { tenantId: tenant!.id, page: 0 } }),
  });
  const navigate = useNavigate();
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate({ to: "/qalling/login", replace: true });
  }, [loading, userId, navigate]);

  if (loading || accessLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        {lang === "id" ? "Memuat Qalling…" : "Loading Qalling…"}
      </div>
    );
  }
  if (!userId) return null;

  if (workspaces.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-navy dark:text-foreground">
            {lang === "id" ? "Akun belum bisa diaktifkan" : "Account could not be activated"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {lang === "id"
              ? "Terjadi kendala saat menyiapkan workspace. Coba muat ulang halaman ini."
              : "Something went wrong preparing your workspace. Please reload this page."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild variant="gold">
              <a href="/qalling/app">{lang === "id" ? "Muat ulang" : "Reload"}</a>
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                logoutAppUser().then(() => {
                  emitAuthChange();
                  navigate({ to: "/qalling/login", replace: true });
                })
              }
            >
              {lang === "id" ? "Keluar" : "Sign out"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logoutAppUser();
    emitAuthChange();
    navigate({ to: "/qalling/login", replace: true });
  }

  const subs = new Map(
    (CRM?.submodules ?? [])
      .filter((sub) => canViewSubmodule("crm", sub.id))
      .map((sub) => [sub.id, sub]),
  );
  const item = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
      active && "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
    );
  const subLink = (id: string) => {
    const sub = subs.get(id);
    if (!sub) return null;
    return (
      <Link
        key={id}
        to="/qalling/app/$submoduleId"
        params={{ submoduleId: id }}
        className={item(pathname === `/qalling/app/${id}`)}
      >
        {sub.icon && <sub.icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{lang === "id" ? sub.id_ : sub.en}</span>
      </Link>
    );
  };
  const section = (label: string, ids: string[]) => {
    const links = ids.map(subLink).filter(Boolean);
    if (!links.length) return null;
    return (
      <div key={label}>
        <div className="mt-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          {label}
        </div>
        {links}
      </div>
    );
  };
  const id = lang === "id";
  const nav = (
    <nav className="flex flex-col gap-1">
      <Link
        to="/qalling/app"
        activeOptions={{ exact: true }}
        className={item(pathname === "/qalling/app")}
      >
        <LayoutDashboard className="h-4 w-4" />
        {id ? "Beranda" : "Home"}
      </Link>
      <Link to="/qalling/app/calendar" className={item(pathname === "/qalling/app/calendar")}>
        <CalendarRange className="h-4 w-4" />
        {id ? "Kalender Konten" : "Content Calendar"}
      </Link>
      {subLink("social-dashboard")}
      {section(id ? "Studio Konten" : "Content Studio", [
        "ideas",
        "post-scheduler",
        "media",
        "campaigns",
      ])}
      {section(id ? "Percakapan" : "Conversations", [
        "inbox",
        "comments",
        "automations",
        "broadcast",
        "wa-gateway",
        "templates",
      ])}
      {section(id ? "Penjualan" : "Sales", [
        "leads",
        "pipeline",
        "contacts",
        "follow-ups",
        "targets",
      ])}
      {section("Tender", ["tenders", "doc-library"])}
      <div className="mt-3 border-t border-border pt-3">
        {subLink("social-accounts")}
        <Link to="/qalling/app/ai" className={item(pathname === "/qalling/app/ai")}>
          <Sparkles className="h-4 w-4" />
          {id ? "Integrasi AI" : "AI Integration"}
        </Link>
        <Link to="/qalling/app/billing" className={item(pathname === "/qalling/app/billing")}>
          <CreditCard className="h-4 w-4" />
          {id ? "Tagihan & Saldo" : "Billing & Balance"}
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[86vw] max-w-sm overflow-y-auto p-4">
                <SheetHeader className="pr-10 text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <QallingLogo className="w-40" />
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6" onClick={() => setMobileMenuOpen(false)}>
                  {nav}
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/qalling/app" className="flex items-center gap-2">
              <QallingLogo className="w-28 sm:w-36" />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/qalling/app/billing"
              search={{ tab: "saldo" }}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium tabular-nums hover:border-gold"
            >
              <Wallet className="h-4 w-4 text-gold" />
              {wallet.data
                ? new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    maximumFractionDigits: 0,
                  }).format(wallet.data.balance)
                : "—"}
            </Link>
            <Button asChild size="sm" variant="gold" className="hidden sm:inline-flex">
              <Link to="/qalling/app/billing" search={{ tab: "saldo" }}>
                <Plus />
                Top up
              </Link>
            </Button>
            <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:block">
              {activeWorkspace?.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label={lang === "id" ? "Keluar" : "Sign out"}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-border bg-card p-4 md:block">
          {nav}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
