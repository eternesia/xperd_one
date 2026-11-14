import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { emitAuthChange } from "@/hooks/use-session";
import { getPublicAuthSettings } from "@/lib/qalling-auth.functions";
import { QallingPreferences } from "./QallingPreferences";
import { QallingLogo } from "./QallingLogo";

export const SIGNUP_TIER_KEY = "qalling-signup-tier";

export const SIGNUP_PLANS = [
  {
    slug: "lite",
    code: "qalling_lite",
    name: "Lite",
    price: "Rp49.000",
    accounts: "5 akun sosial",
    users: "1 pengguna",
    features: ["Posting & jadwal", "Ide & media", "Interaksi", "Insight"],
  },
  {
    slug: "pro",
    code: "qalling_pro",
    name: "Pro",
    price: "Rp149.000",
    accounts: "15 akun sosial",
    users: "3 pengguna",
    features: ["Semua fitur Lite", "Inbox DM", "CRM & pipeline", "Automasi"],
    highlight: true,
  },
  {
    slug: "agency",
    code: "qalling_agency",
    name: "Agency",
    price: "Rp349.000",
    accounts: "40 akun sosial",
    users: "10 pengguna",
    features: ["Semua fitur Pro", "Multi-klien", "Tender & dokumen", "API"],
  },
] as const;

export type AuthSettings = {
  google_enabled: boolean;
  email_otp_enabled: boolean;
  trial_days: number;
  terms_label: string;
  terms_of_service: string;
  privacy_policy: string;
  acceptable_use_policy: string;
};

export function useAuthSettings() {
  return useQuery({
    queryKey: ["platform-auth-settings"],
    queryFn: (): Promise<AuthSettings> => getPublicAuthSettings(),
    staleTime: 60_000,
  });
}

/** Server sudah menerbitkan cookie sesi setelah kode diverifikasi; beri tahu hook sesi agar membaca ulang. */
export function onSessionIssued() {
  emitAuthChange();
}

/**
 * Login Google (New 12/13: Lovable Cloud) di Old: server memulai OAuth 2.0 dengan OAuth Client milik Anda
 * (Admin → Login & Pendaftaran), menerima callback, lalu menerbitkan cookie sesi dan kembali ke /qalling/login.
 */
async function startGoogleOAuth(): Promise<{ redirected: boolean; error?: Error }> {
  window.location.href = "/api/public/auth/google/start";
  return { redirected: true };
}

export const GOOGLE_ERRORS: Record<string, string> = {
  disabled: "Login Google sedang dinonaktifkan.",
  not_configured: "Login Google belum dikonfigurasi admin.",
  denied: "Login Google dibatalkan.",
  state: "Sesi login Google tidak valid. Coba lagi.",
  exchange: "Gagal masuk dengan Google. Coba lagi.",
  unverified: "Email Google belum terverifikasi.",
  disposable: "Email sementara tidak diizinkan. Gunakan email pribadi atau perusahaan yang aktif.",
  inactive: "Akun ini dinonaktifkan.",
  closed: "Pendaftaran baru tidak tersedia di instalasi ini.",
};

export function GoogleButton({
  label,
  onSignedIn,
  beforeRedirect,
}: {
  label: string;
  onSignedIn: () => void;
  beforeRedirect?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    beforeRedirect?.();
    const result = await startGoogleOAuth();
    if (result.error) {
      setBusy(false);
      toast.error(
        result.error instanceof Error ? result.error.message : "Gagal masuk dengan Google",
      );
      return;
    }
    if (result.redirected) return;
    setBusy(false);
    onSignedIn();
  }
  return (
    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={go}>
      {busy ? (
        <Loader2 className="animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path
            fill="currentColor"
            d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51z"
          />
        </svg>
      )}
      {label}
    </Button>
  );
}

export function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      aria-label="Kode 6 digit"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      className="h-14 w-full rounded-lg border border-input bg-background text-center font-mono text-2xl tracking-[0.6em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      placeholder="••••••"
    />
  );
}

export function QallingAuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-end">
          <QallingPreferences />
        </div>
        <a href="/qalling" className="flex flex-col items-center gap-2">
          <QallingLogo className="w-60" />
        </a>
        {children}
      </div>
    </div>
  );
}
