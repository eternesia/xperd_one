import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Check,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Moon,
  Plus,
  ShoppingCart,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/lib/app-context";
import { logoutAppUser } from "@/lib/auth.functions";
import { emitAuthChange } from "@/hooks/use-session";
import { useI18n } from "@/lib/i18n";
import { APP_MODULES, LAUNCHER_UTILITIES } from "@/lib/modules";
import { NEW_DOC_EVENT } from "@/lib/new-doc-event";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Dokumen yang bisa dibuat cepat lewat tombol "+" (modul, sub modul, label). */
const QUICK_DOCS = [
  { moduleId: "sales", submoduleId: "quotations", en: "Quotation", id_: "Penawaran" },
  { moduleId: "sales", submoduleId: "sales-orders", en: "Sales Order", id_: "Pesanan Penjualan" },
  { moduleId: "sales", submoduleId: "ar-invoices", en: "Sales Invoice", id_: "Faktur Penjualan" },
  {
    moduleId: "procurement",
    submoduleId: "purchase-orders",
    en: "Purchase Order",
    id_: "Pesanan Pembelian",
  },
] as const;

/**
 * Navigasi bawah ala aplikasi HP untuk ERP (hanya di bawah breakpoint lg):
 * Beranda · Penjualan · + (dokumen baru) · Laporan · Lainnya (menu modul).
 */
export function MobileBottomNav({ workspaceId }: { workspaceId: string }) {
  const { lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspace,
    email,
    setActiveWorkspaceId,
    canViewModule,
    canEditSubmodule,
    workspaceRole,
  } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const id = lang === "id";

  const base = `/app/w/${workspaceId}`;
  const path = pathname.replace(/\/+$/, "");
  const modules = useMemo(
    () => APP_MODULES.filter((m) => !m.disabled && canViewModule(m.id)),
    [canViewModule],
  );
  // Sama dengan beranda: Tim/Pengaturan/Billing hanya untuk pengelola workspace.
  const isManager = workspaceRole === "owner" || workspaceRole === "admin";
  const quickDocs = QUICK_DOCS.filter((d) => canEditSubmodule(d.moduleId, d.submoduleId));

  const tabs = [
    { key: "home", to: base, icon: Home, label: id ? "Beranda" : "Home", show: true, exact: true },
    {
      key: "sales",
      to: `${base}/sales`,
      icon: ShoppingCart,
      label: id ? "Penjualan" : "Sales",
      show: canViewModule("sales"),
      exact: false,
    },
    {
      key: "reporting",
      to: `${base}/reporting`,
      icon: BarChart3,
      label: id ? "Laporan" : "Reports",
      show: canViewModule("reporting"),
      exact: false,
    },
  ];
  const isActive = (t: { to: string; exact: boolean }) =>
    t.exact ? path === t.to : path === t.to || path.startsWith(`${t.to}/`);

  const tabLink = (t: (typeof tabs)[number]) => {
    const active = isActive(t);
    const cls =
      "flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground";
    const inner = (
      <>
        <span
          className={cn(
            "flex h-7 w-12 items-center justify-center rounded-full",
            active && "bg-primary/10 text-primary",
          )}
        >
          <t.icon className="h-5 w-5" />
        </span>
        {t.label}
      </>
    );
    // Tab yang tidak boleh dilihat peran ini tetap menempati kolomnya agar tombol "+" tetap di tengah.
    if (!t.show) return <span key={t.key} aria-hidden />;
    return (
      <Link
        key={t.key}
        to={t.to as "/app"}
        className={cn(cls, active && "font-medium text-primary")}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  };

  const createDoc = (d: (typeof QUICK_DOCS)[number]) => {
    setNewOpen(false);
    const target = `${base}/${d.moduleId}/${d.submoduleId}`;
    if (path === target) {
      window.dispatchEvent(new Event(NEW_DOC_EVENT));
      return;
    }
    navigate({
      to: "/app/w/$workspaceId/$moduleId/$submoduleId",
      params: { workspaceId, moduleId: d.moduleId, submoduleId: d.submoduleId },
      search: { new: 1 } as never,
    });
  };

  const signOut = async () => {
    await logoutAppUser();
    emitAuthChange();
    toast.success(id ? "Berhasil keluar" : "Signed out");
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  const rowCls = "flex min-h-12 items-center gap-3 rounded-xl px-2 text-[15px] active:bg-muted";

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl print:hidden lg:hidden"
        aria-label={id ? "Navigasi bawah" : "Bottom navigation"}
      >
        <div className="grid h-[68px] grid-cols-5 items-center px-1">
          {tabLink(tabs[0])}
          {tabLink(tabs[1])}
          {quickDocs.length ? (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-primary"
              aria-label={id ? "Buat dokumen baru" : "Create new document"}
            >
              <span className="-mt-7 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                <Plus className="h-6 w-6" />
              </span>
              {id ? "Baru" : "New"}
            </button>
          ) : (
            <span aria-hidden />
          )}
          {tabLink(tabs[2])}
          <button
            type="button"
            aria-label={id ? "Lainnya" : "More"}
            onClick={() => setMoreOpen(true)}
            className="flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="h-5 w-5" />
            </span>
            {id ? "Lainnya" : "More"}
          </button>
        </div>
      </nav>

      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-3xl p-0 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{id ? "Buat dokumen baru" : "Create new document"}</SheetTitle>
          </SheetHeader>
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          <p className="px-5 pb-1 pt-4 text-sm font-semibold">
            {id ? "Buat dokumen baru" : "Create new document"}
          </p>
          <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {quickDocs.map((d) => (
              <button
                key={`${d.moduleId}/${d.submoduleId}`}
                type="button"
                onClick={() => createDoc(d)}
                className={cn(rowCls, "w-full text-left")}
              >
                <Plus className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{id ? d.id_ : d.en}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[72dvh] flex-col gap-0 rounded-t-3xl p-0 [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{id ? "Menu lainnya" : "More"}</SheetTitle>
          </SheetHeader>
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {(activeWorkspace?.name ?? "X").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{activeWorkspace?.name}</span>
              <span className="block truncate text-sm text-muted-foreground">{email}</span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2">
            {workspaces.length > 1 && (
              <div className="pt-3">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  {id ? "Ganti workspace" : "Switch workspace"}
                </p>
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={cn(rowCls, "w-full text-left")}
                    onClick={() => {
                      setMoreOpen(false);
                      setActiveWorkspaceId(w.id);
                      navigate({ to: "/app/w/$workspaceId", params: { workspaceId: w.id } });
                    }}
                  >
                    <span className="flex-1 truncate">{w.name}</span>
                    {w.id === activeWorkspace?.id && <Check className="h-4 w-4 text-gold" />}
                  </button>
                ))}
              </div>
            )}
            <div className="pt-3">
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {id ? "Modul" : "Modules"}
              </p>
              {modules.map((m) => (
                <Link
                  key={m.id}
                  to="/app/w/$workspaceId/$moduleId"
                  params={{ workspaceId, moduleId: m.id }}
                  onClick={() => setMoreOpen(false)}
                  className={rowCls}
                >
                  <m.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{id ? m.id_ : m.en}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                </Link>
              ))}
            </div>
            {isManager && (
              <div className="pt-3">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  {id ? "Akun & pengaturan" : "Account & settings"}
                </p>
                {LAUNCHER_UTILITIES.map((u) => (
                  <Link
                    key={u.id}
                    to={u.to}
                    params={{ workspaceId }}
                    onClick={() => setMoreOpen(false)}
                    className={rowCls}
                  >
                    <u.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{id ? u.id_ : u.en}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLang(id ? "en" : "id")}
                aria-label="Language"
              >
                {id ? "ID" : "EN"}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              {id ? "Keluar" : "Sign out"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
