import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emitAuthChange, useSession } from "@/hooks/use-session";
import { loginAppUser } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/qalling/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Masuk ke Qalling — CRM Dashboard" },
      { name: "description", content: "Masuk ke akun Qalling Anda untuk membuka dashboard CRM dan media sosial." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QallingLogin,
});

function QallingLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const { pick } = useI18n();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/qalling/app", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginAppUser({ data: { email, password } });
      // Sesi disimpan sebagai cookie httpOnly; beri tahu tab lain agar memuat ulang.
      emitAuthChange();
      navigate({ to: "/qalling/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pick("Authentication failed", "Autentikasi gagal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold text-2xl font-extrabold text-navy">Q</span>
          <span className="text-2xl font-extrabold tracking-tight text-navy dark:text-foreground">
            Qalling<span className="text-gold">.</span>
          </span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{pick("Sign in", "Masuk")}</CardTitle>
            <CardDescription>
              {pick("Access your Qalling CRM dashboard.", "Akses dashboard Qalling CRM Anda.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="email">{pick("Work email", "Email kerja")}</Label>
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
              <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {pick("Sign in to Qalling", "Masuk ke Qalling")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          {pick("No account yet? ", "Belum punya akun? ")}
          <Link to="/register" className="text-gold underline-offset-4 hover:underline">
            {pick("Register online", "Daftar online")}
          </Link>
          {" · "}
          <Link to="/qalling" className="underline-offset-4 hover:underline">
            {pick("Back to website", "Kembali ke website")}
          </Link>
        </p>
      </div>
    </div>
  );
}
