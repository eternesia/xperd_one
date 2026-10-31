import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarRange,
  ChevronDown,
  FileBarChart,
  Gift,
  Users,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWallet } from "@/lib/wallet.functions";
import { provisionGoogleSignup } from "@/lib/qalling-auth.functions";
import { SIGNUP_TIER_KEY } from "@/components/qalling/qalling-auth";

import { AppProvider, useApp } from "@/lib/app-context";
import { QallingPreferences } from "@/components/qalling/QallingPreferences";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logoutAppUser } from "@/lib/auth.functions";
import { emitAuthChange } from "@/hooks/use-session";
import { claimReferral } from "@/lib/referral.functions";
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
    <AppProvider>
      <QallingShell />
    </AppProvider>
  ),
});

const CRM = findModule("crm");

function QallingShell() {
  const {
    loading,
    userId,
    workspaces,
    activeWorkspace,
    canViewSubmodule,
    accessLoading,
    tenant,
    email: userEmail,
    refresh,
  } = useApp();
  const provision = useServerFn(provisionGoogleSignup);
  const [autoState, setAutoState] = useState<"idle" | "working" | "failed">("idle");
  const navigate = useNavigate();
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(localStorage.getItem("qalling-sidebar-collapsed") === "1"); }, []);
  const toggleCollapsed = () => setCollapsed((c) => { localStorage.setItem("qalling-sidebar-collapsed", c ? "0" : "1"); return !c; });
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate({ to: "/qalling/login", replace: true });
  }, [loading, userId, navigate]);

  // Attach a referral code captured on the public site once the account has a workspace.
  useEffect(() => {
    if (!userId || workspaces.length === 0) return;
    const ref = localStorage.getItem("qalling_ref");
    if (!ref) return;
    void claimReferral({ data: { code: ref } })
      .catch(() => undefined)
      .then(() => localStorage.removeItem("qalling_ref"));
  }, [userId, workspaces.length]);

  // The plan is chosen once at signup; if the account still has no workspace, activate it automatically.
  useEffect(() => {
    if (loading || accessLoading || !userId || workspaces.length > 0 || autoState !== "idle")
      return;
    setAutoState("working");
    const tier = sessionStorage.getItem(SIGNUP_TIER_KEY) || "qalling_lite";
    provision({ data: { tier, acceptTerms: true } })
      .then(async () => {
        sessionStorage.removeItem(SIGNUP_TIER_KEY);
        await refresh();
        setAutoState("idle");
      })
      .catch(() => setAutoState("failed"));
  }, [loading, accessLoading, userId, workspaces.length, autoState, provision, refresh]);

  if (loading || accessLoading || (userId && workspaces.length === 0 && autoState !== "failed")) {
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
        <span className="truncate qs-label">{lang === "id" ? sub.id_ : sub.en}</span>
      </Link>
    );
  };
  const id = lang === "id";
  const link = (to: string, Icon: typeof Users, label: string) => (
    <Link key={to} to={to as "/qalling/app"} className={item(pathname === to)} title={label}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate qs-label">{label}</span>
    </Link>
  );
  const section = (key: string, label: string, entries: (React.ReactNode | string)[]) => {
    const links = entries.map((e) => (typeof e === "string" ? subLink(e) : e)).filter(Boolean);
    if (!links.length) return null;
    const isOpen = openGroups[key] ?? true;
    return (
      <div key={key} className="mt-2">
        <button
          type="button"
          onClick={() => setOpenGroups((g) => ({ ...g, [key]: !isOpen }))}
          className="qs-label flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
        >
          {label}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && <div className="flex flex-col gap-0.5">{links}</div>}
      </div>
    );
  };
  const settingsItems = [
    ...(subs.has("social-accounts") ? [{ to: "/qalling/app/social-accounts", icon: Share2, label: id ? "Akun Sosial" : "Social Accounts" }] : []),
    { to: "/qalling/app/billing", icon: CreditCard, label: id ? "Tagihan & Saldo" : "Billing & Balance" },
    { to: "/qalling/app/referral", icon: Gift, label: "Referral" },
  ];
  const settingsLinks = settingsItems.map((s) => link(s.to, s.icon, s.label));
  const nav = (
    <nav className="flex flex-col gap-0.5">
      <Link to="/qalling/app" activeOptions={{ exact: true }} className={item(pathname === "/qalling/app")}>
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        <span className="qs-label">{id ? "Beranda" : "Home"}</span>
      </Link>
      {subLink("social-dashboard")}
      {subLink("leads")}
      {section("sales", id ? "Penjualan" : "Sales", ["pipeline", "contacts", "follow-ups", "targets"])}
      {section("content", id ? "Konten" : "Content", [
        link("/qalling/app/calendar", CalendarRange, id ? "Kalender" : "Calendar"),
        "post-scheduler", "ideas", "media", "campaigns",
      ])}
      {section("chat", id ? "Percakapan" : "Conversations", ["inbox", "comments", "automations", "broadcast", "wa-gateway", "templates"])}
      {section("clients", id ? "Klien & Laporan" : "Clients & Reports", [
        link("/qalling/app/clients", Users, id ? "Klien & Brand" : "Clients & Brands"),
        link("/qalling/app/reports", FileBarChart, id ? "Laporan" : "Reports"),
      ])}
      {section("tender", "Tender", ["tenders", "doc-library"])}
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
                  <div className="mt-4 border-t border-border pt-3">{settingsLinks}</div>
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/qalling/app" className="flex items-center gap-2">
              <QallingLogo className="w-28 sm:w-36" />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <QallingPreferences />
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
        <aside className={cn("sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-border bg-card transition-[width] md:flex", collapsed ? "w-16 [&_.qs-label]:hidden [&_a]:justify-center" : "w-64")}>
          <div className="flex-1 overflow-y-auto p-3">{nav}</div>
          <div className="flex items-center gap-1 border-t border-border p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-left hover:bg-secondary">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{(activeWorkspace?.name ?? "Q").charAt(0).toUpperCase()}</span>
                  <span className="qs-label min-w-0">
                    <span className="block truncate text-sm font-medium">{activeWorkspace?.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tenant?.name ?? ""}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                  <p className="truncate font-medium">{activeWorkspace?.name}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {settingsItems.map((s) => (
                  <DropdownMenuItem key={s.to} onSelect={() => navigate({ to: s.to as "/qalling/app" })}>
                    <s.icon className="h-4 w-4" />{s.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}><LogOut className="h-4 w-4" />{id ? "Keluar" : "Sign out"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={toggleCollapsed} aria-label={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"} title={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"} className={cn(collapsed && "hidden")}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          {collapsed && (
            <Button variant="ghost" size="icon" onClick={toggleCollapsed} aria-label="Perbesar sidebar" title="Perbesar sidebar" className="mx-auto mb-2">
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
