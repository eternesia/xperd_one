import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  FileText,
  LogOut,
  ShieldCheck,
  ReceiptText,
  CreditCard,
  LayoutList,
  Megaphone,
  LifeBuoy,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useSession } from "@/hooks/use-session";
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

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!session) return <AdminLogin />;

  if (isAdmin === null) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Verifying access…</div>;
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
                await supabase.auth.signOut();
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

  return (
    <div className="flex min-h-screen bg-secondary/40">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-navy p-5 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.22em] text-gold">
          <ShieldCheck className="h-4 w-4" /> SUPER ADMIN
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          <NavItem to="/app-admin" icon={<LayoutDashboard className="h-4 w-4" />} exact>
            Dashboard
          </NavItem>
          <NavItem to="/app-admin/tenancy" icon={<Building2 className="h-4 w-4" />}>
            Tenancy
          </NavItem>
          <NavItem to="/app-admin/registrations" icon={<ClipboardCheck className="h-4 w-4" />}>
            Registrations
          </NavItem>
          <NavItem to="/app-admin/invoices" icon={<ReceiptText className="h-4 w-4" />}>
            Invoices
          </NavItem>
          <NavItem to="/app-admin/payments" icon={<CreditCard className="h-4 w-4" />}>
            Payment Gateway
          </NavItem>
          <NavItem to="/app-admin/packages" icon={<LayoutList className="h-4 w-4" />}>
            Plan & Packages
          </NavItem>
          <NavItem to="/app-admin/announcements" icon={<Megaphone className="h-4 w-4" />}>
            Announcements
          </NavItem>
          <NavItem to="/app-admin/tickets" icon={<LifeBuoy className="h-4 w-4" />}>
            Help Desk
          </NavItem>
          <NavItem to="/app-admin/content" icon={<FileText className="h-4 w-4" />}>
            Website Content
          </NavItem>
        </nav>
        <div className="mt-auto space-y-3 pt-8">
          <p className="truncate text-xs text-primary-foreground/50">{session.user.email}</p>
          <Button
            variant="onDark"
            size="sm"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Signed out");
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-background px-6 lg:hidden">
          <span className="text-sm font-semibold tracking-[0.2em] text-navy">SUPER ADMIN</span>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link to="/app-admin" className="text-muted-foreground">Dashboard</Link>
            <Link to="/app-admin/tenancy" className="text-muted-foreground">Tenancy</Link>
            <Link to="/app-admin/invoices" className="text-muted-foreground">Invoices</Link>
            <Link to="/app-admin/payments" className="text-muted-foreground">Payments</Link>
            <Link to="/app-admin/packages" className="text-muted-foreground">Plans</Link>
            <Link to="/app-admin/announcements" className="text-muted-foreground">News</Link>
            <Link to="/app-admin/tickets" className="text-muted-foreground">Help Desk</Link>
            <Link to="/app-admin/content" className="text-muted-foreground">Content</Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/app-admin` },
      });
      setBusy(false);
      if (error) toast.error(error.message);
      else toast.success("Account created. Sign in to continue.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground underline"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Already have an account? Sign in" : "First-time setup? Create the super admin account"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
