import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, PenSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getTebarStatus, startTebarConnect } from "@/lib/tebar.functions";
import { TEBAR_PLATFORMS } from "@/components/app/CrmSocial";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SocialIcon } from "./SocialIcon";

const DISMISS_KEY = "qalling:onboarding-dismissed";

/**
 * Panduan awal di Beranda untuk pengguna baru:
 * 1) hubungkan akun media sosial (pilih platform langsung dari sini),
 * 2) buat postingan pertama. Hilang sendiri setelah selesai.
 */
export function OnboardingWizard({
  workspaceId,
  accountCount,
  hasPosts,
  canPost,
}: {
  workspaceId: string;
  accountCount: number;
  hasPosts: boolean;
  canPost: boolean;
}) {
  const { pick, lang } = useI18n();
  const id = lang === "id";
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === workspaceId;
    } catch {
      return false;
    }
  });
  const statusFn = useServerFn(getTebarStatus);
  const connectFn = useServerFn(startTebarConnect);
  const { data: st } = useQuery({
    queryKey: ["tebar-status", workspaceId],
    queryFn: () => statusFn({ data: { workspaceId } }),
  });
  const connect = useMutation({
    mutationFn: (platform: string) => {
      // Kembali ke halaman Akun Sosial agar akun langsung tersinkron setelah login.
      const u = new URL("/qalling/app/social-accounts", window.location.origin);
      return connectFn({ data: { workspaceId, returnUrl: u.toString(), platforms: [platform] } });
    },
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasAccount = accountCount > 0;
  if (hasAccount && (hasPosts || dismissed)) return null;
  const doneCount = (hasAccount ? 1 : 0) + (hasPosts ? 1 : 0);

  const steps = [
    { n: 1, done: hasAccount, label: pick("Connect account", "Hubungkan akun") },
    { n: 2, done: hasPosts, label: pick("First post", "Postingan pertama") },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm sm:rounded-2xl">
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">
              {pick("Get started", "Mulai di sini")}
            </p>
            <h2 className="mt-1 text-xl font-bold text-navy dark:text-foreground sm:text-2xl">
              {hasAccount
                ? pick(
                    "Great! Now create your first post",
                    "Bagus! Sekarang buat postingan pertama",
                  )
                : pick("Connect your first social account", "Hubungkan akun media sosial pertama")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasAccount
                ? pick(
                    "Write a caption, add a photo or video, and schedule it to your connected accounts.",
                    "Tulis caption, tambahkan foto/video, lalu jadwalkan ke akun yang sudah terhubung.",
                  )
                : pick(
                    "Pick a platform below, sign in on the page that opens and allow access. You'll come back here automatically.",
                    "Pilih platform di bawah, login di halaman yang terbuka lalu izinkan akses. Anda akan kembali ke Qalling otomatis.",
                  )}
            </p>
          </div>
          {hasAccount && (
            <button
              type="button"
              aria-label={pick("Hide", "Sembunyikan")}
              onClick={() => {
                try {
                  localStorage.setItem(DISMISS_KEY, workspaceId);
                } catch {
                  /* abaikan */
                }
                setDismissed(true);
              }}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <ol className="mt-4 flex items-center gap-2 text-xs sm:text-sm">
          {steps.map((s, i) => (
            <li key={s.n} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-semibold",
                  s.done
                    ? "bg-emerald-500 text-white"
                    : s.n === doneCount + 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s.done ? <Check className="size-3.5" /> : s.n}
              </span>
              <span className={cn(s.done ? "text-muted-foreground line-through" : "font-medium")}>
                {s.label}
              </span>
              {i < steps.length - 1 && <ChevronRight className="size-4 text-muted-foreground" />}
            </li>
          ))}
        </ol>

        {!hasAccount ? (
          st && !st.ready ? (
            <p className="mt-5 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              {pick(
                "Connections are not enabled by the XPERD admin yet. Contact support.",
                "Fitur koneksi belum diaktifkan admin XPERD. Hubungi support.",
              )}
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
              {TEBAR_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(p.id)}
                  className="group flex flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 text-center transition hover:border-primary/60 hover:shadow-md disabled:opacity-50 sm:p-4"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary/10 sm:size-12">
                    {connect.isPending && connect.variables === p.id ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <SocialIcon platform={p.id} className="size-6" />
                    )}
                  </span>
                  <span className="text-xs font-medium sm:text-sm">{p.label}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    {id ? p.hintId : p.hintEn}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          canPost && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="gold" size="lg" className="max-sm:w-full">
                <Link
                  to="/qalling/app/$submoduleId"
                  params={{ submoduleId: "post-scheduler" }}
                  search={{ new: 1 }}
                >
                  <PenSquare /> {pick("Create first post", "Buat postingan pertama")}
                </Link>
              </Button>
            </div>
          )
        )}
        {!hasAccount && (
          <p className="mt-4 text-xs text-muted-foreground">
            {pick(
              "Tip: you can connect more accounts later from Social Accounts.",
              "Tips: akun lain bisa ditambahkan nanti lewat menu Akun Sosial.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
