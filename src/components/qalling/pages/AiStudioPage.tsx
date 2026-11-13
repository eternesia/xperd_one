import { TemplateSampleDialog, useTemplateSamples } from "@/components/qalling/TemplateSamples";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { uploadFileChunked } from "@/lib/chunked-upload";
import { paletteOf, ratioOf } from "@/lib/image-palette";
import {
  AlertCircle,
  Check,
  Coins,
  Download,
  ImagePlus,
  Images,
  Loader2,
  Mic,
  Play,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Wallet,
  PlayCircle,
  Wand2,
  X,
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_TEXT_USE } from "@/lib/template-prompt";
import { useCrmMedia, useUpload } from "@/components/app/CrmMedia";
import { AccountPicker, useSocialAccounts } from "@/components/app/CrmSocial";
import { AiVideoInterest } from "@/components/qalling/AiVideoInterest";
import {
  AI_DURATIONS,
  AI_RATIOS,
  NOTE_MAX,
  TIER_LABELS,
  jobPercent,
  perCredit,
  type AiJobView,
  type AiTier,
  type CreditPack,
  type StyleView,
} from "@/lib/ai-studio";
import {
  buyCreditPack,
  createAiVideo,
  createTemplateVideo,
  draftTemplateTextFn,
  deleteUserStyle,
  getCreditActivity,
  getStudioAccess,
  listAiJobs,
  listUserStyles,
  saveUserStyle,
} from "@/lib/ai-studio.functions";
import {
  finalSeconds,
  MUSIC_MOODS,
  PHOTOS,
  templateCredits,
  NARRATION,
  TEMPLATE_ACCENTS,
  TEMPLATE_DURATIONS,
  TEMPLATE_LIMITS,
  TEMPLATE_RATIOS,
  TEMPLATE_SECONDS,
  TEMPLATES,
} from "@/lib/ai-templates";
import { useApp } from "@/lib/app-context";
import { saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { toLocalInputValue } from "@/lib/golden-hours";
import { useI18n } from "@/lib/i18n";
import { publishPostNow } from "@/lib/meta-social.functions";
import { validateScheduleTime } from "@/lib/post-delivery-rules";
import { cn } from "@/lib/utils";
import { createWalletTopup, getWallet, reconcileWalletTopup } from "@/lib/wallet.functions";
import { walletReturnPath } from "@/lib/wallet/return-url";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const fileUrl = (path: string, download = false) =>
  `/api/workspace-files?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const running = (j: AiJobView) => ["queued", "processing", "saving"].includes(j.status);
const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];
const PAGE = 12;

const TIER_HINTS: Record<AiTier, { id: string; en: string }> = {
  hemat: { id: "Gerakan sederhana", en: "Simple motion" },
  standar: { id: "Halus, untuk kebanyakan produk", en: "Smooth, fits most products" },
  premium: { id: "Detail tertinggi", en: "Highest detail" },
};
const NOTE_IDEAS = [
  { id: "cahaya pagi hangat", en: "warm morning light" },
  { id: "latar sedikit blur", en: "slightly blurred background" },
  { id: "gerakan sangat pelan", en: "very slow motion" },
  { id: "uap naik pelan", en: "steam rising slowly" },
];

/** Gambar dengan placeholder berdenyut sampai selesai dimuat (lazy), supaya grid besar tidak terasa macet. */
function Thumb({
  src,
  alt = "",
  className,
}: {
  src: string | null;
  alt?: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "bad">("loading");
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {state !== "ok" && (
        <span
          className={cn("absolute inset-0 bg-muted", state === "loading" && src && "animate-pulse")}
        />
      )}
      {src && state !== "bad" && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("bad")}
          className={cn(
            "size-full object-cover transition-opacity",
            state === "ok" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}

/** Garis tipis di atas halaman selama data Studio sedang dimuat. */
function LoadingBar({ workspaceId }: { workspaceId: string }) {
  const busy =
    useIsFetching({
      predicate: (q) => {
        const k = q.queryKey;
        return (
          k[1] === workspaceId &&
          ["ai-jobs", "crm-media", "ai-user-styles", "ai-studio-access"].includes(String(k[0]))
        );
      },
    }) > 0;
  return (
    <div className="h-1 overflow-hidden rounded-full" role="status" aria-live="polite">
      {busy && (
        <>
          <div className="h-full w-full animate-pulse rounded-full bg-violet-600/70" />
          <span className="sr-only">Memuat…</span>
        </>
      )}
    </div>
  );
}

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
type Media = ReturnType<typeof useCrmMedia>["data"] extends (infer T)[] | undefined ? T : never;

function Studio({ workspaceId, access }: { workspaceId: string; access: Access }) {
  const { pick, lang } = useI18n();
  const L = (x: { id: string; en: string }) => (lang === "id" ? x.id : x.en);
  const styleName = (s: StyleView) => (lang === "id" ? s.name : s.name_en || s.name);
  const jobStyle = (j: AiJobView) => (lang === "id" ? j.style_label : j.style_label_en);
  const qc = useQueryClient();

  const [tab, setTab] = useState<"create" | "history">("create");
  const mediaQ = useCrmMedia(workspaceId);
  const photos = useMemo(
    () => (mediaQ.data ?? []).filter((m) => PHOTO_MIME.includes(m.mime_type ?? "")),
    [mediaQ.data],
  );
  const upload = useUpload(workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<string | null>(null);
  const [style, setStyle] = useState<string>(access.styles[0]?.key ?? "");
  const [styleTab, setStyleTab] = useState<"builtin" | "mine">("builtin");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [ratio, setRatio] = useState<(typeof AI_RATIOS)[number]>("9:16");
  const [tier, setTier] = useState<AiTier>(
    access.tiers.find((t) => t.tier === "standar")?.tier ?? access.tiers[0]?.tier ?? "hemat",
  );
  const [consent, setConsent] = useState(false);
  // Mode Template: video dari foto + teks (tanpa AI), dirender mesin render.
  // Studio Video: hanya mode Template (Video AI disembunyikan; kodenya tetap untuk dipakai lagi nanti).
  const mode = "template" as "ai" | "template";
  const [tplKey, setTplKey] = useState<string>(TEMPLATES[0].key);
  const [sampleOpen, setSampleOpen] = useState(false);
  const { data: samples = {} } = useTemplateSamples();
  const [tpl, setTpl] = useState({ headline: "", subline: "", badge: "", cta: "" });
  // Mode perintah: pengguna menulis perintah; teks disusun otomatis (bisa disunting).
  const [prompt, setPrompt] = useState("");
  const [draftedFor, setDraftedFor] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<{
    source: "ai" | "rules";
    notice: string | null;
    accent: string | null;
  } | null>(null);
  const [mood, setMood] = useState<string>("auto");
  // Format video: pilihan eksplisit (Reels/Shorts/TikTok, Feed, YouTube) atau ikuti foto.
  const [fmt, setFmt] = useState<"auto" | "9:16" | "1:1" | "16:9">("9:16");
  // Warna & rasio otomatis dari foto pertama (pratinjau); hasil akhir dihitung ulang oleh mesin render.
  const [accent, setAccent] = useState<string>("#F5B301");
  const [dark, setDark] = useState<string>("#0B1020");
  const [tplRatio, setTplRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [tplSeconds, setTplSeconds] = useState<number>(TEMPLATE_SECONDS);
  const [tplSound, setTplSound] = useState(true);
  // Narasi unggahan pengguna: path di storage + durasi (detik) + URL lokal untuk didengar ulang.
  const [narr, setNarr] = useState<{
    path: string;
    seconds: number;
    url: string;
    name: string;
  } | null>(null);
  const [narrBusy, setNarrBusy] = useState(false);
  const narrInput = useRef<HTMLInputElement>(null);
  const onNarration = async (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      setNarrBusy(true);
      const seconds = await new Promise<number>((ok, bad) => {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => ok(a.duration);
        a.onerror = () =>
          bad(new Error(pick("Cannot read this audio file", "Berkas suara tidak terbaca")));
        a.src = url;
      });
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw new Error(pick("Cannot read this audio file", "Berkas suara tidak terbaca"));
      if (seconds > NARRATION.maxSeconds + 0.5)
        throw new Error(
          pick(
            `Narration is ${Math.round(seconds)} s; the maximum is ${NARRATION.maxSeconds} s`,
            `Narasi ${Math.round(seconds)} detik; maksimal ${NARRATION.maxSeconds} detik`,
          ),
        );
      const { path } = await uploadFileChunked({ workspaceId, folder: NARRATION.folder, file });
      setNarr((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { path, seconds, url, name: file.name };
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      toast.error((e as Error).message);
    } finally {
      setNarrBusy(false);
    }
  };
  const isTpl = mode === "template" && access.template.available;
  const isTplMode = isTpl;
  const tplDef = TEMPLATES.find((t) => t.key === tplKey) ?? TEMPLATES[0];
  const tplPhotos = tplDef.photos;
  // Foto terpilih, berurutan (1–10), masing-masing dengan teks dan label opsional.
  const [items, setItems] = useState<{ id: string; title: string; price: string }[]>([]);
  const addItem = (id: string) =>
    setItems((x) =>
      x.some((i) => i.id === id) || x.length >= PHOTOS.max
        ? x
        : [...x, { id, title: "", price: "" }],
    );
  /** Pilih foto: masuk ke daftar foto video. */
  const choose = (id: string) => {
    setSource(id);
    setView(null);
    addItem(id);
  };
  const [view, setView] = useState<AiJobView | null>(null);
  /** Video yang baru dikirim: saat selesai, form dikosongkan untuk video berikutnya. */
  const [watchId, setWatchId] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [postJob, setPostJob] = useState<AiJobView | null>(null);

  // Pratinjau: warna tema dan rasio dari foto pertama, seperti yang dilakukan mesin render.
  const firstUrl = photos.find((m) => m.id === items[0]?.id)?.url ?? null;
  useEffect(() => {
    let live = true;
    const urls = items
      .slice(0, 4)
      .map((i) => photos.find((m) => m.id === i.id)?.url)
      .filter((u): u is string => !!u);
    void Promise.all([paletteOf(urls), ratioOf(urls[0])]).then(([pal, r]) => {
      if (!live) return;
      setAccent(pal.accent);
      setDark(pal.dark);
      setTplRatio(r);
    });
    return () => {
      live = false;
    };
  }, [items, photos]);

  const recent = useQuery({
    queryKey: ["ai-jobs", workspaceId, "recent"],
    queryFn: () => listAiJobs({ data: { workspaceId, status: "active", limit: 6 } }),
    refetchInterval: (q) => ((q.state.data?.items ?? []).some(running) ? 3000 : false),
  });
  const list = useMemo(() => recent.data?.items ?? [], [recent.data]);
  const counts = recent.data?.counts ?? { done: 0, failed: 0, running: 0, total: 0 };

  // Video baru selesai → segarkan Media & riwayat, tampilkan di panggung.
  const prev = useRef<{ done: number; failed: number } | null>(null);
  useEffect(() => {
    if (!recent.isSuccess) return;
    const p = prev.current;
    if (p && counts.done > p.done) {
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-jobs", workspaceId, "history"] });
      toast.success(pick("Your video is ready", "Video Anda sudah jadi"));
      const latest = list.find((j) => j.status === "done");
      if (latest) setView(latest);
    }
    if (p && counts.failed > p.failed)
      qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
    prev.current = { done: counts.done, failed: counts.failed };
  }, [counts.done, counts.failed, recent.isSuccess, list, qc, workspaceId, pick]);
  // Panggung mengikuti status terbaru pekerjaan yang sedang dilihat.
  useEffect(() => {
    if (!view) return;
    const fresh = list.find((j) => j.id === view.id);
    if (fresh && fresh.status !== view.status) setView(fresh);
  }, [list, view]);

  const myStyles = useQuery({
    queryKey: ["ai-user-styles", workspaceId],
    queryFn: () => listUserStyles({ data: { workspaceId } }),
  });
  const removeStyle = useMutation({
    mutationFn: (id: string) => deleteUserStyle({ data: { workspaceId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-user-styles", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const cur = access.tiers.find((t) => t.tier === tier);
  const shownRatio = fmt === "auto" ? tplRatio : fmt;
  const tplFinal = finalSeconds(tplKey, items.length, tplSeconds, narr?.seconds ?? 0);
  const cost = isTpl
    ? templateCredits(access.template.prices, tplFinal)
    : cur
      ? duration >= 10
        ? cur.credits_10s
        : cur.credits_5s
      : 0;
  const tierLabel = (t: AiJobView["tier"]) => (t === "template" ? "Template" : L(TIER_LABELS[t]));
  const enough = access.credits >= cost;
  // Video yang sedang dibuat: tombol dikunci sampai selesai agar tidak terkirim dua kali.
  const busyJob = list.find(running) ?? null;
  const busyPct = busyJob ? jobPercent(busyJob) : 0;

  /** Kosongkan form (foto, perintah, teks) untuk video berikutnya. */
  const resetForm = () => {
    setItems([]);
    setPrompt("");
    setTpl({ headline: "", subline: "", badge: "", cta: "" });
    setDraftedFor(null);
    setDraftInfo(null);
    setNarr(null);
    setMood("auto");
    setConsent(false);
  };
  useEffect(() => {
    if (!watchId) return;
    const j = list.find((x) => x.id === watchId);
    if (!j || running(j)) return;
    setWatchId(null);
    if (j.status === "done") {
      resetForm();
      setView(j);
      toast.success(pick("Video ready", "Video selesai"), {
        description: pick(
          "The form is cleared for your next video. Open this video to make another version.",
          "Form dikosongkan untuk video berikutnya. Buka video ini untuk membuat versi lain.",
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, watchId]);

  /** Muat ulang pengaturan video Template lama ke form (ganti template/format/perintah lalu buat lagi). */
  const remix = (j: AiJobView) => {
    const r = j.recipe;
    if (!r) return;
    if (TEMPLATES.some((t) => t.key === r.template)) setTplKey(r.template);
    setItems(r.items.map((i) => ({ id: i.mediaId, title: i.title, price: i.price })));
    setPrompt(r.brief);
    setTpl({ headline: r.headline, subline: r.subline, badge: r.badge, cta: r.cta });
    setDraftInfo(
      r.brief
        ? { source: "ai", notice: null, accent: /^#/.test(r.accent) ? r.accent : null }
        : null,
    );
    setDraftedFor(
      r.brief ? `${r.template}|${r.items.map((i) => i.mediaId).join(",")}|${r.brief}` : null,
    );
    if (["9:16", "1:1", "16:9"].includes(j.aspect_ratio)) setFmt(j.aspect_ratio as "9:16");
    setMood(r.mood || "auto");
    setTplSound(r.sound);
    if (TEMPLATE_DURATIONS.includes(j.duration_s as never)) setTplSeconds(j.duration_s);
    setNarr(null);
    setView(null);
    toast.info(
      pick(
        "Settings loaded. Change the template, format or prompt, then create again.",
        "Pengaturan dimuat. Ganti template, format, atau perintah, lalu buat lagi.",
      ),
    );
  };
  const limitHit = access.used_today >= access.daily_limit;
  const selected = photos.find((p) => p.id === source) ?? null;
  const curStyle = access.styles.find((s) => s.key === style) ?? access.styles[0];

  /** Kunci susunan: perintah + template + urutan foto. Berubah → disusun ulang saat membuat video. */
  const draftKey = `${tplKey}|${items.map((i) => i.id).join(",")}|${prompt.trim()}`;
  const draft = useMutation({
    mutationFn: (key: string) =>
      draftTemplateTextFn({
        data: {
          workspaceId,
          prompt: prompt.trim(),
          template: tplKey,
          mediaIds: items.map((i) => i.id),
        },
      }).then((d) => ({ d, key })),
    onSuccess: ({ d, key }) => {
      setTpl({ headline: d.headline, subline: d.subline, badge: d.badge, cta: d.cta });
      // Teks per foto dari AI (sesuai isi tiap foto) menggantikan teks lama.
      if (d.items.length)
        setItems((list) =>
          list.map((it, i) =>
            d.items[i] ? { ...it, title: d.items[i].title, price: d.items[i].label } : it,
          ),
        );
      if (d.mood !== "auto") setMood(d.mood);
      setDraftInfo({ source: d.source, notice: d.notice, accent: d.accent });
      setDraftedFor(key);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  /** Perintah/foto/template berubah sejak terakhir disusun → susun ulang sebelum membuat video. */
  const needsDraft = isTplMode && !!prompt.trim() && draftedFor !== draftKey;

  const create = useMutation({
    mutationFn: async (): Promise<unknown> => {
      let text = tpl;
      let photoText = items;
      let accentPick = draftInfo?.accent ?? null;
      // AI sudah diatur tetapi gagal → jangan render teks hasil aturan (sering keliru), minta coba lagi.
      let aiFailed =
        draftInfo?.source === "rules" && !!draftInfo.notice?.startsWith("Asisten AI gagal");
      if (isTpl && needsDraft) {
        const { d } = await draft.mutateAsync(draftKey);
        text = { headline: d.headline, subline: d.subline, badge: d.badge, cta: d.cta };
        photoText = items.map((it, i) =>
          d.items[i] ? { ...it, title: d.items[i].title, price: d.items[i].label } : it,
        );
        accentPick = d.accent;
        aiFailed = d.source === "rules" && !!d.notice?.startsWith("Asisten AI gagal");
      }
      if (isTpl && aiFailed)
        throw new Error(
          pick(
            "The AI assistant failed, so the video was not created (no credits used). Tap Rearrange to try again.",
            "Asisten AI gagal, video belum dibuat (kredit tidak terpakai). Klik Susun ulang untuk mencoba lagi.",
          ),
        );
      if (isTpl && !text.headline.trim())
        throw new Error(pick("Write what the video should say first", "Tulis perintah dulu"));
      return isTpl
        ? createTemplateVideo({
            data: {
              workspaceId,
              sourceMediaId: null,
              items: photoText.map((i) => ({
                mediaId: i.id,
                title: i.title.trim(),
                price: i.price.trim(),
              })),
              sound: tplSound,
              narrationPath: narr?.path ?? null,
              narrationSeconds: narr?.seconds ?? 0,
              template: tplKey,
              headline: text.headline.trim(),
              subline: text.subline.trim(),
              badge: text.badge.trim(),
              cta: text.cta.trim(),
              accent: accentPick ?? "auto",
              aspectRatio: fmt,
              seconds: tplSeconds,
              mood: mood as "auto",
              brief: prompt.trim(),
              consent: true,
            },
          })
        : createAiVideo({
            data: {
              workspaceId,
              sourceMediaId: source!,
              style: curStyle!.key,
              note: note.trim() || undefined,
              tier,
              duration,
              aspectRatio: ratio,
              consent: true,
            },
          });
    },
    onSuccess: async (res) => {
      const createdId = (res as { id?: string } | undefined)?.id;
      if (createdId) setWatchId(createdId);
      qc.invalidateQueries({ queryKey: ["ai-studio-access", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-credit-activity", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-jobs", workspaceId, "history"] });
      const r = await recent.refetch();
      const first = r.data?.items[0];
      if (first) setView(first);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onUpload = async (files: File[]) => {
    if (!files.length) return;
    try {
      const { paths } = await upload.mutateAsync(files);
      await qc.refetchQueries({ queryKey: ["crm-media", workspaceId] });
      const fresh = qc.getQueryData<Media[]>(["crm-media", workspaceId]) ?? [];
      // Semua foto yang diunggah masuk daftar, sesuai urutan unggah.
      for (const path of paths) {
        const hit = fresh.find((m) => m.file_path === path);
        if (hit) choose(hit.id);
      }
      setPickerOpen(false);
    } catch {
      /* toast dari hook unggah */
    }
  };

  const blocker = !isTpl
    ? pick("Studio Video is not available yet", "Studio Video belum tersedia")
    : tplPhotos === "required" && !items.length
      ? pick("Add at least one photo", "Tambahkan minimal 1 foto")
      : isTpl && !prompt.trim()
        ? pick("Write what the video should say first", "Tulis perintah dulu")
        : !isTpl && !curStyle
          ? pick("Choose a style", "Pilih gaya")
          : !consent
            ? pick("Tick the confirmation first", "Centang pernyataan dulu")
            : limitHit
              ? pick("Daily limit reached", "Batas harian tercapai")
              : null;

  const tabBtn = (on: boolean) =>
    cn(
      "min-h-11 rounded-[9px] px-4 text-sm font-medium transition-colors",
      on ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  const pill = (on: boolean) =>
    cn(
      "min-h-12 rounded-xl border px-2 text-[13px] font-medium leading-tight transition-colors",
      on
        ? "border-violet-600 bg-violet-600/10 text-violet-800 ring-1 ring-violet-600 dark:text-violet-200"
        : "hover:bg-muted/60",
    );

  // Desktop: Studio mengisi sisa tinggi layar (dihitung dari posisinya, termasuk banner di atasnya),
  // supaya tombol "Buat video" selalu terlihat tanpa menggulir halaman.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(144);
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (el) setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (rootRef.current?.parentElement) ro.observe(rootRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, []);

  const recentStrip = (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{pick("Recent videos", "Video terbaru")}</h2>
        {counts.total > 0 && (
          <button
            type="button"
            className="text-[13px] text-primary underline-offset-2 hover:underline"
            onClick={() => setTab("history")}
          >
            {pick("See all", "Lihat semua")} ({counts.total})
          </button>
        )}
      </div>
      {recent.isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:flex">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[9/16] animate-pulse rounded-xl bg-muted lg:h-[128px] lg:shrink-0"
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground lg:p-4">
          {pick(
            "Videos you create appear here, ready to download or post.",
            "Video yang Anda buat muncul di sini, siap diunduh atau diposting.",
          )}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:flex lg:overflow-x-auto lg:p-1">
          {list.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setView(j)}
              className={cn(
                "relative aspect-[9/16] overflow-hidden rounded-xl text-left lg:h-[128px] lg:shrink-0",
                view?.id === j.id && "ring-2 ring-violet-600 ring-offset-2 ring-offset-background",
              )}
            >
              <Thumb src={j.source_path ? fileUrl(j.source_path) : null} className="size-full" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-6 text-[11px] font-medium text-white">
                {running(j)
                  ? `${pick("Processing", "Diproses")} ${clock(j.seconds_elapsed)}`
                  : j.status === "failed"
                    ? pick("Failed, refunded", "Gagal, kredit kembali")
                    : jobStyle(j)}
              </span>
              {j.status === "done" && (
                <Play className="absolute left-2 top-2 size-5 rounded-full bg-black/55 p-1 text-white" />
              )}
              {running(j) && (
                <Loader2 className="absolute left-2 top-2 size-5 animate-spin text-white" />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div
      ref={rootRef}
      style={{ "--studio-top": `${top}px` } as React.CSSProperties}
      className="space-y-4 lg:-mt-5 lg:flex lg:h-[calc(100dvh-var(--studio-top)-1rem)] lg:min-h-[560px] lg:flex-col lg:gap-3 lg:space-y-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 lg:gap-5">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-navy dark:text-foreground">
            Studio Video
            {access.mode === "admin_preview" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                {pick("admin test, hidden from users", "uji admin, belum terlihat pengguna")}
              </span>
            )}
          </h1>
          <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              className={tabBtn(tab === "create")}
              onClick={() => setTab("create")}
            >
              {pick("Create video", "Buat video")}
            </button>
            <button
              type="button"
              className={tabBtn(tab === "history")}
              onClick={() => setTab("history")}
            >
              {pick("History", "Riwayat")} ({counts.total})
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-sm text-primary underline-offset-2 hover:underline"
            onClick={() => setPriceOpen(true)}
          >
            {pick("See prices", "Lihat harga")}
          </button>
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm">
            <Coins className="size-4 text-violet-600" aria-hidden="true" />
            <span>
              <span className="font-semibold tabular-nums">{access.credits}</span>{" "}
              {pick("credits", "kredit")}
            </span>
          </div>
          <Button variant="navy" className="min-h-11 rounded-full" onClick={() => setBuyOpen(true)}>
            {pick("Buy credits", "Beli kredit")}
          </Button>
        </div>
      </div>
      <LoadingBar workspaceId={workspaceId} />

      {tab === "history" ? (
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <History
            workspaceId={workspaceId}
            counts={counts}
            jobStyle={jobStyle}
            onOpen={(j) => {
              setView(j);
              setTab("create");
            }}
            onPost={setPostJob}
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(400px,46%)_minmax(0,1fr)] 2xl:grid-cols-[700px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
          {/* Panel pengaturan; tombol Buat video selalu terlihat di bawahnya */}
          <div className="flex flex-col rounded-3xl border bg-card lg:h-full lg:min-h-0">
            <div className="space-y-6 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {!isTpl && (
                <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  {pick(
                    "Studio Video is not open for this workspace yet.",
                    "Studio Video belum dibuka untuk workspace ini.",
                  )}
                </p>
              )}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    {tplPhotos === "optional"
                      ? pick("Photos (optional)", "Foto (opsional)")
                      : pick("Photos", "Foto")}{" "}
                    <span className="font-normal tabular-nums text-muted-foreground">
                      {items.length}/{PHOTOS.max}
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 rounded-full"
                      disabled={items.length >= PHOTOS.max}
                      onClick={() => setPickerOpen(true)}
                    >
                      <Images /> {pick("Choose from Media", "Pilih dari Media")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 rounded-full"
                      disabled={upload.isPending || items.length >= PHOTOS.max}
                      onClick={() => fileInput.current?.click()}
                    >
                      {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                      {pick("Upload", "Unggah")}
                    </Button>
                  </div>
                </div>
                {items.length ? (
                  <ol className="space-y-2">
                    {items.map((it, n) => (
                      <li key={it.id} className="flex items-center gap-2">
                        <span className="w-4 text-xs tabular-nums text-muted-foreground">
                          {n + 1}
                        </span>
                        <Thumb
                          src={photos.find((m) => m.id === it.id)?.url ?? null}
                          className="size-12 shrink-0 rounded-[10px]"
                        />
                        {/* Teks tiap foto disusun AI dari perintah + isi foto (hanya ditampilkan). */}
                        <p className="min-w-0 flex-1 truncate text-sm">
                          {it.title || it.price ? (
                            <>
                              {it.title}
                              {it.price && (
                                <span className="text-muted-foreground"> · {it.price}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {pick("Text arranged by AI", "Teks disusun AI")}
                            </span>
                          )}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 shrink-0"
                          aria-label={pick(`Remove photo ${n + 1}`, `Hapus foto ${n + 1}`)}
                          onClick={() => setItems((x) => x.filter((i) => i.id !== it.id))}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
                  >
                    <Images className="size-5" aria-hidden="true" />
                    {pick(
                      `Add 1 to ${PHOTOS.max} photos. They play in this order.`,
                      `Tambahkan 1 sampai ${PHOTOS.max} foto. Diputar sesuai urutan.`,
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  {pick(
                    "Colours and video shape follow your photos automatically.",
                    "Warna dan bentuk video otomatis mengikuti foto Anda.",
                  )}
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = Array.from(e.target.files ?? []).slice(0, PHOTOS.max - items.length);
                    e.target.value = "";
                    void onUpload(f);
                  }}
                />
              </section>

              {isTpl ? (
                <>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">Template</h2>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={tplKey === t.key}
                          title={lang === "id" ? t.hint : t.hint_en}
                          className={cn(
                            pill(tplKey === t.key),
                            "flex w-full flex-col gap-1.5 p-1.5 text-left text-[12px]",
                          )}
                          onClick={() => setTplKey(t.key)}
                        >
                          <span className="relative block">
                            <TemplateSketch template={t.key} accent={accent} />
                            {samples[t.key] && (
                              <span
                                role="button"
                                tabIndex={0}
                                title={pick("See sample", "Lihat contoh")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTplKey(t.key);
                                  setSampleOpen(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.stopPropagation();
                                    setTplKey(t.key);
                                    setSampleOpen(true);
                                  }
                                }}
                                className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                              >
                                <PlayCircle className="size-4" />
                              </span>
                            )}
                          </span>
                          <span className="block px-0.5 leading-tight">
                            {lang === "id" ? t.name : t.name_en}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {lang === "id" ? tplDef.hint : tplDef.hint_en}
                      </p>
                      {Object.keys(samples).length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSampleOpen(true)}
                        >
                          <PlayCircle />
                          {pick("See sample video", "Lihat contoh video")}
                        </Button>
                      )}
                    </div>
                    <TemplateSampleDialog
                      open={sampleOpen}
                      initialKey={tplKey}
                      lang={lang === "id" ? "id" : "en"}
                      onClose={() => setSampleOpen(false)}
                      onUse={setTplKey}
                    />
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold">{pick("Format", "Format video")}</h2>
                    <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
                      {(
                        [
                          [
                            "9:16",
                            "Reels · TikTok · Shorts",
                            pick("Vertical 9:16", "Vertikal 9:16"),
                            "h-7 w-4",
                          ],
                          ["1:1", "Feed", pick("Square 1:1", "Persegi 1:1"), "h-5 w-5"],
                          ["16:9", "YouTube", pick("Landscape 16:9", "Mendatar 16:9"), "h-4 w-7"],
                          [
                            "auto",
                            pick("Follow photo", "Ikuti foto"),
                            pick("Automatic", "Otomatis"),
                            "h-5 w-5 border-dashed",
                          ],
                        ] as const
                      ).map(([v, label, sub, box]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={fmt === v}
                          onClick={() => setFmt(v)}
                          className={cn(
                            pill(fmt === v),
                            "flex min-h-16 w-full items-center gap-2.5 px-3 py-2 text-left text-[12px]",
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 rounded-[3px] border-2 border-current opacity-70",
                              box,
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 leading-tight">
                            <span className="block font-medium">{label}</span>
                            <span className="block text-[11px] opacity-70">{sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold">
                        {pick("What should the video say?", "Mau videonya bilang apa?")}
                      </h2>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {prompt.length}/2000
                      </span>
                    </div>
                    <Textarea
                      rows={4}
                      maxLength={2000}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={pick(
                        "e.g. Promo iced palm-sugar coffee, 20% off until Sunday, invite people to order on WhatsApp",
                        "mis. Promo kopi susu gula aren, diskon 20% sampai Minggu, ajak pesan lewat WhatsApp",
                      )}
                      className="resize-none text-[15px]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {pick(
                          "Write a brief; titles, text for each photo, call to action, colour and music are arranged by AI from your words and photos. Free.",
                          "Tulis brief-nya; judul, teks tiap foto, ajakan, warna, dan musik disusun AI dari perintah dan foto Anda. Gratis.",
                        )}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={!prompt.trim() || prompt.trim().length < 3 || draft.isPending}
                        onClick={() => draft.mutate(draftKey)}
                      >
                        {draft.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
                        {draftedFor
                          ? pick("Rewrite", "Susun ulang")
                          : pick("Arrange text", "Susun teks")}
                      </Button>
                    </div>
                    {draftedFor && (
                      <div
                        className={cn(
                          "space-y-2 rounded-xl border p-3 text-sm",
                          draftedFor !== draftKey && "opacity-60",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {pick("Text on the video", "Teks di video")}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px]",
                              draftInfo?.source === "ai"
                                ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                            )}
                          >
                            {draftInfo?.source === "ai"
                              ? pick("Arranged by AI", "Disusun AI")
                              : pick("Simple rules (no AI)", "Aturan sederhana (tanpa AI)")}
                          </span>
                        </div>
                        {draftedFor !== draftKey && (
                          <p className="text-xs text-muted-foreground">
                            {pick(
                              "Prompt or photos changed — the text is rearranged when you create the video.",
                              "Perintah atau foto berubah — teks disusun ulang saat membuat video.",
                            )}
                          </p>
                        )}
                        {draftInfo?.notice && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            {draftInfo.notice}
                          </p>
                        )}
                        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[13px]">
                          {(
                            [
                              ["headline", pick("Title", "Judul")],
                              ["subline", pick("Description", "Keterangan")],
                              ["badge", pick("Badge", "Lencana")],
                              ["cta", pick("Call to action", "Ajakan")],
                            ] as const
                          )
                            .filter(
                              ([k]) =>
                                tpl[k] && (TEMPLATE_TEXT_USE[tplKey]?.fields ?? []).includes(k),
                            )
                            .map(([k, label]) => (
                              <Fragment key={k}>
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="min-w-0 break-words">{tpl[k]}</dd>
                              </Fragment>
                            ))}
                          {draftInfo?.accent && (
                            <>
                              <dt className="text-muted-foreground">{pick("Colour", "Warna")}</dt>
                              <dd className="flex items-center gap-1.5">
                                <span
                                  className="size-3.5 rounded-full ring-1 ring-black/10"
                                  style={{ background: draftInfo.accent }}
                                />
                                {draftInfo.accent}
                              </dd>
                            </>
                          )}
                        </dl>
                        {items.some((it) => it.title || it.price) && (
                          <p className="text-xs text-muted-foreground">
                            {pick(
                              "Text for each photo is shown in the photo list above.",
                              "Teks tiap foto tampil di daftar foto di atas.",
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold">
                      {pick("Duration and sound", "Durasi dan suara")}
                    </h2>
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={pick("Duration", "Durasi")}
                    >
                      {TEMPLATE_DURATIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={tplSeconds === d}
                          className={cn(pill(tplSeconds === d), "min-h-11 min-w-16 px-3")}
                          onClick={() => setTplSeconds(d)}
                        >
                          {d} {pick("s", "dtk")}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tplFinal > tplSeconds
                        ? pick(
                            `Final length about ${tplFinal} seconds (lengthened to fit your photos${narr ? " and voice-over" : ""}), ${cost} credits.`,
                            `Durasi akhir sekitar ${tplFinal} detik (dipanjangkan agar cukup untuk foto${narr ? " dan narasi" : ""}), ${cost} kredit.`,
                          )
                        : pick(
                            `${tplFinal} seconds, ${cost} credits.`,
                            `${tplFinal} detik, ${cost} kredit.`,
                          )}
                    </p>
                    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3">
                      <span className="text-sm">
                        {pick("Music and sound effects", "Musik dan efek suara")}
                        <span className="block text-[11px] text-muted-foreground">
                          {pick(
                            "Royalty-free background music, different in every video, plus whoosh and pop on transitions",
                            "Musik latar bebas royalti, berbeda di tiap video, plus whoosh dan pop di setiap pergantian",
                          )}
                        </span>
                      </span>
                      <Switch checked={tplSound} onCheckedChange={setTplSound} />
                    </label>
                    {tplSound && (
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label={pick("Music mood", "Suasana musik")}
                      >
                        {MUSIC_MOODS.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            aria-pressed={mood === m.key}
                            onClick={() => setMood(m.key)}
                            className={cn(pill(mood === m.key), "min-h-9 px-3 text-xs")}
                          >
                            {lang === "id" ? m.name : m.name_en}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">
                          {pick("Voice-over (optional)", "Narasi suara (opsional)")}
                          <span className="block text-[11px] text-muted-foreground">
                            {pick(
                              `Your own recording, MP3/M4A/WAV, up to ${NARRATION.maxSeconds} seconds. The video lengthens to fit it.`,
                              `Rekaman Anda sendiri, MP3/M4A/WAV, maksimal ${NARRATION.maxSeconds} detik. Video memanjang mengikutinya.`,
                            )}
                          </span>
                        </span>
                        {!narr && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 shrink-0 rounded-full"
                            disabled={narrBusy}
                            onClick={() => narrInput.current?.click()}
                          >
                            {narrBusy ? <Loader2 className="animate-spin" /> : <Mic />}
                            {pick("Upload", "Unggah")}
                          </Button>
                        )}
                      </div>
                      {narr && (
                        <div className="flex items-center gap-2">
                          <audio controls src={narr.url} className="h-10 min-w-0 flex-1" />
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {Math.round(narr.seconds)} {pick("s", "dtk")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 shrink-0"
                            aria-label={pick("Remove voice-over", "Hapus narasi")}
                            onClick={() => {
                              URL.revokeObjectURL(narr.url);
                              setNarr(null);
                            }}
                          >
                            <X />
                          </Button>
                        </div>
                      )}
                      <input
                        ref={narrInput}
                        type="file"
                        accept={NARRATION.accept}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          void onNarration(f);
                        }}
                      />
                    </div>
                    {!access.template.worker_online && (
                      <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                        {pick(
                          "The render machine is offline. Your video will wait in the queue; if it is not picked up within 20 minutes the credit is refunded.",
                          "Mesin render sedang tidak terhubung. Video akan menunggu di antrean; bila 20 menit tidak dikerjakan, kredit kembali.",
                        )}
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">
                        {pick("Motion style", "Gaya gerakan")}
                      </h2>
                      <div className="inline-flex gap-1 rounded-[10px] bg-muted p-[3px]">
                        <button
                          type="button"
                          className={cn(
                            tabBtn(styleTab === "builtin"),
                            "min-h-9 rounded-lg px-3 text-xs",
                          )}
                          onClick={() => setStyleTab("builtin")}
                        >
                          {pick("Built-in", "Bawaan")}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            tabBtn(styleTab === "mine"),
                            "min-h-9 rounded-lg px-3 text-xs",
                          )}
                          onClick={() => setStyleTab("mine")}
                        >
                          {pick("My styles", "Gaya saya")} ({myStyles.data?.length ?? 0})
                        </button>
                      </div>
                    </div>
                    {styleTab === "builtin" ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {access.styles.map((s) => (
                            <button
                              key={s.key}
                              type="button"
                              aria-pressed={curStyle?.key === s.key}
                              className={pill(curStyle?.key === s.key)}
                              onClick={() => setStyle(s.key)}
                            >
                              {styleName(s)}
                            </button>
                          ))}
                        </div>
                        {curStyle && (
                          <p className="text-xs text-muted-foreground">
                            {lang === "id" ? curStyle.hint : curStyle.hint_en || curStyle.hint}
                          </p>
                        )}
                      </>
                    ) : myStyles.isLoading ? (
                      <div className="h-12 animate-pulse rounded-xl bg-muted" />
                    ) : (myStyles.data?.length ?? 0) === 0 ? (
                      <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                        {pick(
                          "No saved styles yet. Pick a style, write a direction, then save it to reuse with one tap.",
                          "Belum ada gaya tersimpan. Pilih gaya, tulis arahan, lalu simpan supaya bisa dipakai lagi sekali ketuk.",
                        )}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {myStyles.data!.map((u) => {
                          const base = access.styles.find((s) => s.key === u.style);
                          const on = style === u.style && note === u.note;
                          return (
                            <div key={u.id} className="flex items-stretch gap-1">
                              <button
                                type="button"
                                aria-pressed={on}
                                className={cn(pill(on), "flex-1 px-3 py-2 text-left")}
                                onClick={() => {
                                  setStyle(base?.key ?? access.styles[0]?.key ?? "");
                                  setNote(u.note);
                                }}
                              >
                                <span className="block">{u.name}</span>
                                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                                  {base ? styleName(base) : pick("style removed", "gaya dihapus")}
                                  {u.note ? `, ${u.note}` : ""}
                                </span>
                              </button>
                              {access.can_write && (
                                <button
                                  type="button"
                                  aria-label={pick(`Delete ${u.name}`, `Hapus ${u.name}`)}
                                  className="grid w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive"
                                  onClick={() => removeStyle.mutate(u.id)}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <label htmlFor="ai-note" className="block text-sm font-semibold">
                      {pick("Extra direction", "Arahan tambahan")}{" "}
                      <span className="text-[13px] font-normal text-muted-foreground">
                        ({pick("optional", "opsional")})
                      </span>
                    </label>
                    <Textarea
                      id="ai-note"
                      rows={4}
                      maxLength={NOTE_MAX}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[104px] resize-y text-sm leading-relaxed"
                      placeholder={pick(
                        "Describe the motion you want, e.g. coffee steam rising slowly, warm morning light from the left",
                        "Ceritakan gerakan yang diinginkan, mis. uap kopi naik pelan, cahaya pagi hangat dari kiri",
                      )}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {NOTE_IDEAS.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            className="min-h-9 rounded-full border bg-muted/50 px-3 text-xs hover:bg-muted"
                            onClick={() =>
                              setNote((n) =>
                                `${n.trim()}${n.trim() ? ", " : ""}${L(x)}`.slice(0, NOTE_MAX),
                              )
                            }
                          >
                            + {L(x)}
                          </button>
                        ))}
                      </div>
                      <span className="shrink-0 pt-2 text-xs tabular-nums text-muted-foreground">
                        {note.length}/{NOTE_MAX}
                      </span>
                    </div>
                    {access.can_write && curStyle && (
                      <button
                        type="button"
                        className="min-h-11 text-[13px] font-medium text-primary underline underline-offset-2"
                        onClick={() => setSaveOpen(true)}
                      >
                        {pick(
                          "Save this style + direction to My styles",
                          "Simpan gaya + arahan ini ke Gaya saya",
                        )}
                      </button>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold">
                      {pick("Format and quality", "Format dan kualitas")}
                    </h2>
                    <div className="grid grid-cols-2 gap-2.5">
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
                    <div className="grid grid-cols-3 gap-2">
                      {access.tiers.map((t) => {
                        const c = duration >= 10 ? t.credits_10s : t.credits_5s;
                        return (
                          <button
                            key={t.tier}
                            type="button"
                            aria-pressed={tier === t.tier}
                            title={L(TIER_HINTS[t.tier])}
                            onClick={() => setTier(t.tier)}
                            className={cn(
                              pill(tier === t.tier),
                              "min-h-[60px] px-3 py-2 text-left",
                            )}
                          >
                            <span className="block">{L(TIER_LABELS[t.tier])}</span>
                            <span className="block text-xs font-normal tabular-nums opacity-80">
                              {c} {pick("credits", "kredit")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">{L(TIER_HINTS[tier])}</p>
                  </section>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-b-3xl border-t bg-card px-5 pb-5 pt-4">
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <Checkbox
                  className="mt-0.5 size-5"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                />
                {isTpl
                  ? pick(
                      "This photo is mine and shows no public figures.",
                      "Foto ini milik saya dan tidak menampilkan tokoh publik.",
                    )
                  : pick(
                      "This photo is mine and shows no public figures. The video is labelled AI.",
                      "Foto ini milik saya dan tidak menampilkan tokoh publik. Video diberi label AI.",
                    )}
              </label>
              {enough ? (
                <Button
                  size="xl"
                  className={cn(
                    "relative w-full overflow-hidden rounded-full bg-violet-600 text-white hover:bg-violet-700",
                    busyJob && "disabled:opacity-100",
                  )}
                  disabled={!!blocker || create.isPending || draft.isPending || !!busyJob}
                  aria-busy={create.isPending || !!busyJob}
                  onClick={() => {
                    if (create.isPending || busyJob) return;
                    create.mutate();
                  }}
                >
                  {busyJob && (
                    <span
                      className="absolute inset-y-0 left-0 bg-violet-400/60 transition-[width] duration-700"
                      style={{ width: `${busyPct}%` }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    {create.isPending || draft.isPending || busyJob ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Wand2 />
                    )}
                    {busyJob
                      ? busyJob.status === "queued"
                        ? pick("Waiting in queue…", "Menunggu antrean…")
                        : pick(`Creating video… ${busyPct}%`, `Membuat video… ${busyPct}%`)
                      : draft.isPending
                        ? pick("Arranging text…", "Menyusun teks…")
                        : create.isPending
                          ? pick("Sending…", "Mengirim…")
                          : pick(`Create video, ${cost} credits`, `Buat video, ${cost} kredit`)}
                  </span>
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
                    `${cost - access.credits} more credits needed. Buy`,
                    `Kurang ${cost - access.credits} kredit. Beli`,
                  )}
                </Button>
              )}
              <p className="text-center text-xs text-muted-foreground">
                {blocker && enough
                  ? blocker
                  : pick(
                      `Today ${access.used_today} of ${access.daily_limit} videos. Failed videos are refunded.`,
                      `Hari ini ${access.used_today} dari ${access.daily_limit} video. Kalau gagal, kredit kembali.`,
                    )}
              </p>
            </div>
          </div>

          <div className="-order-1 min-w-0 space-y-5 lg:order-none lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-4 lg:space-y-0">
            <Stage
              ratio={view ? view.aspect_ratio : isTpl ? shownRatio : ratio}
              job={view}
              photoUrl={view?.source_path ? fileUrl(view.source_path) : firstUrl}
              caption={
                view
                  ? `${jobStyle(view)}, ${tierLabel(view.tier)}, ${view.duration_s} ${pick("sec", "detik")}`
                  : isTpl
                    ? `${lang === "id" ? tplDef.name : tplDef.name_en}, ${tplFinal} ${pick("sec", "detik")}, ${shownRatio}, ${items.length} ${pick("photos", "foto")}${narr ? `, ${pick("voice-over", "narasi")}` : ""}`
                    : `${curStyle ? styleName(curStyle) : ""}, ${L(TIER_LABELS[tier])}, ${duration} ${pick("sec", "detik")}, ${ratio}`
              }
              onBack={view ? () => setView(null) : undefined}
              onPost={setPostJob}
              onRemix={remix}
              overlay={
                isTpl && !view ? (
                  <TemplatePreview
                    template={tplKey}
                    text={
                      tplKey === "catalog" || tplKey === "motion"
                        ? {
                            ...tpl,
                            subline: items[0]?.title || pick("Product name", "Nama produk"),
                            badge: items[0]?.price ?? "",
                          }
                        : tplKey === "steps"
                          ? {
                              ...tpl,
                              headline: items[0]?.title || tpl.headline,
                              subline: items[0]?.price || pick("Step 1", "Langkah 1"),
                            }
                          : tplKey === "announce"
                            ? tpl
                            : {
                                ...tpl,
                                headline: items[0]?.title || tpl.headline,
                                badge: items[0]?.price || tpl.badge,
                              }
                    }
                    accent={accent}
                    dark={dark}
                    ratio={shownRatio}
                    photoUrl={firstUrl}
                  />
                ) : null
              }
            />
            <div className="hidden shrink-0 lg:block">{recentStrip}</div>
          </div>
          <div className="lg:hidden">{recentStrip}</div>
        </div>
      )}

      <PhotoPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        photos={photos}
        loading={mediaQ.isLoading}
        selected={source}
        uploading={upload.isPending}
        onUpload={() => fileInput.current?.click()}
        onPick={(id) => {
          choose(id);
          setPickerOpen(false);
        }}
      />
      {curStyle && (
        <SaveStyle
          open={saveOpen}
          onOpenChange={setSaveOpen}
          workspaceId={workspaceId}
          style={curStyle.key}
          styleLabel={styleName(curStyle)}
          note={note}
          onSaved={() => setStyleTab("mine")}
        />
      )}
      {postJob && (
        <PostVideo workspaceId={workspaceId} job={postJob} onClose={() => setPostJob(null)} />
      )}
      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{pick("Prices", "Harga")}</DialogTitle>
            <DialogDescription>
              {pick("Credit packs and credits per video.", "Paket kredit dan kredit per video.")}
            </DialogDescription>
          </DialogHeader>
          <Pricing
            access={access}
            onBuy={() => {
              setPriceOpen(false);
              setBuyOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>
      <BuyCredits
        workspaceId={workspaceId}
        access={access}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />
    </div>
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
    <div role="group" aria-label={label} className="flex rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 flex-1 rounded-[9px] px-2 text-[13px] font-medium transition-colors",
            value === o.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Warna teks yang terbaca di atas warna aksen (sama dengan mesin render). */
function onAccent(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#111827" : "#FFFFFF";
}

/**
 * Pratinjau tata letak template di atas foto (posisi & warna teks, tanpa animasi). Video akhirnya
 * dirender mesin render; ukuran memakai satuan lebar bingkai (cqw) agar proporsinya sama.
 */
function TemplatePreview(p: {
  template: string;
  text: { headline: string; subline: string; badge: string; cta: string };
  accent: string;
  dark: string;
  ratio: string;
  photoUrl: string | null;
}) {
  if (p.ratio !== "16:9") return <TemplatePreviewBody {...p} />;
  // 16:9: ukuran teks mengikuti tinggi (kanvas 1920×1080 memakai ukuran huruf kanvas 1080), jadi satuan
  // cqw diacu ke 56,25% lebar bingkai sementara isinya tetap membentang selebar bingkai.
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="relative h-full w-[56.25%] [container-type:inline-size]">
        <div className="absolute inset-y-0 left-0 w-[177.78%]">
          <TemplatePreviewBody {...p} />
        </div>
      </div>
    </div>
  );
}

/** Mini-diagram tata letak template untuk kartu pilihan. */
function TemplateSketch({ template, accent }: { template: string; accent: string }) {
  const line = (w: string, o = 0.9) => (
    <span className="block h-1 rounded-full bg-white" style={{ width: w, opacity: o }} />
  );
  return (
    <span
      aria-hidden="true"
      className="relative block aspect-[16/10] w-full overflow-hidden rounded-lg"
      style={{
        background:
          template === "showcase" ? accent : "linear-gradient(160deg,#64748b 0%,#1e293b 100%)",
      }}
    >
      {template === "promo" && (
        <>
          <span
            className="absolute right-1.5 top-1.5 h-2.5 w-7 rounded-full"
            style={{ background: accent }}
          />
          <span className="absolute inset-x-2 bottom-2 space-y-1">
            {line("70%")}
            {line("45%", 0.6)}
          </span>
        </>
      )}
      {template === "showcase" && (
        <span className="absolute inset-0 flex items-center gap-2 px-2.5">
          <span className="h-[72%] w-[38%] rounded-md bg-white/90 shadow" />
          <span className="flex-1 space-y-1">
            <span
              className="block h-1 w-[80%] rounded-full"
              style={{ background: onAccent(accent) }}
            />
            <span
              className="block h-1 w-[50%] rounded-full opacity-60"
              style={{ background: onAccent(accent) }}
            />
          </span>
        </span>
      )}
      {template === "catalog" && (
        <>
          <span className="absolute right-1.5 top-1.5 flex gap-0.5">
            <span className="h-1 w-3 rounded-full" style={{ background: accent }} />
            <span className="size-1 rounded-full bg-white/60" />
            <span className="size-1 rounded-full bg-white/60" />
          </span>
          <span className="absolute inset-x-2 bottom-2 space-y-1">
            {line("60%")}
            <span className="block h-2 w-6 rounded-full" style={{ background: accent }} />
          </span>
        </>
      )}
      {template === "steps" && (
        <span className="absolute inset-0 bg-slate-900">
          <span className="absolute left-2 top-2 space-y-1">
            <span className="block h-1 w-8 rounded-full bg-white" />
            <span className="block h-1 w-6 rounded-full" style={{ background: accent }} />
          </span>
          <span
            className="absolute bottom-3 right-2 h-[45%] w-[48%] rounded-sm bg-white/80"
            style={{ outline: `1px solid ${accent}`, outlineOffset: 2 }}
          />
          <span className="absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-white/30">
            <span className="block h-full w-1/2 rounded-full" style={{ background: accent }} />
          </span>
        </span>
      )}
      {template === "motion" && (
        <span className="absolute inset-0" style={{ background: accent }}>
          <span className="absolute -left-2 top-1/2 h-3 w-[120%] -rotate-12 bg-white/15" />
          <span className="absolute right-2 top-2 h-[62%] w-[40%] rotate-6 rounded-md bg-white/90 shadow" />
          <span className="absolute bottom-2 left-2 w-[42%] space-y-1">
            <span className="block h-1.5 rounded-full" style={{ background: onAccent(accent) }} />
            <span
              className="block h-1 w-[70%] rounded-full opacity-60"
              style={{ background: onAccent(accent) }}
            />
          </span>
        </span>
      )}
      {template === "announce" && (
        <span
          className="absolute inset-0 flex flex-col justify-center gap-1 px-2.5"
          style={{ background: accent }}
        >
          <span
            className="block h-1.5 w-[75%] rounded-full"
            style={{ background: onAccent(accent) }}
          />
          <span
            className="block h-1.5 w-[55%] rounded-full"
            style={{ background: onAccent(accent) }}
          />
          <span
            className="block h-1 w-[40%] rounded-full opacity-60"
            style={{ background: onAccent(accent) }}
          />
        </span>
      )}
      {template === "story" && (
        <span className="absolute inset-y-0 left-2 flex w-[60%] flex-col justify-center gap-1">
          <span className="block h-1 w-4 rounded-full" style={{ background: accent }} />
          {line("90%")}
          {line("70%")}
          {line("50%", 0.6)}
        </span>
      )}
    </span>
  );
}

function TemplatePreviewBody({
  template,
  text,
  accent,
  dark,
  ratio,
  photoUrl,
}: {
  template: string;
  text: { headline: string; subline: string; badge: string; cta: string };
  accent: string;
  dark: string;
  ratio: string;
  photoUrl: string | null;
}) {
  const { pick } = useI18n();
  const ink = onAccent(accent);
  const head = text.headline || pick("Your title", "Judul Anda");
  const wide = ratio === "16:9";
  // 1:1 dan 16:9 memakai tata letak mendatar yang sama (foto kiri, teks kanan).
  const square = ratio !== "9:16";
  const wrap = cn("pointer-events-none absolute inset-0", !wide && "[container-type:inline-size]");
  if (template === "showcase") {
    const copy = (big: string, small: string) => (
      <div style={{ color: ink }}>
        <p className="font-bold leading-tight" style={{ fontSize: big }}>
          {head}
        </p>
        <p style={{ fontSize: small, opacity: 0.85, marginTop: "1.4cqw" }}>{text.subline}</p>
      </div>
    );
    return (
      <div className={wrap} style={{ background: accent }}>
        <div
          className={cn(
            "flex size-full items-center justify-center",
            square ? "flex-row text-left" : "flex-col text-center",
          )}
          style={{ gap: "5cqw", padding: "7cqw" }}
        >
          {!square && copy("8cqw", "3.6cqw")}
          <div
            className="shrink-0 overflow-hidden bg-white shadow-2xl"
            style={{
              width: wide ? "62cqw" : square ? "46cqw" : "68cqw",
              aspectRatio: wide ? "70/86" : square ? "52/68" : "76/90",
              borderRadius: "4.4cqw",
              border: "0.9cqw solid rgba(255,255,255,.9)",
            }}
          >
            {photoUrl && <img src={photoUrl} alt="" className="size-full object-cover" />}
          </div>
          <div style={{ color: ink }} className="min-w-0">
            {square && (wide ? copy("8.2cqw", "3.6cqw") : copy("6.2cqw", "3cqw"))}
            {text.badge && (
              <span
                className="inline-block rounded-full font-bold"
                style={{
                  background: ink === "#FFFFFF" ? "#fff" : "#111827",
                  color: ink === "#FFFFFF" ? "#111827" : "#fff",
                  fontSize: "5.6cqw",
                  padding: "1.6cqw 3.6cqw",
                  marginTop: square ? "2.6cqw" : 0,
                }}
              >
                {text.badge}
              </span>
            )}
            <p className="font-semibold" style={{ fontSize: "3.6cqw", marginTop: "2cqw" }}>
              {text.cta}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (template === "steps") {
    const words = head.split(/\s+/);
    const cut = Math.max(1, Math.ceil(words.length / 2));
    return (
      <div
        className={cn(wrap, "text-white")}
        style={{ background: `linear-gradient(180deg, ${dark}, #05070f)`, padding: "6.5%" }}
      >
        <div className="flex items-center justify-between" style={{ fontSize: "2.8cqw" }}>
          {text.badge ? (
            <span
              className="rounded-md bg-white font-bold"
              style={{ color: dark, padding: "0.8cqw 2cqw" }}
            >
              {text.badge}
            </span>
          ) : (
            <span />
          )}
          <span className="tracking-widest opacity-75">
            LANGKAH <b style={{ color: accent, fontSize: "4.6cqw" }}>01</b>
          </span>
        </div>
        <div
          className="flex items-center gap-[1.6cqw]"
          style={{ marginTop: "7cqw", fontSize: "2.8cqw" }}
        >
          <span style={{ width: "5cqw", height: "0.45cqw", background: accent }} />
          <span className="font-semibold uppercase tracking-[0.3em]" style={{ color: accent }}>
            {text.subline}
          </span>
        </div>
        <p
          className="font-bold leading-[1.08]"
          style={{ fontSize: square ? "7cqw" : "9.4cqw", marginTop: "2cqw" }}
        >
          {words.slice(0, cut).join(" ")}
          <br />
          <span style={{ color: accent }}>{words.slice(cut).join(" ")}</span>
        </p>
        <div
          className="absolute overflow-hidden rounded-[2.4cqw] shadow-2xl"
          style={{
            left: "6.5%",
            right: "6.5%",
            top: square ? "48%" : "29%",
            height: square ? "44%" : "40%",
            outline: `0.5cqw solid ${accent}`,
            outlineOffset: "1.2cqw",
          }}
        >
          {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : null}
        </div>
      </div>
    );
  }
  if (template === "announce")
    return (
      <div
        className={cn(wrap, "flex flex-col justify-center")}
        style={{ padding: "8%", background: accent, color: ink }}
      >
        {text.badge && (
          <span
            className="self-start rounded-full font-bold"
            style={{
              background: ink === "#FFFFFF" ? "#fff" : "#111827",
              color: ink === "#FFFFFF" ? "#111827" : "#fff",
              fontSize: "4.4cqw",
              padding: "1.2cqw 3cqw",
              marginBottom: "3.6cqw",
            }}
          >
            {text.badge}
          </span>
        )}
        <p className="font-bold leading-[1.05]" style={{ fontSize: square ? "10.5cqw" : "12cqw" }}>
          {head}
        </p>
        <span
          className="self-start"
          style={{
            width: "18cqw",
            height: "1.2cqw",
            background: ink,
            borderRadius: 99,
            marginTop: "3.6cqw",
          }}
        />
        <p style={{ fontSize: "4.4cqw", marginTop: "3.2cqw", opacity: 0.85 }}>{text.subline}</p>
        {text.cta && (
          <span
            className="self-start rounded-full font-semibold"
            style={{
              fontSize: "4cqw",
              marginTop: "4.6cqw",
              padding: "1.8cqw 4cqw",
              border: `0.45cqw solid ${ink}`,
            }}
          >
            {text.cta}
          </span>
        )}
      </div>
    );
  if (template === "catalog" || template === "motion")
    return (
      <div
        className={cn(wrap, "text-white")}
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,28,.45), rgba(8,12,28,0) 26%, rgba(8,12,28,0) 50%, rgba(8,12,28,.9))",
        }}
      >
        <p
          className="absolute font-semibold"
          style={{ top: "7cqw", left: "7cqw", right: "7cqw", fontSize: "4cqw" }}
        >
          {head}
        </p>
        <div
          className="absolute"
          style={{ left: "7cqw", right: "7cqw", bottom: square ? "8cqw" : "15cqw" }}
        >
          <p className="font-bold leading-[1.08]" style={{ fontSize: square ? "8cqw" : "9.4cqw" }}>
            {text.subline}
          </p>
          {text.badge && (
            <span
              className="inline-block rounded-full font-bold"
              style={{
                background: accent,
                color: ink,
                fontSize: "5.6cqw",
                marginTop: "2.4cqw",
                padding: "1.6cqw 3.4cqw",
              }}
            >
              {text.badge}
            </span>
          )}
        </div>
      </div>
    );
  if (template === "story")
    return (
      <div
        className={cn(wrap, "flex flex-col justify-center text-white")}
        style={{
          // Persen, bukan cqw: padding elemen kontainer tidak bisa diukur dari kontainernya sendiri.
          padding: "7.5%",
          background:
            "linear-gradient(90deg, rgba(8,12,28,.82), rgba(8,12,28,.45) 55%, rgba(8,12,28,.15))",
        }}
      >
        <span
          style={{
            width: "13cqw",
            height: "1.1cqw",
            background: accent,
            borderRadius: 99,
            marginBottom: "3cqw",
          }}
        />
        {text.badge && (
          <span
            className="self-start font-bold"
            style={{
              background: accent,
              color: ink,
              fontSize: "4cqw",
              padding: "1.2cqw 2.6cqw",
              borderRadius: "1.3cqw",
              marginBottom: "2.6cqw",
            }}
          >
            {text.badge}
          </span>
        )}
        <p className="font-bold leading-[1.06]" style={{ fontSize: "9.6cqw" }}>
          {head}
        </p>
        <p style={{ fontSize: "4.2cqw", marginTop: "2.6cqw", opacity: 0.9 }}>{text.subline}</p>
        {text.cta && (
          <span
            className="self-start font-semibold"
            style={{
              fontSize: "3.9cqw",
              marginTop: "4.6cqw",
              paddingBottom: "0.8cqw",
              borderBottom: `0.55cqw solid ${accent}`,
            }}
          >
            {text.cta}
          </span>
        )}
      </div>
    );
  return (
    <div
      className={cn(wrap, "text-white")}
      style={{
        background:
          "linear-gradient(180deg, rgba(8,12,28,.3) 0%, rgba(8,12,28,0) 30%, rgba(8,12,28,0) 48%, rgba(8,12,28,.88) 100%)",
      }}
    >
      {text.badge && (
        <span
          className="absolute rounded-full font-bold shadow-lg"
          style={{
            top: "7cqw",
            right: "7cqw",
            background: accent,
            color: ink,
            fontSize: "5.4cqw",
            padding: "1.8cqw 3.4cqw",
          }}
        >
          {text.badge}
        </span>
      )}
      <div
        className="absolute"
        style={{ left: "7cqw", right: "7cqw", bottom: square ? "6cqw" : "12cqw" }}
      >
        <p className="font-bold leading-[1.08]" style={{ fontSize: square ? "7.8cqw" : "9.4cqw" }}>
          {head}
        </p>
        <p style={{ fontSize: "3.9cqw", marginTop: "1.8cqw", opacity: 0.9 }}>{text.subline}</p>
        {text.cta && (
          <span
            className="inline-block rounded-full bg-white font-semibold text-[#0b1020]"
            style={{ fontSize: "3.7cqw", marginTop: "3.4cqw", padding: "2cqw 4cqw" }}
          >
            {text.cta}
          </span>
        )}
      </div>
    </div>
  );
}

/** Panggung: latar gelap, bingkai sesuai rasio. Video baru diunduh saat tampil, dengan indikator memuat. */
function Stage({
  ratio,
  job,
  photoUrl,
  caption,
  onBack,
  onPost,
  onRemix,
  overlay,
}: {
  ratio: string;
  job: AiJobView | null;
  photoUrl: string | null;
  caption: string;
  onBack?: () => void;
  onPost: (j: AiJobView) => void;
  onRemix?: (j: AiJobView) => void;
  /** Pratinjau teks template di atas foto (mode Template, sebelum dibuat). */
  overlay?: React.ReactNode;
}) {
  const { pick } = useI18n();
  const vertical = ratio === "9:16";
  const wide = ratio === "16:9";
  const quick = job?.tier === "template";
  const [ready, setReady] = useState(false);
  const videoKey = job?.status === "done" ? job.id : null;
  useEffect(() => setReady(false), [videoKey]);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#121a2e] px-4 pb-6 pt-12 sm:py-9 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:py-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-3 min-h-9 rounded-full bg-white/10 px-3 text-xs text-white hover:bg-white/20"
        >
          {pick("Back to preview", "Kembali ke pratinjau")}
        </button>
      )}
      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:items-center lg:justify-center">
        <div
          className={cn(
            "relative mx-auto overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10 lg:mx-0 lg:max-w-full",
            wide ? "lg:w-full" : "lg:h-full lg:max-h-[720px] lg:w-auto",
            vertical
              ? "aspect-[9/16] w-[min(100%,220px)] sm:w-[min(100%,300px)]"
              : wide
                ? "aspect-video w-full"
                : "aspect-square w-[min(100%,300px)] sm:w-[min(100%,420px)]",
          )}
        >
          {photoUrl ? (
            <Thumb src={photoUrl} className="size-full bg-white/5" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/70">
              <ImagePlus className="size-8" aria-hidden="true" />
              {pick("Choose or upload a product photo", "Pilih atau unggah foto produk")}
            </div>
          )}
          {overlay}
          {job?.status === "done" && job.result_path && (
            <>
              <video
                key={job.id}
                src={fileUrl(job.result_path)}
                poster={photoUrl ?? undefined}
                className={cn("absolute inset-0 size-full object-cover", !ready && "opacity-0")}
                controls
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onLoadedData={() => setReady(true)}
              />
              {!ready && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
                  <Loader2 className="size-7 animate-spin" />
                  <p className="text-xs">{pick("Loading video…", "Memuat video…")}</p>
                </div>
              )}
            </>
          )}
          {job && running(job) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-5 text-white">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm font-medium">
                {pick("Creating your video", "Membuat video Anda")}
              </p>
              {/* Kemajuan dari mesin render (atau perkiraan bila mesin versi lama). */}
              <p className="text-3xl font-semibold tabular-nums">{jobPercent(job)}%</p>
              <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-violet-400 transition-[width] duration-700"
                  style={{ width: `${jobPercent(job)}%` }}
                />
              </div>
              {job.status === "queued" && (
                <p className="text-xs text-white/80">
                  {job.queue_ahead
                    ? pick(
                        `Waiting in queue, ${job.queue_ahead} video(s) ahead`,
                        `Menunggu antrean, ${job.queue_ahead} video di depan`,
                      )
                    : pick("Starting…", "Memulai…")}
                </p>
              )}
              <p className="text-xs tabular-nums text-white/80">
                {clock(job.seconds_elapsed)},{" "}
                {quick
                  ? pick("usually under a minute", "biasanya di bawah 1 menit")
                  : pick("usually 1 to 3 min", "biasanya 1 sampai 3 menit")}
              </p>
            </div>
          )}
          {job?.status === "failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center text-white">
              <AlertCircle className="size-7 text-rose-300" aria-hidden="true" />
              <p className="text-sm font-medium">
                {pick("This video failed", "Video ini gagal dibuat")}
              </p>
              <p className="text-xs text-white/80">
                {pick(
                  "Credits are back in your balance. Try another photo or style.",
                  "Kredit sudah kembali ke saldo. Coba foto atau gaya lain.",
                )}
              </p>
            </div>
          )}
        </div>
      </div>
      {job && running(job) && (
        <div className="mx-auto mt-4 w-full max-w-sm shrink-0">
          <div className="mb-1 flex justify-between text-[12px] text-white/80">
            <span>
              {job.status === "queued"
                ? pick("In queue", "Dalam antrean")
                : pick("Rendering video", "Merender video")}
            </span>
            <span className="tabular-nums">{jobPercent(job)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-violet-400 transition-[width] duration-700"
              style={{ width: `${jobPercent(job)}%` }}
            />
          </div>
        </div>
      )}
      <p className="mt-4 shrink-0 text-center text-[13px] text-white/75">{caption}</p>
      {job?.status === "done" && job.result_path && (
        <div className="mt-4 flex shrink-0 flex-wrap justify-center gap-2">
          <Button asChild variant="onDark" className="min-h-11 rounded-full">
            <a href={fileUrl(job.result_path, true)} download>
              <Download /> {pick("Download MP4", "Unduh MP4")}
            </a>
          </Button>
          <Button
            className="min-h-11 rounded-full bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => onPost(job)}
          >
            <Send /> {pick("Post", "Posting")}
          </Button>
          {job.recipe && onRemix && (
            <Button variant="onDark" className="min-h-11 rounded-full" onClick={() => onRemix(job)}>
              <Wand2 /> {pick("Make another version", "Buat versi lain")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Tab Riwayat: filter status, pencarian, muat bertahap 12 video per halaman. */
function History({
  workspaceId,
  counts,
  jobStyle,
  onOpen,
  onPost,
}: {
  workspaceId: string;
  counts: { done: number; failed: number; running: number; total: number };
  jobStyle: (j: AiJobView) => string;
  onOpen: (j: AiJobView) => void;
  onPost: (j: AiJobView) => void;
}) {
  const { pick, lang } = useI18n();
  const [status, setStatus] = useState<"done" | "running" | "failed">("done");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);
  const pages = useInfiniteQuery({
    queryKey: ["ai-jobs", workspaceId, "history", status, q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listAiJobs({ data: { workspaceId, status, q, limit: PAGE, offset: pageParam } }),
    getNextPageParam: (last, all) => (last.has_more ? all.length * PAGE : undefined),
    refetchInterval: status === "running" ? 5000 : false,
  });
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const chip = (on: boolean) =>
    cn(
      "min-h-11 rounded-full border px-4 text-[13px] font-medium",
      on
        ? "border-violet-600 bg-violet-600/10 text-violet-800 ring-1 ring-violet-600 dark:text-violet-200"
        : "bg-card hover:bg-muted/60",
    );
  const tabs = [
    ["done", pick("Done", "Selesai"), counts.done],
    ["running", pick("Processing", "Diproses"), counts.running],
    ["failed", pick("Failed", "Gagal"), counts.failed],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={status === k}
              className={chip(status === k)}
              onClick={() => setStatus(k)}
            >
              {label} ({n})
            </button>
          ))}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={pick("Search videos", "Cari video")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={pick("photo name or style", "nama foto atau gaya")}
            className="h-11 w-64 max-w-full rounded-full pl-10"
          />
        </div>
      </div>

      {pages.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[4/6] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {q
            ? pick(
                "No videos match that search.",
                "Tidak ada video yang cocok dengan pencarian itu.",
              )
            : pick("Nothing here yet.", "Belum ada video di sini.")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((j) => (
            <article
              key={j.id}
              className="flex flex-col overflow-hidden rounded-2xl border bg-card"
            >
              <button
                type="button"
                className="relative block aspect-[4/5] w-full"
                onClick={() => onOpen(j)}
              >
                <Thumb src={j.source_path ? fileUrl(j.source_path) : null} className="size-full" />
                {j.status === "done" && (
                  <span className="absolute inset-0 grid place-items-center">
                    <Play className="size-10 rounded-full bg-black/55 p-2.5 text-white" />
                  </span>
                )}
                {running(j) && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs text-white">
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> {clock(j.seconds_elapsed)}
                    </span>
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="truncate text-sm font-medium">{jobStyle(j)}</p>
                <p className="text-xs text-muted-foreground">
                  {j.tier === "template"
                    ? "Template"
                    : TIER_LABELS[j.tier][lang === "id" ? "id" : "en"]}
                  , {j.duration_s} {pick("sec", "detik")}, {j.credits} {pick("credits", "kredit")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {j.source_name ?? ""} {j.created_at.slice(0, 16).replace("T", " ")}
                </p>
                {j.status === "failed" && (
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    {pick("Failed, credits refunded", "Gagal, kredit sudah kembali")}
                  </p>
                )}
                {j.status === "done" && j.result_path && (
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      asChild
                      size="sm"
                      variant="navy"
                      className="min-h-11 flex-1 rounded-full"
                    >
                      <a href={fileUrl(j.result_path, true)} download>
                        <Download /> {pick("Download", "Unduh")}
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 flex-1 rounded-full"
                      onClick={() => onPost(j)}
                    >
                      <Send /> {pick("Post", "Posting")}
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {pages.hasNextPage && (
          <Button
            variant="outline"
            className="min-h-11 rounded-full px-6"
            disabled={pages.isFetchingNextPage}
            onClick={() => pages.fetchNextPage()}
          >
            {pages.isFetchingNextPage && <Loader2 className="animate-spin" />}
            {pick("Load more", "Muat lebih banyak")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {pick(
            "All videos are also saved in Media, folder Studio AI.",
            "Semua video juga tersimpan di Media, folder Studio AI.",
          )}
        </p>
      </div>
    </div>
  );
}

/** Pemilih foto besar: pencarian, folder, dan muat bertahap supaya ratusan foto tetap ringan. */
function PhotoPicker({
  open,
  onOpenChange,
  photos,
  loading,
  selected,
  uploading,
  onUpload,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  photos: Media[];
  loading: boolean;
  selected: string | null;
  uploading: boolean;
  onUpload: () => void;
  onPick: (id: string) => void;
}) {
  const { pick } = useI18n();
  const [text, setText] = useState("");
  const [folder, setFolder] = useState("__all");
  const [shown, setShown] = useState(40);
  const folders = useMemo(
    () => [...new Set(photos.map((p) => p.folder).filter((f): f is string => !!f))].sort(),
    [photos],
  );
  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return photos.filter(
      (p) =>
        (folder === "__all" || p.folder === folder) && (!t || p.name.toLowerCase().includes(t)),
    );
  }, [photos, text, folder]);
  useEffect(() => setShown(40), [text, folder, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{pick("Choose a photo", "Pilih foto")}</DialogTitle>
          <DialogDescription>
            {pick(
              "JPG, PNG or WebP from your Media library.",
              "JPG, PNG, atau WebP dari Media Anda.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label={pick("Search photos", "Cari foto")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={pick("Search by file name", "Cari nama berkas")}
              className="h-11 rounded-full pl-10"
            />
          </div>
          {folders.length > 0 && (
            <select
              aria-label={pick("Folder", "Folder")}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="h-11 rounded-full border bg-background px-4 text-sm"
            >
              <option value="__all">{pick("All folders", "Semua folder")}</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            className="min-h-11 rounded-full"
            disabled={uploading}
            onClick={onUpload}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {pick("Upload", "Unggah")}
          </Button>
        </div>
        <div className="min-h-[200px] flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {photos.length
                ? pick("No photos match.", "Tidak ada foto yang cocok.")
                : pick(
                    "No photos yet. Upload one to start.",
                    "Belum ada foto. Unggah satu untuk mulai.",
                  )}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 p-1 sm:grid-cols-5">
                {filtered.slice(0, shown).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    aria-label={m.name}
                    aria-pressed={selected === m.id}
                    onClick={() => onPick(m.id)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-xl",
                      selected === m.id &&
                        "ring-2 ring-violet-600 ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Thumb src={m.url} className="size-full" />
                    {selected === m.id && (
                      <Check className="absolute right-1.5 top-1.5 size-5 rounded-full bg-violet-600 p-0.5 text-white" />
                    )}
                  </button>
                ))}
              </div>
              {filtered.length > shown && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-full"
                    onClick={() => setShown((n) => n + 40)}
                  >
                    {pick("Show more", "Tampilkan lagi")} ({filtered.length - shown})
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SaveStyle({
  open,
  onOpenChange,
  workspaceId,
  style,
  styleLabel,
  note,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  style: string;
  styleLabel: string;
  note: string;
  onSaved: () => void;
}) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName("");
  }, [open]);
  const save = useMutation({
    mutationFn: () =>
      saveUserStyle({ data: { workspaceId, name: name.trim(), style, note: note.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-user-styles", workspaceId] });
      toast.success(pick("Saved to My styles", "Tersimpan di Gaya saya"));
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pick("Save to My styles", "Simpan ke Gaya saya")}</DialogTitle>
          <DialogDescription>
            {pick(
              "Everyone in this workspace can reuse it.",
              "Semua anggota workspace ini bisa memakainya lagi.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{styleLabel}</p>
          <p className="mt-1">
            {note.trim() || pick("No extra direction", "Tanpa arahan tambahan")}
          </p>
        </div>
        <label htmlFor="ai-style-name" className="text-sm font-medium">
          {pick("Style name", "Nama gaya")}
        </label>
        <Input
          id="ai-style-name"
          autoFocus
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={pick("e.g. Morning coffee steam", "mis. Uap kopi pagi")}
          className="h-11"
        />
        <Button
          className="min-h-11 rounded-full"
          variant="navy"
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          {pick("Save style", "Simpan gaya")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Posting video langsung dari Studio: pilih akun, tulis caption, posting sekarang atau jadwalkan. */
function PostVideo({
  workspaceId,
  job,
  onClose,
}: {
  workspaceId: string;
  job: AiJobView;
  onClose: () => void;
}) {
  const { pick } = useI18n();
  const { userId } = useApp();
  const qc = useQueryClient();
  const accounts = useSocialAccounts(workspaceId);
  const publishFn = useServerFn(publishPostNow);
  const [ids, setIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 3600_000)));
  const list = accounts.data ?? [];
  const hasX = list.some((a) => ids.includes(a.id) && a.platform === "x");

  const persist = async (scheduled: boolean) => {
    if (!job.result_path) throw new Error(pick("Video not found", "Video tidak ditemukan"));
    if (!ids.length)
      throw new Error(pick("Select at least one account", "Pilih minimal satu akun"));
    const at = scheduled ? new Date(validateScheduleTime(when, Date.now())) : new Date();
    const saved = await saveWorkspaceRow({
      data: {
        table: "crm_scheduled_posts",
        workspaceId,
        data: {
          title: caption.trim().split("\n")[0].slice(0, 80) || pick("AI video", "Video AI"),
          caption,
          media_url: null,
          media_paths: JSON.stringify([job.result_path]),
          account_ids: JSON.stringify(ids),
          scheduled_at: sqlDateTime(at),
          status: "scheduled",
          last_error: null,
          created_by: userId ?? null,
        },
      },
    });
    return (saved as { id: string }).id;
  };
  const done = () => {
    qc.invalidateQueries({ queryKey: ["crm-posts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-posts-all", workspaceId] });
    onClose();
  };
  const schedule = useMutation({
    mutationFn: () => persist(true),
    onSuccess: () => {
      toast.success(pick("Post scheduled", "Postingan dijadwalkan"));
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const now = useMutation({
    mutationFn: async () => publishFn({ data: { postId: await persist(false) } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          pick(
            "Sent. Video posts can take a few minutes to go live.",
            "Terkirim. Video bisa butuh beberapa menit sampai tayang.",
          ),
        );
        done();
      } else
        toast.error(
          r.results
            .map((x) => x.error)
            .filter(Boolean)
            .join("; ") || pick("Posting failed", "Posting gagal"),
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const busy = schedule.isPending || now.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pick("Post this video", "Posting video ini")}</DialogTitle>
          <DialogDescription>
            {pick(
              "Posted through your connected accounts. You can edit it later in Posts.",
              "Dikirim lewat akun yang terhubung. Bisa diubah lagi di menu Posting.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Thumb
            src={job.source_path ? fileUrl(job.source_path) : null}
            className="mx-auto aspect-[9/16] w-[120px] rounded-xl"
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{pick("Post to", "Posting ke")}</p>
              {accounts.isLoading ? (
                <div className="flex gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="size-12 animate-pulse rounded-full bg-muted" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                  {pick("No accounts connected yet. ", "Belum ada akun terhubung. ")}
                  <Link
                    to="/qalling/app/$submoduleId"
                    params={{ submoduleId: "social-accounts" }}
                    className="underline"
                  >
                    {pick("Connect an account", "Hubungkan akun")}
                  </Link>
                </p>
              ) : (
                <AccountPicker accounts={list} selected={ids} onChange={setIds} />
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="ai-post-caption" className="text-sm font-medium">
                Caption
              </label>
              <Textarea
                id="ai-post-caption"
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={pick(
                  "Write your caption, hashtags and call to action",
                  "Tulis caption, hashtag, dan ajakan",
                )}
              />
            </div>
            {hasX && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                {pick(
                  "Posting to X is charged to your Qalling balance.",
                  "Posting ke X dipotong dari saldo Qalling.",
                )}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Button
                className="min-h-11 rounded-full bg-violet-600 text-white hover:bg-violet-700"
                disabled={busy || !ids.length}
                onClick={() => now.mutate()}
              >
                {now.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                {pick("Post now", "Posting sekarang")}
              </Button>
              <div className="flex flex-1 flex-wrap items-end gap-2 sm:justify-end">
                <div>
                  <label
                    htmlFor="ai-post-when"
                    className="mb-1 block text-xs text-muted-foreground"
                  >
                    {pick("Or schedule for", "Atau jadwalkan pada")}
                  </label>
                  <Input
                    id="ai-post-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-full"
                  disabled={busy || !ids.length}
                  onClick={() => schedule.mutate()}
                >
                  {schedule.isPending && <Loader2 className="animate-spin" />}
                  {pick("Schedule", "Jadwalkan")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
