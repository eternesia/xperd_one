import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AiVideoInterest } from "@/components/qalling/AiVideoInterest";
import {
  AI_DURATIONS,
  AI_RATIOS,
  AI_STYLES,
  CREDIT_IDR,
  STYLE_LABELS,
  TIER_LABELS,
  type AiStyle,
  type AiTier,
} from "@/lib/ai-studio";
import { createAiVideo, getStudioAccess, listAiJobs } from "@/lib/ai-studio.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MediaLite = { id: string; name: string; mime_type: string | null; url: string | null };

/**
 * Titik masuk Studio AI di Media. Server menentukan aksesnya: selama fitur OFF hanya Super Admin
 * yang melihat Studio (mode uji); pengguna lain tetap melihat tombol "segera hadir" (uji minat).
 */
export function AiStudioEntry({
  workspaceId,
  items,
  className,
}: {
  workspaceId: string;
  items: MediaLite[];
  className?: string;
}) {
  const access = useQuery({
    queryKey: ["ai-studio-access", workspaceId],
    queryFn: () => getStudioAccess({ data: { workspaceId } }),
    staleTime: 60_000,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const { pick } = useI18n();
  if (!access.data?.available)
    return <AiVideoInterest workspaceId={workspaceId} className={className} />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300",
          className,
        )}
      >
        <Sparkles className="size-3.5" />
        {pick("Photo → AI video", "Foto → Video AI")}
        {access.data.mode === "admin_preview" && (
          <span className="rounded-full bg-amber-500 px-1.5 py-px text-[10px] text-white">
            {pick("admin test", "uji admin")}
          </span>
        )}
      </button>
      {open && (
        <StudioDialog
          workspaceId={workspaceId}
          items={items}
          access={access.data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type Access = NonNullable<Awaited<ReturnType<typeof getStudioAccess>>>;

function StudioDialog({
  workspaceId,
  items,
  access,
  onClose,
}: {
  workspaceId: string;
  items: MediaLite[];
  access: Access;
  onClose: () => void;
}) {
  const { pick, lang } = useI18n();
  const L = (x: { id: string; en: string }) => (lang === "id" ? x.id : x.en);
  const qc = useQueryClient();
  const photos = useMemo(
    () =>
      items.filter((m) => ["image/jpeg", "image/png", "image/webp"].includes(m.mime_type ?? "")),
    [items],
  );
  const [source, setSource] = useState<string | null>(null);
  const [style, setStyle] = useState<AiStyle>("zoom");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [ratio, setRatio] = useState<(typeof AI_RATIOS)[number]>("9:16");
  const [tier, setTier] = useState<AiTier>(access.tiers[0]?.tier ?? "hemat");
  const [consent, setConsent] = useState(false);

  const cur = access.tiers.find((t) => t.tier === tier);
  const credits = cur ? (duration >= 10 ? cur.credits_10s : cur.credits_5s) : 0;
  const enough = access.balance_idr >= credits * CREDIT_IDR;
  const limitHit = access.used_today >= access.daily_limit;

  const jobs = useQuery({
    queryKey: ["ai-jobs", workspaceId],
    queryFn: () => listAiJobs({ data: { workspaceId } }),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j) => ["queued", "processing", "saving"].includes(j.status))
        ? 8000
        : false,
  });
  // Saat ada video baru selesai, segarkan pustaka Media.
  const doneCount = (jobs.data ?? []).filter((j) => j.status === "done").length;
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) {
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(pick("AI video saved to Media", "Video AI tersimpan di Media"));
    }
    prevDone.current = doneCount;
  }, [doneCount, qc, workspaceId, pick]);

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
      toast.success(
        pick(
          `Processing (${r.credits} credits). Usually 1–3 minutes.`,
          `Sedang diproses (${r.credits} kredit). Biasanya 1–3 menit.`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["ai-jobs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs transition",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-violet-600" />
            {pick("AI Studio: photo → video", "Studio AI: foto → video")}
          </DialogTitle>
        </DialogHeader>
        {access.mode === "admin_preview" && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            Mode uji Super Admin: fitur ini belum terlihat oleh pengguna. Kredit tetap dipotong dari
            saldo workspace ini.
          </p>
        )}

        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <p className="font-medium">1. {pick("Choose a photo", "Pilih foto")}</p>
            {photos.length === 0 ? (
              <p className="text-muted-foreground">
                {pick(
                  "Upload a product photo (JPG/PNG/WebP) to Media first.",
                  "Unggah foto produk (JPG/PNG/WebP) ke Media terlebih dahulu.",
                )}
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {photos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSource(m.id)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-xl border-2",
                      source === m.id ? "border-primary" : "border-transparent",
                    )}
                    title={m.name}
                  >
                    {m.url && <img src={m.url} alt={m.name} className="size-full object-cover" />}
                    {source === m.id && (
                      <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="font-medium">2. {pick("Style", "Gaya")}</p>
            <div className="flex flex-wrap gap-2">
              {AI_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={chip(style === s)}
                  onClick={() => setStyle(s)}
                >
                  {L(STYLE_LABELS[s])}
                </button>
              ))}
            </div>
            <Textarea
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={pick(
                "Optional note, e.g. coffee steam, warm morning light",
                "Keterangan opsional, mis. uap kopi, cahaya pagi hangat",
              )}
            />
          </section>

          <section className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <p className="font-medium">3. {pick("Duration", "Durasi")}</p>
              <div className="flex gap-2">
                {AI_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={chip(duration === d)}
                    onClick={() => setDuration(d)}
                  >
                    {d} {pick("sec", "detik")}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{pick("Ratio", "Rasio")}</p>
              <div className="flex gap-2">
                {AI_RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={chip(ratio === r)}
                    onClick={() => setRatio(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <p className="font-medium">4. {pick("Quality", "Tingkat")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {access.tiers.map((t) => (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => setTier(t.tier)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    tier === t.tier ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <p className="font-medium">{L(TIER_LABELS[t.tier])}</p>
                  <p className="text-xs text-muted-foreground">
                    {duration >= 10 ? t.credits_10s : t.credits_5s} {pick("credits", "kredit")}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {pick("Balance", "Saldo")}: Rp{access.balance_idr.toLocaleString("id-ID")} ·{" "}
              {pick("today", "hari ini")} {access.used_today}/{access.daily_limit} video
            </p>
          </section>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            {pick(
              "This photo is mine or I have the right to use it, and it does not show public figures. The result is labelled “AI-generated”.",
              "Foto ini milik saya atau saya berhak memakainya, dan tidak menampilkan wajah tokoh publik. Hasil diberi label “dibuat dengan AI”.",
            )}
          </label>

          <Button
            className="w-full rounded-full"
            disabled={!source || !consent || !cur || !enough || limitHit || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {!enough
              ? pick("Insufficient balance, top up first", "Saldo kurang, top up dulu")
              : limitHit
                ? pick("Daily limit reached", "Batas harian tercapai")
                : pick(`Create video · ${credits} credits`, `Buat video · ${credits} kredit`)}
          </Button>

          {(jobs.data?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="font-medium">{pick("Recent", "Terbaru")}</p>
              {jobs.data!.slice(0, 6).map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between rounded-xl border p-2 text-xs"
                >
                  <span>
                    {L(STYLE_LABELS[j.style])} · {L(TIER_LABELS[j.tier])} · {j.duration_s}s
                  </span>
                  {j.status === "done" ? (
                    <Badge>{pick("In Media", "Di Media")}</Badge>
                  ) : j.status === "failed" ? (
                    <Badge variant="destructive">
                      {pick("Failed, refunded", "Gagal, kredit kembali")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      {pick("Processing", "Diproses")}
                    </Badge>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
