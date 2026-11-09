import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  FileText,
  LogOut,
  ShieldCheck,
  ReceiptText,
  CreditCard,
  LayoutList,
  Blocks,
  Megaphone,
  LifeBuoy,
  MessageSquareQuote,
  ClipboardCheck,
  Users,
  Share2,
  Wallet,
  Settings,
  Menu,
  Gift,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin, useSession, emitAuthChange } from "@/hooks/use-session";
import { loginAppUser, logoutAppUser } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app-admin")({
  head: () => ({
    meta: [
      { title: "XPERD Super Admin" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal XPERD super admin console." },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { session, loading } = useSession();
  const isAdmin = useIsAdmin(session?.user.id);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) return <AdminLogin />;

  if (isAdmin === null) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Verifying access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>This console is restricted to XPERD super administrators.</p>
            <Button
              variant="outline"
              onClick={async () => {
                await logoutAppUser();
                emitAuthChange();
                navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inSettings = SETTINGS.some(([to]) => pathname.startsWith(to));
  const sidebarBody = (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.22em] text-gold">
        <ShieldCheck className="h-4 w-4" /> SUPER ADMIN
      </div>
      <nav className="mt-6 flex flex-col gap-1">
        <NavItem to="/app-admin" icon={<LayoutDashboard className="h-4 w-4" />} exact>
          Dashboard
        </NavItem>
        <NavItem to="/app-admin/visitors" icon={<Users className="h-4 w-4" />}>
          Pengunjung
        </NavItem>
        <Group>Pelanggan</Group>
        <NavItem to="/app-admin/tenancy" icon={<Building2 className="h-4 w-4" />}>
          Tenancy
        </NavItem>
        <NavItem to="/app-admin/registrations" icon={<ClipboardCheck className="h-4 w-4" />}>
          Pendaftaran
        </NavItem>
        <NavItem to="/app-admin/users" icon={<Users className="h-4 w-4" />}>
          Users
        </NavItem>
        <Group>Keuangan & Katalog</Group>
        <NavItem to="/app-admin/invoices" icon={<ReceiptText className="h-4 w-4" />}>
          Invoices
        </NavItem>
        <NavItem to="/app-admin/wallet" icon={<Wallet className="h-4 w-4" />}>
          Deposit & Top-up
        </NavItem>
        <NavItem to="/app-admin/packages" icon={<LayoutList className="h-4 w-4" />}>
          Paket
        </NavItem>
        <NavItem to="/app-admin/addons" icon={<Blocks className="h-4 w-4" />}>
          Add-on
        </NavItem>
        <NavItem to="/app-admin/grants" icon={<Gift className="h-4 w-4" />}>
          Akses Uji Coba
        </NavItem>
        <Group>Layanan</Group>
        <NavItem to="/app-admin/content" icon={<FileText className="h-4 w-4" />}>
          Konten Website
        </NavItem>
        <NavItem to="/app-admin/announcements" icon={<Megaphone className="h-4 w-4" />}>
          Pengumuman
        </NavItem>
        <NavItem to="/app-admin/testimonials" icon={<MessageSquareQuote className="h-4 w-4" />}>
          Testimoni
        </NavItem>
        <NavItem to="/app-admin/tickets" icon={<LifeBuoy className="h-4 w-4" />}>
          Help Desk
        </NavItem>
        <Group>Sistem</Group>
        <Link
          to="/app-admin/auth-settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-primary-foreground/65 transition-colors hover:bg-white/10 hover:text-primary-foreground",
            inSettings && "bg-white/10 text-gold",
          )}
        >
          <Settings className="h-4 w-4" /> Pengaturan
        </Link>
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <p className="truncate text-xs text-primary-foreground/50">{session.user.email}</p>
        <Button
          variant="onDark"
          size="sm"
          className="w-full"
          onClick={async () => {
            await logoutAppUser();
            emitAuthChange();
            toast.success("Signed out");
          }}
        >
          <LogOut /> Sign out
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen bg-secondary/40">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-navy p-5 text-primary-foreground lg:flex">
        {sidebarBody}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-3 lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[84vw] max-w-xs overflow-y-auto border-r-0 bg-navy p-5 text-primary-foreground"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
                }}
              >
                {sidebarBody}
              </div>
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm font-semibold tracking-[0.2em] text-navy dark:text-foreground">
            SUPER ADMIN
          </span>
        </header>
        <AdminLoadingBar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-6 lg:p-10">
          {inSettings && (
            <div className="mb-6 space-y-3">
              <div>
                <h1 className="text-2xl font-semibold">Pengaturan</h1>
                <p className="text-sm text-muted-foreground">
                  Semua konfigurasi sistem dalam satu tempat.
                </p>
              </div>
              <nav className="flex gap-1 overflow-x-auto border-b">
                {SETTINGS.map(([to, label]) => (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                      pathname.startsWith(to) && "border-primary text-foreground font-medium",
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const SETTINGS = [
  ["/app-admin/auth-settings", "Login & Pendaftaran"],
  ["/app-admin/email", "Email / SMTP"],
  ["/app-admin/payments", "Payment Gateway"],
  ["/app-admin/tebar", "API Tebar & Sosial"],
  ["/app-admin/kirimdev", "WhatsApp (Kirimdev)"],
  ["/app-admin/storage", "Object Storage"],
  ["/app-admin/referral", "Referral"],
] as const;

function Group({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/40">
      {children}
    </p>
  );
}

function NavItem({
  to,
  icon,
  children,
  exact,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-primary-foreground/65 transition-colors hover:bg-white/10 hover:text-primary-foreground",
        "data-[status=active]:bg-white/10 data-[status=active]:text-gold",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await loginAppUser({ data: { email, password } });
      emitAuthChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gold" /> Super Admin
          </CardTitle>
          <p className="text-sm text-muted-foreground">Restricted internal console.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminLoadingBar() {
  const routing = useRouterState({ select: (s) => s.isLoading || s.status === "pending" });
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = routing || fetching + mutating > 0;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      aria-hidden={!busy}
    >
      {busy && (
        <div className="h-full w-1/3 animate-[admin-load_1.1s_ease-in-out_infinite] bg-gold" />
      )}
    </div>
  );
}
