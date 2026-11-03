import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import {
  provisionGoogleSignup,
  requestLoginCode,
  verifyLoginCode,
} from "@/lib/qalling-auth.functions";
import {
  GoogleButton,
  GOOGLE_ERRORS,
  OtpInput,
  QallingAuthFrame,
  SIGNUP_TIER_KEY,
  onSessionIssued,
  useAuthSettings,
} from "@/components/qalling/qalling-auth";

export const Route = createFileRoute("/qalling/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Masuk ke Qalling — CRM Dashboard" },
      {
        name: "description",
        content: "Masuk ke akun Qalling dengan Google atau kode yang dikirim ke email Anda.",
      },
      { property: "og:title", content: "Masuk ke Qalling" },
      { property: "og:description", content: "Masuk ke dashboard Qalling tanpa kata sandi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QallingLogin,
});

/** Tujuan setelah masuk: halaman persetujuan OAuth/MCP (server-side, dimuat penuh) atau beranda Qalling. */
function afterLogin(navigate: ReturnType<typeof useNavigate>) {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/oauth/") && !next.startsWith("//")) window.location.replace(next);
  else navigate({ to: "/qalling/app", replace: true });
}

function QallingLogin() {
  const { pick } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const { data: settings } = useAuthSettings();
  const request = useServerFn(requestLoginCode);
  const verify = useServerFn(verifyLoginCode);
  const provisionGoogle = useServerFn(provisionGoogleSignup);
  const handled = useRef(false);

  // Google gagal (dibatalkan, belum dikonfigurasi, dst.): tampilkan alasannya lalu bersihkan parameter dari URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("google_error");
    if (!err) return;
    toast.error(GOOGLE_ERRORS[err] ?? "Gagal masuk dengan Google");
    params.delete("google_error");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // After Google returns: create the trial for a new user who picked a plan, then open the app.
  useEffect(() => {
    if (loading || !session || handled.current) return;
    handled.current = true;
    const tier = sessionStorage.getItem(SIGNUP_TIER_KEY);
    (async () => {
      if (tier) {
        try {
          await provisionGoogle({ data: { tier, acceptTerms: true } });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Gagal mengaktifkan akun");
        }
        sessionStorage.removeItem(SIGNUP_TIER_KEY);
      }
      afterLogin(navigate);
    })();
  }, [loading, session, navigate, provisionGoogle]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      await request({ data: { email } });
      setSent(true);
      toast.success("Jika email terdaftar, kode 6 digit sudah dikirim.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim kode");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verify({ data: { email, code } });
      onSessionIssued();
      afterLogin(navigate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kode salah");
      setBusy(false);
    }
  }

  return (
    <QallingAuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>
            {sent ? pick("Enter code", "Masukkan kode") : pick("Sign in", "Masuk")}
          </CardTitle>
          <CardDescription>
            {sent
              ? `Kode dikirim ke ${email}. Berlaku 10 menit.`
              : pick(
                  "No password — use Google or an email code.",
                  "Tanpa kata sandi — pakai Google atau kode email.",
                )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <form className="space-y-4" onSubmit={confirm}>
              <OtpInput value={code} onChange={setCode} />
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                disabled={busy || code.length !== 6}
              >
                {busy && <Loader2 className="animate-spin" />}Masuk
              </Button>
              <div className="flex justify-between text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setSent(false);
                    setCode("");
                  }}
                >
                  {pick("Change email", "Ubah email")}
                </button>
                <button
                  type="button"
                  className="text-gold hover:underline"
                  disabled={busy}
                  onClick={() => send()}
                >
                  {pick("Resend code", "Kirim ulang kode")}
                </button>
              </div>
            </form>
          ) : (
            <>
              {settings?.google_enabled !== false && (
                <GoogleButton
                  label={pick("Sign in with Google", "Masuk dengan Google")}
                  onSignedIn={() => {
                    /* session effect handles redirect */
                  }}
                />
              )}
              {settings?.google_enabled !== false && settings?.email_otp_enabled !== false && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {pick("or", "atau")}
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {settings?.email_otp_enabled !== false && (
                <form className="space-y-4" onSubmit={send}>
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
                    {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                    {pick("Send login code", "Kirim kode masuk")}
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        {pick("New to Qalling?", "Belum punya akun?")}{" "}
        <Link to="/qalling/daftar" className="text-gold underline-offset-4 hover:underline">
          {pick("Try free", "Coba gratis")}
        </Link>
        {" · "}
        <Link to="/qalling" className="underline-offset-4 hover:underline">
          {pick("Back to website", "Kembali ke website")}
        </Link>
      </p>
    </QallingAuthFrame>
  );
}
