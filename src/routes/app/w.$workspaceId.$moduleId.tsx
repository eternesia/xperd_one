import { useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, LayoutDashboard, Loader2, Lock, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SubmoduleNav } from "@/components/app/SubmoduleNav";
import { useTenantAddons } from "@/lib/addons";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { findModule } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId")({
  component: ModuleShell,
});

function ModuleShell() {
  const { workspaceId, moduleId } = Route.useParams();
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mod = findModule(moduleId);
  const { hasAddon, loading: addonsLoading } = useTenantAddons();
  // #59 (BS New 3): penegakan izin modul/submodul.
  const { accessLoading, canViewModule, canViewSubmodule, workspaceRole } = useApp();
  // BS New 11: penerima tugas XPro (Staff/Viewer) bekerja dari Kanban; tautan Dasbor akan menduplikasinya.
  const showDashboardLink =
    moduleId !== "xpro" || workspaceRole === "owner" || workspaceRole === "admin";
  // #61 (BS New 3): menu modul mobile memakai Sheet hamburger.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!mod) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-xl font-semibold text-navy dark:text-foreground">
          {lang === "id" ? "Modul tidak ditemukan" : "Module not found"}
        </h1>
        <Link
          to="/app/w/$workspaceId"
          params={{ workspaceId }}
          className="mt-4 inline-block text-sm text-gold underline"
        >
          {lang === "id" ? "Kembali ke peluncur" : "Back to launcher"}
        </Link>
      </div>
    );
  }

  if (accessLoading) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!canViewModule(mod.id)) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-foreground">
          {lang === "id" ? "Akses modul dibatasi" : "Module access restricted"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "id"
            ? "Peran Anda tidak memiliki akses ke modul ini."
            : "Your role does not have access to this module."}
        </p>
        <Link
          to="/app/w/$workspaceId"
          params={{ workspaceId }}
          className="mt-4 inline-block text-sm text-gold underline"
        >
          {lang === "id" ? "Kembali ke semua modul" : "Back to all modules"}
        </Link>
      </div>
    );
  }

  if (mod.addon && !addonsLoading && !hasAddon(mod.addon)) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <Lock className="mx-auto h-8 w-8 text-gold" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-foreground">
          {lang === "id" ? `${mod.id_} belum aktif` : `${mod.en} is not active`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "id"
            ? "Modul ini tersedia sebagai add-on berbayar. Hubungi tim XPERD atau buka halaman Billing untuk mengaktifkannya."
            : "This module is a paid add-on. Contact the XPERD team or open Billing to activate it."}
        </p>
        <Link
          to="/app/w/$workspaceId/billing"
          params={{ workspaceId }}
          className="mt-4 inline-block text-sm text-gold underline"
        >
          {lang === "id" ? "Buka Billing" : "Open Billing"}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4 md:flex">
        <Link
          to="/app/w/$workspaceId"
          params={{ workspaceId }}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-navy/90"
        >
          <ChevronLeft className="h-4 w-4" /> {lang === "id" ? "Semua Modul" : "All Modules"}
        </Link>

        <div className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2">
          <mod.icon className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-navy dark:text-foreground">
            {lang === "id" ? mod.id_ : mod.en}
          </span>
        </div>

        <nav className="mt-4 flex flex-col gap-1">
          {showDashboardLink && (
            <Link
              to="/app/w/$workspaceId/$moduleId"
              params={{ workspaceId, moduleId: mod.id }}
              activeOptions={{ exact: true }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname === `/app/w/${workspaceId}/${mod.id}` &&
                  "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              {lang === "id" ? "Dasbor" : "Dashboard"}
            </Link>
          )}
          <SubmoduleNav
            lang={lang}
            subs={mod.submodules.filter(
              (sub) => canViewSubmodule(mod.id, sub.id) && !(mod.id === "crm" && sub.id === "team"),
            )}
            renderLink={(sub, content) => {
              const to = `/app/w/${workspaceId}/${mod.id}/${sub.id}`;
              return (
                <Link
                  key={sub.id}
                  to="/app/w/$workspaceId/$moduleId/$submoduleId"
                  params={{ workspaceId, moduleId: mod.id, submoduleId: sub.id }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    pathname === to &&
                      "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
                  )}
                >
                  {content}
                </Link>
              );
            }}
          />
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <mod.icon className="h-4 w-4 shrink-0 text-gold" />
            <span className="truncate text-sm font-semibold text-navy dark:text-foreground">
              {lang === "id" ? mod.id_ : mod.en}
            </span>
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={lang === "id" ? "Buka menu modul" : "Open module menu"}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[86vw] max-w-sm overflow-y-auto p-4">
              <SheetHeader className="pr-10 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <mod.icon className="h-5 w-5 shrink-0 text-gold" />
                  <span className="truncate">{lang === "id" ? mod.id_ : mod.en}</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                <SheetClose asChild>
                  <Link
                    to="/app/w/$workspaceId"
                    params={{ workspaceId }}
                    className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />{" "}
                    {lang === "id" ? "Semua Modul" : "All Modules"}
                  </Link>
                </SheetClose>
                {showDashboardLink && (
                  <SheetClose asChild>
                    <Link
                      to="/app/w/$workspaceId/$moduleId"
                      params={{ workspaceId, moduleId: mod.id }}
                      activeOptions={{ exact: true }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-muted-foreground",
                        pathname === `/app/w/${workspaceId}/${mod.id}` &&
                          "bg-navy text-primary-foreground",
                      )}
                    >
                      <LayoutDashboard className="h-4 w-4" />{" "}
                      {lang === "id" ? "Dasbor" : "Dashboard"}
                    </Link>
                  </SheetClose>
                )}
                <SubmoduleNav
                  lang={lang}
                  subs={mod.submodules.filter(
                    (sub) =>
                      canViewSubmodule(mod.id, sub.id) && !(mod.id === "crm" && sub.id === "team"),
                  )}
                  renderLink={(sub, content) => {
                    const to = `/app/w/${workspaceId}/${mod.id}/${sub.id}`;
                    return (
                      <SheetClose asChild key={sub.id}>
                        <Link
                          to="/app/w/$workspaceId/$moduleId/$submoduleId"
                          params={{ workspaceId, moduleId: mod.id, submoduleId: sub.id }}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-muted-foreground",
                            pathname === to && "bg-navy text-primary-foreground",
                          )}
                        >
                          {content}
                        </Link>
                      </SheetClose>
                    );
                  }}
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
        <main className="p-4 sm:p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
