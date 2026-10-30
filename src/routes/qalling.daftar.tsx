import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import {
  provisionGoogleSignup,
  startQallingSignup,
  verifyQallingSignup,
} from "@/lib/qalling-auth.functions";
import {
  GoogleButton,
  OtpInput,
  QallingAuthFrame,
  SIGNUP_PLANS,
  SIGNUP_TIER_KEY,
  onSessionIssued,
  useAuthSettings,
} from "@/components/qalling/qalling-auth";
import { cn } from "@/lib/utils";

type Search = { paket?: string };

export const Route = createFileRoute("/qalling/daftar")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => ({
    paket: typeof s.paket === "string" ? s.paket : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Daftar Qalling — Coba Gratis 14 Hari" },
      {
        name: "description",
        content:
          "Pilih paket Qalling, daftar dengan Google atau email, dan langsung coba gratis tanpa kartu kredit.",
      },
      { property: "og:title", content: "Daftar Qalling — Coba Gratis 14 Hari" },
      {
        property: "og:description",
        content: "Pilih paket Qalling dan mulai trial gratis dalam satu menit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QallingSignup,
});

function QallingSignup() {
  const { paket } = Route.useSearch();
  const navigate = useNavigate();
  const plan = SIGNUP_PLANS.find((p) => p.slug === paket);
  const { session } = useSession();
  const { data: settings } = useAuthSettings();
  const trialDays = settings?.trial_days ?? 14;

  const start = useServerFn(startQallingSignup);
  const verify = useServerFn(verifyQallingSignup);
  const provisionGoogle = useServerFn(provisionGoogleSignup);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [regId, setRegId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function finishWithSession(tier: string) {
    setBusy(true);
    try {
      await provisionGoogle({ data: { tier } });
      sessionStorage.removeItem(SIGNUP_TIER_KEY);
      toast.success(`Trial ${trialDays} hari aktif. Selamat datang!`);
      navigate({ to: "/qalling/app", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengaktifkan akun");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setRegId(null);
    setCode("");
  }, [paket]);

  if (!plan) {
    return (
      <QallingAuthFrame>
        <div className="text-center">
          <h1 className="text-xl font-bold text-navy dark:text-foreground">Pilih paket dulu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua paket bisa dicoba gratis {trialDays} hari. Upgrade kapan saja dari saldo.
          </p>
        </div>
        <div className="space-y-3">
          {SIGNUP_PLANS.map((p) => (
            <Link
              key={p.slug}
              to="/qalling/daftar"
              search={{ paket: p.slug }}
              className={cn(
                "block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-gold",
                "highlight" in p && p.highlight ? "border-gold" : "border-border",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm font-semibold">
                  {p.price}
                  <span className="font-normal text-muted-foreground">/bln</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.accounts} · {p.users} · {p.features.join(" · ")}
              </p>
            </Link>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link to="/qalling/login" className="text-gold hover:underline">
            Masuk
          </Link>
        </p>
      </QallingAuthFrame>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    try {
      const r = await start({ data: { name, email, tier: plan.code } });
      setRegId(r.registrationId);
      toast.success(
        r.throttled
          ? "Kode sudah dikirim, cek email Anda."
          : "Kode 6 digit telah dikirim ke email Anda.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mendaftar");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!regId) return;
    setBusy(true);
    try {
      const r = await verify({ data: { registrationId: regId, code } });
      onSessionIssued();
      toast.success(`Akun aktif — trial sampai ${r.trialEndsAt}.`);
      navigate({ to: "/qalling/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verifikasi gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <QallingAuthFrame>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
            <span>
              <Check className="mr-1 inline h-4 w-4 text-gold" />
              Paket <b>{plan.name}</b> · {plan.price}/bln
            </span>
            <Link
              to="/qalling/daftar"
              search={{}}
              className="text-xs underline-offset-4 hover:underline"
            >
              Ganti
            </Link>
          </div>
          <CardTitle className="pt-3">
            {regId ? "Masukkan kode" : `Coba gratis ${trialDays} hari`}
          </CardTitle>
          <CardDescription>
            {regId
              ? `Kami mengirim kode 6 digit ke ${email}.`
              : "Tanpa kata sandi, tanpa kartu kredit."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {session && !regId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Anda masuk sebagai <b>{session.user.email}</b>.
              </p>
              <Button
                variant="gold"
                className="w-full"
                disabled={busy}
                onClick={() => finishWithSession(plan.code)}
              >
                {busy && <Loader2 className="animate-spin" />}Aktifkan trial {plan.name}
              </Button>
            </div>
          ) : regId ? (
            <form className="space-y-4" onSubmit={confirm}>
              <OtpInput value={code} onChange={setCode} />
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                disabled={busy || code.length !== 6}
              >
                {busy && <Loader2 className="animate-spin" />}Verifikasi & aktifkan
              </Button>
              <div className="flex justify-between text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setRegId(null);
                    setCode("");
                  }}
                >
                  Ubah email
                </button>
                <button
                  type="button"
                  className="text-gold hover:underline"
                  disabled={busy}
                  onClick={(e) => submit(e as unknown as React.FormEvent)}
                >
                  Kirim ulang kode
                </button>
              </div>
            </form>
          ) : (
            <>
              {settings?.google_enabled !== false && (
                <>
                  <GoogleButton
                    label="Daftar dengan Google"
                    beforeRedirect={() => sessionStorage.setItem(SIGNUP_TIER_KEY, plan.code)}
                    onSignedIn={() => finishWithSession(plan.code)}
                  />
                  {settings?.email_otp_enabled !== false && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      atau
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                </>
              )}
              {settings?.email_otp_enabled !== false && (
                <form className="space-y-4" onSubmit={submit}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama lengkap</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Mail />}Kirim kode ke email
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link to="/qalling/login" className="text-gold hover:underline">
          Masuk
        </Link>
      </p>
    </QallingAuthFrame>
  );
}
