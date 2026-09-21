import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/site/Logo";
import { useSession, emitAuthChange } from "@/hooks/use-session";
import { loginAppUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in to XPERD One — ERP Workspace Access" },
      {
        name: "description",
        content:
          "Sign in or create your XPERD One account to set up your company workspace and start running your ERP.",
      },
      { property: "og:title", content: "Sign in to XPERD One" },
      { property: "og:description", content: "Access your XPERD One ERP workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  useEffect(() => {
    if (!loading && session) navigate({ to: next ?? "/app", replace: true });
  }, [loading, session, navigate, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Credentials are verified against our own app_users table; the server
      // issues a signed JWT in an httpOnly cookie (sent automatically on
      // serverFn RPCs). No Supabase session is created anymore.
      await loginAppUser({ data: { email, password } });
      emitAuthChange();
      navigate({ to: next ?? "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Register online</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>Access your XPERD One workspace.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="navy" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Register online</CardTitle>
                <CardDescription>
                  New to XPERD? Sign up for XPERD One (Starter or Professional). Our team activates your
                  organisation and sends your login credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="gold" className="w-full">
                  <Link to="/register">Start online registration</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/contact">Business / Enterprise — contact sales</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">
            Back to website
          </Link>
        </p>
      </div>
    </div>
  );
}
