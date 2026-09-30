import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Loader2, Lock, LogOut, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { emitAuthChange } from "@/hooks/use-session";
import { useTenantAddons } from "@/lib/addons";
import { AppProvider, useApp } from "@/lib/app-context";
import { logoutAppUser } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";
import { findModule } from "@/lib/modules";
import { ThemeProvider } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qalling/app")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Qalling Dashboard" }, { name: "robots", content: "noindex, nofollow" }],
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
  const { loading, userId, workspaces, activeWorkspace, accessLoading, canViewSubmodule } = useApp();
  const { hasAddon, loading: addonsLoading } = useTenantAddons();
  const navigate = useNavigate();
  const { pick } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate({ to: "/qalling/login", replace: true });
  }, [loading, userId, navigate]);

  if (loading || !CRM) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {pick("Loading Qalling…", "Memuat Qalling…")}
      </div>
    );
  }
  if (!userId) return null;

  if (workspaces.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-navy dark:text-foreground">
            {pick("No workspace yet", "Workspace belum tersedia")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pick(
              "Your account has no Qalling workspace yet. Contact our team for activation.",
              "Akun Anda belum memiliki workspace Qalling. Hubungi tim kami untuk aktivasi.",
            )}
          </p>
          <Button asChild variant="gold" className="mt-4">
            <Link to="/contact">{pick("Contact Sales", "Hubungi Sales")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Qalling standalone hanya menampilkan CRM; modulnya butuh add-on `qalling`.
  if (!addonsLoading && !hasAddon(CRM.addon)) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md text-center">
          <Lock className="mx-auto h-8 w-8 text-gold" />
          <h1 className="mt-4 text-xl font-semibold text-navy dark:text-foreground">
            {pick("Qalling is not active", "Qalling belum aktif")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pick(
              "This workspace does not have the Qalling add-on yet. Contact the XPERD team to activate it.",
              "Workspace ini belum memiliki add-on Qalling. Hubungi tim XPERD untuk mengaktifkannya.",
            )}
          </p>
          <Button asChild variant="gold" className="mt-4">
            <Link to="/app/w/$workspaceId/billing" params={{ workspaceId: activeWorkspace?.id ?? "" }}>
              {pick("Open Billing", "Buka Billing")}
            </Link>
          </Button>
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

  // Hanya submodul CRM yang boleh dilihat peran user (#59) yang muncul di menu.
  const menu = CRM.submodules.filter((sub) => accessLoading || canViewSubmodule(CRM.id, sub.id));

  const nav = (
    <nav className="flex flex-col gap-1">
      <Link
        to="/qalling/app"
        activeOptions={{ exact: true }}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          pathname === "/qalling/app" && "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
        )}
      >
        <LayoutDashboard className="h-4 w-4" />
        {pick("Dashboard", "Dasbor")}
      </Link>
      {menu.map((sub) => {
        const to = `/qalling/app/${sub.id}`;
        return (
          <Link
            key={sub.id}
            to="/qalling/app/$submoduleId"
            params={{ submoduleId: sub.id }}
            className={cn(
              "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              pathname === to && "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
            )}
          >
            {pick(sub.en, sub.id_)}
          </Link>
        );
      })}
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
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold text-sm font-extrabold text-navy">
                      Q
                    </span>
                    Qalling
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6" onClick={() => setMobileMenuOpen(false)}>
                  {nav}
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/qalling/app" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gold text-base font-extrabold text-navy">Q</span>
              <span className="text-lg font-extrabold tracking-tight text-navy dark:text-foreground">
                Qalling<span className="text-gold">.</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:block">
              {activeWorkspace?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label={pick("Sign out", "Keluar")}>
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
