import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/site/Logo";
import { completeInstanceSetup, getSetupState } from "@/lib/instances.functions";

/**
 * Penyiapan pertama instalasi mandiri (self-hosted): buat perusahaan & admin pertama.
 * Hanya terbuka bila belum ada perusahaan dan kode penyiapan (XPERD_SETUP_CODE) cocok.
 */
export const Route = createFileRoute("/setup")({
  ssr: false,
  head: () => ({ meta: [{ title: "Penyiapan XPERD" }, { name: "robots", content: "noindex" }] }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const state = useServerFn(getSetupState);
  const complete = useServerFn(completeInstanceSetup);
  const [ready, setReady] = useState<"loading" | "open" | "closed">("loading");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    code: "",
    company: "",
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    state()
      .then((s) => setReady(s.selfHosted && s.needed ? "open" : "closed"))
      .catch(() => setReady("closed"));
  }, [state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) {
      toast.error("Konfirmasi kata sandi tidak sama");
      return;
    }
    setBusy(true);
    try {
      await complete({
        data: {
          code: f.code,
          company: f.company,
          name: f.name,
          email: f.email,
          password: f.password,
        },
      });
      toast.success("Perusahaan siap. Silakan masuk dengan akun admin yang baru dibuat.");
      navigate({ to: "/auth", search: { next: undefined }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Penyiapan gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Logo />
          <CardTitle>Penyiapan pertama</CardTitle>
          <CardDescription>
            Buat perusahaan dan akun admin pertama untuk server ini. Langkah ini hanya dilakukan
            sekali.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready === "loading" ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : ready === "closed" ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>Server ini sudah disiapkan. Silakan masuk dengan akun Anda.</p>
              <Button
                className="w-full"
                onClick={() => navigate({ to: "/auth", search: { next: undefined } })}
              >
                Ke halaman masuk
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="code">Kode penyiapan</Label>
                <Input
                  id="code"
                  value={f.code}
                  onChange={set("code")}
                  autoComplete="off"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Isi XPERD_SETUP_CODE dari berkas .env server.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Nama perusahaan</Label>
                <Input
                  id="company"
                  value={f.company}
                  onChange={set("company")}
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nama admin</Label>
                <Input id="name" value={f.name} onChange={set("name")} required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email admin</Label>
                <Input id="email" type="email" value={f.email} onChange={set("email")} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Kata sandi</Label>
                  <Input
                    id="password"
                    type="password"
                    value={f.password}
                    onChange={set("password")}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Ulangi kata sandi</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={f.confirm}
                    onChange={set("confirm")}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Siapkan perusahaan
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
