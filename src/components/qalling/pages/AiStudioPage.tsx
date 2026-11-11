import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarPlus,
  Check,
  Coins,
  Download,
  Flame,
  ImagePlus,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCw,
  Shirt,
  Sparkles,
  Store,
  Wallet,
  Wand2,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCrmMedia, useUpload } from "@/components/app/CrmMedia";
import { AiVideoInterest } from "@/components/qalling/AiVideoInterest";
import {
  AI_DURATIONS,
  AI_RATIOS,
  AI_STYLES,
  STYLE_LABELS,
  TIER_LABELS,
  perCredit,
  type AiJobView,
  type AiStyle,
  type AiTier,
  type CreditPack,
} from "@/lib/ai-studio";
import {
  buyCreditPack,
  createAiVideo,
  getCreditActivity,
  getStudioAccess,
  listAiJobs,
} from "@/lib/ai-studio.functions";
import { useApp } from "@/lib/app-context";
import { saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createWalletTopup, getWallet, reconcileWalletTopup } from "@/lib/wallet.functions";
import { walletReturnPath } from "@/lib/wallet/return-url";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const fileUrl = (path: string, download = false) =>
  `/api/workspace-files?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const running = (j: AiJobView) => ["queued", "processing", "saving"].includes(j.status);
const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];

const STYLE_ICONS: Record<AiStyle, LucideIcon> = {
  zoom: ZoomIn,
  rotate: RotateCw,
  steam: Flame,
  store: Store,
  model: Shirt,
  free: Sparkles,
};
const STYLE_HINTS: Record<AiStyle, { id: string; en: string }> = {
  zoom: { id: "Kamera mendekat pelan ke produk", en: "Camera slowly pushes in" },
  rotate: { id: "Produk berputar di meja putar", en: "Product spins on a turntable" },
  steam: { id: "Uap & percikan untuk makanan/minuman", en: "Steam and splash for food & drinks" },
  store: { id: "Kamera berjalan menyusuri toko", en: "Camera walks through the store" },
  model: { id: "Pakaian dikenakan dan bergerak", en: "Outfit worn and moving" },
  free: { id: "Gerakan halus, tulis arahan sendiri", en: "Subtle motion, your own direction" },
};
const TIER_HINTS: Record<AiTier, { id: string; en: string }> = {
  hemat: { id: "Gerakan sederhana, paling hemat", en: "Simple motion, lowest cost" },
  standar: { id: "Gerakan halus untuk kebanyakan produk", en: "Smooth motion for most products" },
  premium: { id: "Detail tertinggi untuk iklan utama", en: "Highest detail for hero ads" },
};

export function AiStudioPage() {
  const { activeWorkspace } = useApp();
  const workspaceId = activeWorkspace?.id;
  const { pick } = useI18n();
  const access = useQuery({
    queryKey: ["ai-studio-access", workspaceId],
    queryFn: () => getStudioAccess({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  if (!workspaceId || access.isLoading)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!access.data?.available)
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <Wand2 className="mx-auto size-10 text-violet-600" />
        <h1 className="text-2xl font-semibold">
          {pick("AI Studio is coming", "Studio AI segera hadir")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pick(
            "Turn a product photo into a short promo video for Reels and TikTok.",
            "Ubah foto produk menjadi video promo singkat untuk Reels dan TikTok.",
          )}
        </p>
        <AiVideoInterest workspaceId={workspaceId} />
      </div>
    );
  return <Studio workspaceId={workspaceId} access={access.data} />;
}

type Access = Awaited<ReturnType<typeof getStudioAccess>>;

function Studio({ workspaceId, access }: { workspaceId: string; access: Access }) {
  const { pick, lang } = useI18n();
  const L = (x: { id: string; en: string }) => (lang === "id" ? x.id : x.en);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { userId } = useApp();

  const { data: media = [] } = useCrmMedia(workspaceId);
  const photos = useMemo(
    () => media.filter((m) => PHOTO_MIME.includes(m.mime_type ?? "")),
    [media],
  );
  const upload = useUpload(workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<string | null>(null);
  const [style, setStyle] = useState<AiStyle>("zoom");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [ratio, setRatio] = useState<(typeof AI_RATIOS)[number]>("9:16");
  const [tier, setTier] = useState<AiTier>(
    access.tiers.find((t) => t.tier === "standar")?.tier ?? access.tiers[0]?.tier ?? "hemat",
  );
  const [consent, setConsent] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    if (!source && photos[0]) setSource(photos[0].id);
  }, [photos, source]);

  const jobs = useQuery({
    queryKey: ["ai-jobs", workspaceId],
    queryFn: () => listAiJobs({ data: { workspaceId } }),
    refetchInterval: (q) => ((q.state.data ?? []).some(running) ? 5000 : false),
  });
  const list = useMemo(() => jobs.data ?? [], [jobs.data]);
  const doneCount = list.filter((j) => j.status === "done").length;
  const prevDone = useRef<number | null>(null);
  useEffect(() => {
    // Mulai menghitung setelah data pertama dimuat, supaya video lama tidak dianggap "baru jadi".
    if (!jobs.isSuccess) return;
    if (prevDone.current !== null && doneCount > prevDone.current) {
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(pick("Your video is ready", "Video Anda sudah jadi"));
      const latest = list.find((j) => j.status === "done");
      if (latest) setViewing(latest.id);
    }
    prevDone.current = doneCount;
  }, [doneCount, list, qc, workspaceId, pick, jobs.isSuccess]);
  const failedIds = list
    .filter((j) => j.status === "failed")
    .map((j) => j.id)
    .join();
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
  }, [failedIds, qc, workspaceId]);

  const cur = access.tiers.find((t) => t.tier === tier);
  const cost = cur ? (duration >= 10 ? cur.credits_10s : cur.credits_5s) : 0;
  const enough = access.credits >= cost;
  const limitHit = access.used_today >= access.daily_limit;
  const selected = photos.find((p) => p.id === source) ?? null;
  const viewJob = list.find((j) => j.id === viewing) ?? null;
  const active = list.find(running) ?? null;

  const create = useMutation({
    mutationFn: () =>
      createAiVideo({
        data: {
          workspaceId,
          sourceMediaId: source!,
          style,
          note: note.trim() || undefined,
          tier,
          duration,
          aspectRatio: ratio,
          consent: true,
        },
      }),
    onSuccess: (r) => {
      setViewing(r.id);
      qc.invalidateQueries({ queryKey: ["ai-jobs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-credit-activity", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedule = useMutation({
    mutationFn: async (j: AiJobView) => {
      if (!j.result_path) throw new Error(pick("Video not found", "Video tidak ditemukan"));
      await saveWorkspaceRow({
        data: {
          table: "crm_scheduled_posts",
          workspaceId,
          data: {
            title: pick("AI video", "Video AI"),
            caption: "",
            media_url: null,
            media_paths: JSON.stringify([j.result_path]),
            account_ids: JSON.stringify([]),
            scheduled_at: sqlDateTime(new Date()),
            status: "draft",
            last_error: null,
            created_by: userId ?? null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(
        pick(
          "Draft created. Pick accounts and a time to schedule it.",
          "Draft dibuat. Pilih akun dan waktu untuk menjadwalkannya.",
        ),
      );
      navigate({ to: "/qalling/app/$submoduleId", params: { submoduleId: "post-scheduler" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onUpload = async (files: File[]) => {
    if (!files.length) return;
    try {
      const paths = await upload.mutateAsync(files);
      await qc.refetchQueries({ queryKey: ["crm-media", workspaceId] });
      const fresh = qc.getQueryData<typeof media>(["crm-media", workspaceId]) ?? [];
      const hit = fresh.find((m) => paths.includes(m.file_path));
      if (hit) setSource(hit.id);
    } catch {
      /* toast dari hook unggah */
    }
  };

  const blocker = !source
    ? pick("Choose a photo first", "Pilih foto dulu")
    : !consent
      ? pick("Tick the confirmation above", "Centang pernyataan di atas")
      : limitHit
        ? pick("Daily limit reached", "Batas harian tercapai")
        : null;

  return (
    <div className="space-y-6">
      {/* Kepala halaman */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-navy dark:text-foreground">
            <Wand2 className="size-6 text-violet-600" />
            Studio AI
            {access.mode === "admin_preview" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                {pick("admin test, hidden from users", "uji admin, belum terlihat pengguna")}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(
              "Turn one product photo into a 5–10 second promo video for Reels and TikTok.",
              "Ubah satu foto produk menjadi video promo 5–10 detik untuk Reels dan TikTok.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2">
            <Coins className="size-4 text-violet-600" />
            <span className="text-sm">
              <span className="font-semibold tabular-nums">{access.credits}</span>{" "}
              {pick("credits", "kredit")}
            </span>
          </div>
          <Button variant="navy" className="rounded-full" onClick={() => setBuyOpen(true)}>
            {pick("Buy credits", "Beli kredit")}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_1fr]">
        {/* Panel kontrol: kolom kiri di desktop, setelah panggung di HP */}
        <div className="space-y-6 rounded-3xl border bg-card p-5 lg:col-start-1 lg:row-span-4 lg:row-start-1">
          <Step n={1} title={pick("Product photo", "Foto produk")}>
            <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-[11px] text-muted-foreground hover:border-violet-500 hover:text-violet-700"
              >
                {upload.isPending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImagePlus className="size-5" />
                )}
                {pick("Upload", "Unggah")}
              </button>
              {photos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.name}
                  onClick={() => setSource(m.id)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-xl ring-offset-2 ring-offset-card",
                    source === m.id ? "ring-2 ring-violet-600" : "opacity-80 hover:opacity-100",
                  )}
                >
                  {m.url && (
                    <img
                      src={m.url}
                      alt={m.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                  {source === m.id && (
                    <Check className="absolute right-1 top-1 size-4 rounded-full bg-violet-600 p-0.5 text-white" />
                  )}
                </button>
              ))}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                e.target.value = "";
                void onUpload(f);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {pick(
                "Use a sharp photo with the product clearly visible. JPG, PNG or WebP.",
                "Pakai foto tajam dengan produk terlihat jelas. JPG, PNG, atau WebP.",
              )}
            </p>
          </Step>

          <Step n={2} title={pick("Motion style", "Gaya gerakan")}>
            <div className="grid grid-cols-2 gap-2">
              {AI_STYLES.map((s) => {
                const Icon = STYLE_ICONS[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={cn(
                      "rounded-xl border p-2.5 text-left transition-colors",
                      style === s ? "border-violet-600 bg-violet-600/5" : "hover:bg-muted/60",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mb-1 size-4",
                        style === s ? "text-violet-600" : "text-muted-foreground",
                      )}
                    />
                    <p className="text-sm font-medium leading-tight">{L(STYLE_LABELS[s])}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {L(STYLE_HINTS[s])}
                    </p>
                  </button>
                );
              })}
            </div>
            <Textarea
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={pick(
                "Optional direction, e.g. coffee steam rising, warm morning light",
                "Arahan opsional, mis. uap kopi naik, cahaya pagi hangat",
              )}
            />
          </Step>

          <Step n={3} title={pick("Format", "Format")}>
            <div className="grid grid-cols-2 gap-3">
              <Segmented
                label={pick("Duration", "Durasi")}
                value={String(duration)}
                options={AI_DURATIONS.map((d) => ({
                  value: String(d),
                  label: `${d} ${pick("sec", "detik")}`,
                }))}
                onChange={(v) => setDuration(Number(v) as 5 | 10)}
              />
              <Segmented
                label={pick("Ratio", "Rasio")}
                value={ratio}
                options={AI_RATIOS.map((r) => ({
                  value: r,
                  label: r === "9:16" ? "9:16 Reels" : "1:1 Feed",
                }))}
                onChange={(v) => setRatio(v as (typeof AI_RATIOS)[number])}
              />
            </div>
          </Step>

          <Step n={4} title={pick("Quality", "Kualitas")}>
            <div className="space-y-2">
              {access.tiers.map((t) => {
                const c = duration >= 10 ? t.credits_10s : t.credits_5s;
                return (
                  <button
                    key={t.tier}
                    type="button"
                    onClick={() => setTier(t.tier)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      tier === t.tier ? "border-violet-600 bg-violet-600/5" : "hover:bg-muted/60",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium">{L(TIER_LABELS[t.tier])}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {L(TIER_HINTS[t.tier])}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {c}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {pick("cr", "kr")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Step>

          <div className="space-y-3 border-t pt-5">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                className="mt-0.5"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
              />
              {pick(
                "I own this photo or may use it, and it shows no public figures. The video is labelled “AI”.",
                "Foto ini milik saya atau saya berhak memakainya, dan tidak menampilkan tokoh publik. Video diberi label “AI”.",
              )}
            </label>
            {enough ? (
              <Button
                size="xl"
                className="w-full rounded-full bg-violet-600 text-white hover:bg-violet-700"
                disabled={!!blocker || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {pick(`Create video · ${cost} credits`, `Buat video · ${cost} kredit`)}
              </Button>
            ) : (
              <Button
                size="xl"
                variant="navy"
                className="w-full rounded-full"
                onClick={() => setBuyOpen(true)}
              >
                <Coins />
                {pick(
                  `Need ${cost - access.credits} more credits · Buy`,
                  `Kurang ${cost - access.credits} kredit · Beli`,
                )}
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {blocker && enough ? blocker + " · " : ""}
              {pick("Today", "Hari ini")} {access.used_today}/{access.daily_limit} video ·{" "}
              {pick("failed videos are refunded", "video gagal, kredit kembali")}
            </p>
          </div>
        </div>

        {/* Panggung pratinjau */}
        <div className="-order-1 lg:order-none lg:col-start-2 lg:row-start-1">
          <Stage
            ratio={viewJob ? viewJob.aspect_ratio : ratio}
            job={viewJob}
            photoUrl={viewJob?.source_path ? fileUrl(viewJob.source_path) : (selected?.url ?? null)}
            caption={
              viewJob
                ? `${L(STYLE_LABELS[viewJob.style])} · ${L(TIER_LABELS[viewJob.tier])} · ${viewJob.duration_s}s`
                : `${L(STYLE_LABELS[style])} · ${L(TIER_LABELS[tier])} · ${duration}s · ${ratio}`
            }
            onBack={viewJob ? () => setViewing(null) : undefined}
            onSchedule={(j) => schedule.mutate(j)}
            scheduling={schedule.isPending}
          />
        </div>

        <section className="space-y-3 lg:col-start-2 lg:row-start-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{pick("Your videos", "Video Anda")}</h2>
            {active && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {pick("processing, usually 1–3 min", "sedang dibuat, biasanya 1–3 menit")}
              </span>
            )}
          </div>
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {pick(
                "Videos you create appear here and in Media, ready to download or schedule.",
                "Video yang Anda buat muncul di sini dan di Media, siap diunduh atau dijadwalkan.",
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {list.map((j) => (
                <ResultCard
                  key={j.id}
                  job={j}
                  selected={viewing === j.id}
                  onOpen={() => setViewing(j.id)}
                  label={`${L(STYLE_LABELS[j.style])} · ${L(TIER_LABELS[j.tier])}`}
                />
              ))}
            </div>
          )}
        </section>

        <div className="lg:col-start-2 lg:row-start-3">
          <Pricing access={access} onBuy={() => setBuyOpen(true)} />
        </div>
      </div>

      <BuyCredits
        workspaceId={workspaceId}
        access={access}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid size-5 place-items-center rounded-full bg-navy text-[11px] text-primary-foreground dark:bg-violet-600">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex rounded-xl bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              value === o.value
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Panggung studio: latar gelap dengan sorot lampu, bingkai sesuai rasio. */
function Stage({
  ratio,
  job,
  photoUrl,
  caption,
  onBack,
  onSchedule,
  scheduling,
}: {
  ratio: string;
  job: AiJobView | null;
  photoUrl: string | null;
  caption: string;
  onBack?: () => void;
  onSchedule: (j: AiJobView) => void;
  scheduling: boolean;
}) {
  const { pick } = useI18n();
  const vertical = ratio === "9:16";
  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-[#121a2e] px-4 pb-6 pt-12 sm:py-10"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 55% 60% at 50% 38%, rgba(167,139,250,0.22), transparent 70%)",
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20"
        >
          {pick("Back to settings", "Kembali ke pengaturan")}
        </button>
      )}
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded-2xl bg-black/40 shadow-2xl shadow-black/50 ring-1 ring-white/10",
          vertical
            ? "aspect-[9/16] w-[min(100%,220px)] sm:w-[min(100%,300px)]"
            : "aspect-square w-[min(100%,300px)] sm:w-[min(100%,420px)]",
        )}
      >
        {job?.status === "done" && job.result_path ? (
          <video
            key={job.id}
            src={fileUrl(job.result_path)}
            className="size-full object-cover"
            controls
            autoPlay
            muted
            loop
            playsInline
          />
        ) : photoUrl ? (
          <img src={photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/60">
            <ImagePlus className="size-8" />
            {pick("Choose or upload a product photo", "Pilih atau unggah foto produk")}
          </div>
        )}
        {job && running(job) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white backdrop-blur-[2px]">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-sm font-medium">
              {pick("Creating your video", "Membuat video Anda")}
            </p>
            <p className="text-xs tabular-nums text-white/70">
              {clock(job.seconds_elapsed)} · {pick("usually 1–3 min", "biasanya 1–3 menit")}
            </p>
          </div>
        )}
        {job?.status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 p-6 text-center text-white">
            <AlertCircle className="size-7 text-rose-300" />
            <p className="text-sm font-medium">
              {pick("This video failed", "Video ini gagal dibuat")}
            </p>
            <p className="text-xs text-white/70">
              {pick(
                "Credits are back in your balance. Try another photo or style.",
                "Kredit sudah kembali ke saldo. Coba foto atau gaya lain.",
              )}
            </p>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-white/60">{caption}</p>
      {job?.status === "done" && job.result_path && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild variant="onDark" size="sm" className="rounded-full">
            <a href={fileUrl(job.result_path, true)} download>
              <Download /> {pick("Download MP4", "Unduh MP4")}
            </a>
          </Button>
          <Button
            variant="onDark"
            size="sm"
            className="rounded-full"
            disabled={scheduling}
            onClick={() => onSchedule(job)}
          >
            {scheduling ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            {pick("Schedule post", "Jadwalkan posting")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  job,
  selected,
  onOpen,
  label,
}: {
  job: AiJobView;
  selected: boolean;
  onOpen: () => void;
  label: string;
}) {
  const { pick } = useI18n();
  const thumb = job.source_path ? fileUrl(job.source_path) : null;
  return (
    <div
      className={cn(
        "group overflow-hidden rounded-2xl border bg-card",
        selected && "ring-2 ring-violet-600",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[4/5] w-full bg-muted"
      >
        {job.status === "done" && job.result_path ? (
          <video
            src={`${fileUrl(job.result_path)}#t=0.5`}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : thumb ? (
          <img src={thumb} alt="" className="size-full object-cover opacity-60" loading="lazy" />
        ) : null}
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
            job.status === "done"
              ? "bg-violet-600 text-white"
              : job.status === "failed"
                ? "bg-rose-600 text-white"
                : "bg-background/90 text-foreground",
          )}
        >
          {job.status === "done"
            ? "AI"
            : job.status === "failed"
              ? pick("Failed, refunded", "Gagal, kredit kembali")
              : `${pick("Processing", "Diproses")} ${clock(job.seconds_elapsed)}`}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            {job.duration_s}s · {job.aspect_ratio} · {job.credits} {pick("cr", "kr")}
          </p>
        </div>
        {job.status === "done" && job.result_path && (
          <a
            href={fileUrl(job.result_path, true)}
            download
            title={pick("Download", "Unduh")}
            className="grid size-8 shrink-0 place-items-center rounded-full border hover:bg-muted"
          >
            <Download className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}

/** Tabel harga: paket kredit + kredit per video. */
function Pricing({ access, onBuy }: { access: Access; onBuy: () => void }) {
  const { pick, lang } = useI18n();
  const L = (x: { id: string; en: string }) => (lang === "id" ? x.id : x.en);
  return (
    <section className="grid gap-4 rounded-3xl border bg-card p-5 md:grid-cols-2">
      <div>
        <h2 className="font-semibold">{pick("Credit packs", "Paket kredit")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {pick(
            "Pay from your Qalling balance or directly by QRIS/card. Credits never expire.",
            "Bayar dari saldo Qalling atau langsung lewat QRIS/kartu. Kredit tidak hangus.",
          )}
        </p>
        <div className="divide-y text-sm">
          {access.packs.map((p) => (
            <div
              key={p.credits}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-2"
            >
              <span className="font-medium tabular-nums">
                {p.credits} {pick("credits", "kredit")}
              </span>
              <span className="text-right tabular-nums">{rp(p.price_idr)}</span>
              <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                {rp(perCredit(p))}/{pick("cr", "kr")}
              </span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={onBuy}>
          {pick("Buy credits", "Beli kredit")}
        </Button>
      </div>
      <div>
        <h2 className="font-semibold">{pick("Price per video", "Harga per video")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {pick("In credits, deducted when you create.", "Dalam kredit, dipotong saat membuat.")}
        </p>
        <div className="divide-y text-sm">
          <div className="grid grid-cols-[1fr_4rem_4rem] pb-1 text-xs text-muted-foreground">
            <span />
            <span className="text-right">5 {pick("sec", "detik")}</span>
            <span className="text-right">10 {pick("sec", "detik")}</span>
          </div>
          {access.tiers.map((t) => (
            <div key={t.tier} className="grid grid-cols-[1fr_4rem_4rem] py-2">
              <span className="font-medium">{L(TIER_LABELS[t.tier])}</span>
              <span className="text-right tabular-nums">{t.credits_5s}</span>
              <span className="text-right tabular-nums">{t.credits_10s}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Beli paket: dari saldo Qalling, atau bayar langsung (QRIS/kartu) dan kredit masuk otomatis saat lunas. */
function BuyCredits({
  workspaceId,
  access,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  access: Access;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { pick, lang } = useI18n();
  const qc = useQueryClient();
  const packs = access.packs;
  const [credits, setCredits] = useState<number>(packs[0]?.credits ?? 0);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("");
  const pack: CreditPack | undefined = packs.find((p) => p.credits === credits);
  const standard = access.tiers.find((t) => t.tier === "standar") ?? access.tiers[0];

  const activity = useQuery({
    queryKey: ["ai-credit-activity", workspaceId],
    queryFn: () => getCreditActivity({ data: { workspaceId } }),
    enabled: open,
  });
  const tenantId = activity.data?.tenantId;
  const wallet = useQuery({
    queryKey: ["wallet-pay", tenantId],
    enabled: open && Boolean(tenantId) && access.can_buy,
    queryFn: () => getWallet({ data: { tenantId: tenantId!, page: 0 } }),
  });
  const methods = (wallet.data?.methods ?? []).filter(
    (m) => m.provider !== "manual_transfer" && m.available,
  );
  const balance = wallet.data?.balance ?? access.balance_idr;

  useEffect(() => {
    if (open) setKey(crypto.randomUUID());
  }, [open, credits]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
    qc.invalidateQueries({ queryKey: ["ai-credit-activity", workspaceId] });
    qc.invalidateQueries({ queryKey: ["wallet-pay", tenantId] });
  };
  const fromBalance = useMutation({
    mutationFn: () => buyCreditPack({ data: { workspaceId, credits, idempotencyKey: key } }),
    onSuccess: (r) => {
      toast.success(
        pick(
          `${r.bought} credits added. Balance: ${r.credits}`,
          `${r.bought} kredit masuk. Saldo kredit: ${r.credits}`,
        ),
      );
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const direct = useMutation({
    mutationFn: async () => {
      if (!pack || !tenantId) throw new Error("…");
      let returnPath: string | undefined;
      try {
        returnPath = walletReturnPath(window.location.pathname);
      } catch {
        returnPath = undefined;
      }
      return createWalletTopup({
        data: {
          tenantId,
          amount: pack.price_idr,
          gatewayId: method || methods[0]!.id,
          idempotencyKey: key,
          note: `Paket ${pack.credits} kredit Studio AI`,
          returnPath,
          purchase: { kind: "ai_credits", credits: pack.credits },
        },
      });
    },
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
      else
        toast.error(
          pick(
            "Payment link not ready. Try again.",
            "Tautan pembayaran belum tersedia. Coba lagi.",
          ),
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const check = useMutation({
    mutationFn: (id: string) => reconcileWalletTopup({ data: { id } }),
    onSuccess: (r) => {
      if (r.status === "paid")
        toast.success(pick("Paid. Credits added.", "Lunas. Kredit sudah masuk."));
      else toast(pick("Payment not received yet.", "Pembayaran belum diterima."));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pick("Buy AI credits", "Beli kredit AI")}</DialogTitle>
          <DialogDescription>
            {pick("Current balance", "Saldo kredit sekarang")}: {access.credits}{" "}
            {pick("credits", "kredit")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {packs.map((p) => {
            const first = perCredit(packs[0]);
            const save = first > perCredit(p) ? Math.round((1 - perCredit(p) / first) * 100) : 0;
            const videos = standard ? Math.floor(p.credits / standard.credits_5s) : 0;
            return (
              <button
                key={p.credits}
                type="button"
                onClick={() => setCredits(p.credits)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                  credits === p.credits ? "border-violet-600 bg-violet-600/5" : "hover:bg-muted/60",
                )}
              >
                <span>
                  <span className="block font-semibold tabular-nums">
                    {p.credits} {pick("credits", "kredit")}
                    {save > 0 && (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {pick(`save ${save}%`, `hemat ${save}%`)}
                      </span>
                    )}
                  </span>
                  {standard && (
                    <span className="block text-xs text-muted-foreground">
                      {lang === "id"
                        ? `± ${videos} video ${TIER_LABELS[standard.tier].id} 5 detik`
                        : `≈ ${videos} ${TIER_LABELS[standard.tier].en} 5-sec videos`}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular-nums">{rp(p.price_idr)}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {rp(perCredit(p))}/{pick("credit", "kredit")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {!access.can_buy ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            {pick(
              "Only the workspace owner or admin can buy credits. Ask them to top up.",
              "Hanya owner atau admin workspace yang dapat membeli kredit. Minta mereka membelikan.",
            )}
          </p>
        ) : (
          pack && (
            <div className="space-y-3">
              <div className="rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Wallet className="size-4 text-muted-foreground" />
                    {pick("Qalling balance", "Saldo Qalling")}:{" "}
                    <span className="font-medium tabular-nums">{rp(balance)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="navy"
                    className="rounded-full"
                    disabled={balance < pack.price_idr || fromBalance.isPending}
                    onClick={() => fromBalance.mutate()}
                  >
                    {fromBalance.isPending && <Loader2 className="animate-spin" />}
                    {pick("Pay from balance", "Bayar dari saldo")}
                  </Button>
                </div>
                {balance < pack.price_idr && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {pick("Balance is not enough. ", "Saldo belum cukup. ")}
                    <Link to="/qalling/app/billing" className="underline">
                      {pick("Top up balance", "Top up saldo")}
                    </Link>{" "}
                    {pick("or pay directly below.", "atau bayar langsung di bawah.")}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <QrCode className="size-4 text-muted-foreground" />
                  {pick("Pay directly", "Bayar langsung")} {rp(pack.price_idr)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pick(
                    "One payment by QRIS or card. Credits are added automatically once it's confirmed.",
                    "Sekali bayar lewat QRIS atau kartu. Kredit langsung masuk otomatis begitu pembayaran terkonfirmasi.",
                  )}
                </p>
                {methods.length > 1 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left text-xs",
                          (method || methods[0]!.id) === m.id &&
                            "border-violet-600 bg-violet-600/5 font-medium",
                        )}
                      >
                        {m.display_name}
                      </button>
                    ))}
                  </div>
                )}
                {wallet.isSuccess && methods.length === 0 ? (
                  <p className="mt-2 text-xs text-destructive">
                    {pick(
                      "QRIS/card payment is not enabled yet. Use your balance instead.",
                      "Pembayaran QRIS/kartu belum diaktifkan admin. Pakai saldo Qalling.",
                    )}
                  </p>
                ) : (
                  <Button
                    className="mt-3 w-full rounded-full bg-violet-600 text-white hover:bg-violet-700"
                    disabled={direct.isPending || methods.length === 0}
                    onClick={() => direct.mutate()}
                  >
                    {direct.isPending ? <Loader2 className="animate-spin" /> : <QrCode />}
                    {pick(`Pay ${rp(pack.price_idr)}`, `Bayar ${rp(pack.price_idr)}`)}
                  </Button>
                )}
              </div>
            </div>
          )
        )}

        {(activity.data?.pending.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{pick("Awaiting payment", "Menunggu pembayaran")}</p>
            {activity.data!.pending.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs"
              >
                <span>
                  {t.credits} {pick("credits", "kredit")} · {rp(t.amount_idr)}
                </span>
                <span className="flex gap-1">
                  {t.payment_url && (
                    <Button asChild size="sm" variant="ghost" className="h-7">
                      <a href={t.payment_url}>{pick("Continue", "Lanjut bayar")}</a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={check.isPending}
                    onClick={() => check.mutate(t.id)}
                  >
                    <RefreshCw className={cn(check.isPending && "animate-spin")} />
                    {pick("Check", "Cek")}
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        {(activity.data?.ledger.length ?? 0) > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {pick("Credit history", "Riwayat kredit")}
            </summary>
            <div className="mt-2 space-y-1">
              {activity.data!.ledger.map((l, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{l.description}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      l.delta > 0 ? "text-emerald-600" : "text-muted-foreground",
                    )}
                  >
                    {l.delta > 0 ? "+" : ""}
                    {l.delta}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
