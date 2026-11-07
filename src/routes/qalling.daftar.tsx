import { useEffect, useState } from "react";
import { captureReferral, getStoredReferral } from "@/lib/referral-capture";
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
import { qallingPagePath } from "@/lib/qalling-urls";
import { useI18n } from "@/lib/i18n";
import { Checkbox } from "@/components/ui/checkbox";

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
          "Daftar langsung dengan Google atau email, dan langsung coba gratis tanpa kartu kredit.",
      },
      { property: "og:title", content: "Daftar Qalling — Coba Gratis 14 Hari" },
      { property: "og:description", content: "Mulai trial gratis dengan nama dan email Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QallingSignup,
});

function QallingSignup() {
  const { paket } = Route.useSearch();
  const navigate = useNavigate();
  const plan = SIGNUP_PLANS.find((p) => p.slug === paket) ?? SIGNUP_PLANS[0];
  const { pick } = useI18n();
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
  const [refCode, setRefCode] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // Link referral lama (`/register?ref=KODE`): simpan kodenya lalu arahkan ke beranda agar calon pengguna membaca fitur dulu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).get("ref")) return;
    captureReferral();
    navigate({ to: "/qalling", replace: true });
  }, [navigate]);

  async function finishWithSession(tier: string) {
    setBusy(true);
    try {
      await provisionGoogle({ data: { tier, acceptTerms: true } });
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
    captureReferral();
    setRefCode(getStoredReferral());
  }, []);

  useEffect(() => {
    setRegId(null);
    setCode("");
  }, [paket]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await start({ data: { name, email, tier: plan.code, acceptTerms: agreed } });
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
          <CardTitle className="pt-3">
            {regId
              ? pick("Enter verification code", "Masukkan kode")
              : pick(`Try free for ${trialDays} days`, `Coba gratis ${trialDays} hari`)}
          </CardTitle>
          <CardDescription>
            {regId
              ? `Kami mengirim kode 6 digit ke ${email}.`
              : pick("No password, no credit card.", "Tanpa kata sandi, tanpa kartu kredit.")}
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
                disabled={busy || !agreed}
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
                {busy && <Loader2 className="animate-spin" />}
                {pick("Verify & activate", "Verifikasi & aktifkan")}
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
                  {pick("Change email", "Ubah email")}
                </button>
                <button
                  type="button"
                  className="text-gold hover:underline"
                  disabled={busy}
                  onClick={(e) => submit(e as unknown as React.FormEvent)}
                >
                  {pick("Resend code", "Kirim ulang kode")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border bg-secondary/40 p-3">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <p className="text-sm leading-snug">
                  {pick("I have read and agree to the ", "Saya telah membaca dan menyetujui ")}
                  <a
                    href={qallingPagePath(window.location.hostname, "/qalling/syarat")}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-gold underline-offset-2 hover:underline"
                  >
                    {pick("Terms of Service", "Syarat dan Ketentuan")}
                  </a>
                  {", "}
                  <a
                    href={qallingPagePath(window.location.hostname, "/qalling/privasi")}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-gold underline-offset-2 hover:underline"
                  >
                    {pick("Privacy Policy", "Kebijakan Privasi")}
                  </a>
                  {pick(" and ", " dan ")}
                  <a
                    href={qallingPagePath(window.location.hostname, "/qalling/penggunaan")}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-gold underline-offset-2 hover:underline"
                  >
                    {pick("Acceptable Use Policy", "Kebijakan Penggunaan")}
                  </a>
                  {pick(" of Qalling.", " Qalling.")}
                </p>
              </div>
              {settings?.google_enabled !== false && (
                <>
                  <div
                    className={agreed ? "" : "pointer-events-none opacity-50"}
                    aria-disabled={!agreed}
                  >
                    <GoogleButton
                      label={pick("Sign up with Google", "Daftar dengan Google")}
                      beforeRedirect={() => sessionStorage.setItem(SIGNUP_TIER_KEY, plan.code)}
                      onSignedIn={() => finishWithSession(plan.code)}
                    />
                  </div>
                  {settings?.email_otp_enabled !== false && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      {pick("or", "atau")}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                </>
              )}
              {settings?.email_otp_enabled !== false && (
                <form className="space-y-4" onSubmit={submit}>
                  {refCode && (
                    <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                      {pick(
                        `Referral code ${refCode} will be applied to this account.`,
                        `Kode referral ${refCode} akan dipakai untuk akun ini.`,
                      )}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="name">{pick("Full name", "Nama lengkap")}</Label>
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
                  <Button
                    type="submit"
                    variant="gold"
                    className="w-full"
                    disabled={busy || !agreed}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                    {pick("Email verification code", "Kirim kode ke email")}
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        {pick("Already have an account?", "Sudah punya akun?")}{" "}
        <Link to="/qalling/login" className="text-gold hover:underline">
          {pick("Sign in", "Masuk")}
        </Link>
      </p>
    </QallingAuthFrame>
  );
}
