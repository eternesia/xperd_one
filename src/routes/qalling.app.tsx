import { QallingTrialAlert } from "@/components/qalling/QallingTrialAlert";
import { useEffect, useState } from "react";
import { clearStoredReferral, getStoredReferral } from "@/lib/referral-capture";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarRange,
  ChevronDown,
  FileBarChart,
  BookOpen,
  Gift,
  CalendarDays,
  MessageSquare,
  UserCog,
  UsersRound,
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
  Sparkles,
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
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  useEffect(() => {
    setCollapsed(localStorage.getItem("qalling-sidebar-collapsed") === "1");
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("qalling-sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getWallet);
  const walletQuery = useQuery({
    queryKey: ["wallet", tenant?.id, 0],
    queryFn: () => fetchWallet({ data: { tenantId: tenant!.id, page: 0 } }),
    enabled: !!tenant?.id,
    staleTime: 60_000,
  });
  const balance = walletQuery.data?.balance;

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate({ to: "/qalling/login", replace: true });
  }, [loading, userId, navigate]);

  // Attach a referral code captured on the public site once the account has a workspace.
  useEffect(() => {
    if (!userId || workspaces.length === 0) return;
    const ref = getStoredReferral();
    if (!ref) return;
    void claimReferral({ data: { code: ref } })
      .catch(() => undefined)
      .then(() => clearStoredReferral());
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
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sky-100 hover:text-foreground dark:hover:bg-secondary",
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
    // Grup utama terbuka; grup lain terbuka bila berisi halaman yang sedang dibuka (BS New 14).
    const isOpen =
      openGroups[key] ??
      (["chat", "content", "sales"].includes(key) ||
        links.some((l) => {
          const k = (l as { key?: string }).key;
          return !!k && pathname.endsWith(`/${k}`);
        }));
    return (
      <div key={key} className="mt-2">
        <button
          type="button"
          onClick={() => setOpenGroups((g) => ({ ...g, [key]: !isOpen }))}
          className="qs-label flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
        >
          {label}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")}
          />
        </button>
        {isOpen && <div className="flex flex-col gap-0.5">{links}</div>}
      </div>
    );
  };
  const settingsItems = [
    ...(subs.has("social-accounts")
      ? [
          {
            to: "/qalling/app/social-accounts",
            icon: Share2,
            label: id ? "Akun Sosial" : "Social Accounts",
          },
        ]
      : []),
    ...(subs.has("team")
      ? [
          {
            to: "/qalling/app/team",
            icon: UsersRound,
            label: id ? "Tim & Anggota" : "Team & Members",
          },
        ]
      : []),
    ...(subs.has("ai")
      ? [
          {
            to: "/qalling/app/ai",
            icon: Sparkles,
            label: id ? "Integrasi AI & MCP" : "AI & MCP Integration",
          },
        ]
      : []),
    {
      to: "/qalling/app/profile",
      icon: UserCog,
      label: id ? "Profil & Rekening" : "Profile & Bank",
    },
    {
      to: "/qalling/app/billing",
      icon: CreditCard,
      label: id ? "Tagihan & Saldo" : "Billing & Balance",
    },
    { to: "/qalling/app/referral", icon: Gift, label: "Referral" },
    { to: "/qalling/docs", icon: BookOpen, label: id ? "Dokumentasi" : "Documentation" },
  ];
  const settingsLinks = settingsItems.map((s) => link(s.to, s.icon, s.label));
  const nav = (
    <nav className="flex flex-col gap-0.5">
      <Link
        to="/qalling/app"
        activeOptions={{ exact: true }}
        className={item(pathname === "/qalling/app")}
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        <span className="qs-label">{id ? "Beranda" : "Home"}</span>
      </Link>
      {section("chat", id ? "Percakapan" : "Conversations", ["inbox", "comments"])}
      {section("content", id ? "Konten" : "Content", [
        "calendar",
        "post-scheduler",
        "media",
        "ideas",
      ])}
      {section("sales", id ? "Penjualan" : "Sales", [
        "leads",
        "pipeline",
        "contacts",
        "follow-ups",
      ])}
      {section("reports", id ? "Analitik" : "Analytics", [
        "social-dashboard",
        "funnel",
        "attribution",
        "targets",
      ])}
      {section("clients", "Agency", ["clients", "reports", "agency"])}
      {section("tools", id ? "Otomasi & Pesan" : "Automation & Messaging", [
        "automations",
        "broadcast",
        "templates",
        "campaigns",
        "wa-gateway",
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
            {tenant?.id && (
              <Link
                to="/qalling/app/billing"
                data-testid="qalling-balance"
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                aria-label={
                  lang === "id" ? "Saldo, isi ulang di Tagihan" : "Balance, top up in Billing"
                }
              >
                <Wallet className="h-3.5 w-3.5 text-primary" />
                <span>
                  {balance === undefined
                    ? "…"
                    : new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        maximumFractionDigits: 0,
                      }).format(balance)}
                </span>
                <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  <Plus className="h-3 w-3" />
                  <span className="hidden sm:inline">Top up</span>
                </span>
              </Link>
            )}
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
        <aside
          className={cn(
            "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-sky-100 bg-sky-50/80 transition-[width] md:flex dark:border-border dark:bg-card",
            collapsed ? "w-16 [&_.qs-label]:hidden [&_a]:justify-center" : "w-64",
          )}
        >
          <div className="flex-1 overflow-y-auto p-3">{nav}</div>
          <div className="flex items-center gap-1 border-t border-border p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-left hover:bg-secondary"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(activeWorkspace?.name ?? "Q").charAt(0).toUpperCase()}
                  </span>
                  <span className="qs-label min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {activeWorkspace?.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {tenant?.name ?? ""}
                    </span>
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
                  <DropdownMenuItem
                    key={s.to}
                    onSelect={() => navigate({ to: s.to as "/qalling/app" })}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut className="h-4 w-4" />
                  {id ? "Keluar" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"}
              title={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"}
              className={cn(collapsed && "hidden")}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Perbesar sidebar"
              title="Perbesar sidebar"
              className="mx-auto mb-2"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
        </aside>
        <main className="min-w-0 flex-1 p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6 lg:p-10">
          <QallingTrialAlert />
          <Outlet />
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label={id ? "Navigasi bawah" : "Bottom navigation"}
      >
        <div className="grid h-16 grid-cols-5 items-center">
          {[
            { to: "/qalling/app", icon: LayoutDashboard, label: id ? "Beranda" : "Home" },
            { to: "/qalling/app/calendar", icon: CalendarDays, label: id ? "Jadwal" : "Schedule" },
            {
              to: "/qalling/app/post-scheduler",
              icon: Plus,
              label: id ? "Posting" : "Post",
              primary: true,
            },
            { to: "/qalling/app/inbox", icon: MessageSquare, label: id ? "Pesan" : "Inbox" },
          ].map((b) => {
            const active = pathname === b.to;
            return b.primary ? (
              <Link
                key={b.to}
                to={b.to as "/qalling/app"}
                className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-primary"
              >
                <span className="-mt-7 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                  <b.icon className="h-6 w-6" />
                </span>
                {b.label}
              </Link>
            ) : (
              <Link
                key={b.to}
                to={b.to as "/qalling/app"}
                className={cn(
                  "flex flex-col items-center gap-1 text-[11px] text-muted-foreground",
                  active && "font-medium text-primary",
                )}
              >
                <b.icon className="h-5 w-5" />
                {b.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            Menu
          </button>
        </div>
      </nav>
    </div>
  );
}
