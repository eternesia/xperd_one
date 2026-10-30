import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Film, ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PaginationBar,
  SearchInput,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import { useApp } from "@/lib/app-context";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { deleteWorkspaceFile, uploadWorkspaceFile } from "@/lib/files.functions";
import { useI18n } from "@/lib/i18n";
import { fmtBytes, storageQuota } from "@/lib/qalling-quota";
import { cn } from "@/lib/utils";

/**
 * Qalling **Media Library** — diporting dari BS New 11 `CrmMedia.tsx`. Berkas disimpan di
 * `STORAGE_DIR` (`crm/media/...`) lewat `uploadWorkspaceFile`, dan ditampilkan lewat rute
 * `/api/workspace-files` (cookie sesi) — bukan bucket Supabase + signed URL.
 * Bar kuota penyimpanan tier (`storageQuota`) belum ada: kuota tier termasuk klaster
 * wallet/entitlement yang menunggu keputusan pemilik produk; tenant tanpa batas tier
 * (mis. langganan flat) di live juga tidak menampilkan bar itu.
 */
export const CRM_MEDIA_FOLDER = "crm/media";
const mediaUrl = (path: string) => `/api/workspace-files?path=${encodeURIComponent(path)}`;
const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read"));
    r.readAsDataURL(file);
  });
const MAX_BYTES = 50 * 1024 * 1024;

export type MediaItem = {
  id: string;
  name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  url: string | null;
};

const isVideo = (m: { mime_type: string | null }) => (m.mime_type ?? "").startsWith("video/");
const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Baris pustaka + URL pratinjau (rute berkas terautentikasi cookie). */
export function useCrmMedia(workspaceId: string) {
  return useQuery({
    queryKey: ["crm-media", workspaceId],
    queryFn: async () => {
      const res = (await listWorkspaceRows({
        data: {
          table: "crm_media",
          workspaceId,
          orderBy: "created_at",
          orderDir: "desc",
          limit: 1000,
        },
      })) as { rows?: Record<string, unknown>[] };
      return (res?.rows ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        file_path: String(r.file_path),
        mime_type: (r.mime_type as string | null) ?? null,
        size_bytes: Number(r.size_bytes) || 0,
        created_at: String(r.created_at),
        url: mediaUrl(String(r.file_path)),
      })) as MediaItem[];
    },
    staleTime: 30 * 60_000,
  });
}

function useUpload(workspaceId: string) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const id = lang === "id";
  const { userId } = useApp();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const out: string[] = [];
      for (const f of files) {
        if (!/^(image|video)\//.test(f.type))
          throw new Error(
            id ? `${f.name}: hanya gambar atau video` : `${f.name}: images or videos only`,
          );
        if (f.size > MAX_BYTES)
          throw new Error(id ? `${f.name}: maksimal 50 MB` : `${f.name}: max 50 MB`);
        const { path } = await uploadWorkspaceFile({
          data: {
            workspaceId,
            folder: CRM_MEDIA_FOLDER,
            fileName: f.name,
            dataUrl: await fileToDataUrl(f),
          },
        });
        try {
          await saveWorkspaceRow({
            data: {
              table: "crm_media",
              workspaceId,
              data: {
                name: f.name,
                file_path: path,
                mime_type: f.type,
                size_bytes: f.size,
                created_by: userId ?? null,
              },
            },
          });
        } catch (error) {
          await deleteWorkspaceFile({ data: { workspaceId, path } }).catch(() => undefined);
          throw error;
        }
        out.push(path);
      }
      return out;
    },
    onSuccess: (paths) => {
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(id ? `${paths.length} file diunggah` : `${paths.length} files uploaded`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function DropZone({ onFiles, busy }: { onFiles: (f: File[]) => void; busy: boolean }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => !busy && ref.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 py-8 text-center transition-colors",
        over && "border-gold bg-gold/10",
      )}
    >
      {busy ? (
        <Loader2 className="h-7 w-7 animate-spin text-gold" />
      ) : (
        <UploadCloud className="h-7 w-7 text-gold" />
      )}
      <p className="text-sm font-medium">
        {id ? "Seret file ke sini atau klik untuk memilih" : "Drop files here or click to browse"}
      </p>
      <p className="text-xs text-muted-foreground">
        {id ? "Gambar atau video, maksimal 50 MB per file" : "Images or videos, up to 50 MB each"}
      </p>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Thumb({ m, className }: { m: MediaItem; className?: string }) {
  if (!m.url)
    return (
      <div className={cn("flex items-center justify-center bg-secondary", className)}>
        <ImageIcon className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  return isVideo(m) ? (
    <video src={m.url} muted preload="metadata" className={cn("object-cover", className)} />
  ) : (
    <img src={m.url} alt={m.name} loading="lazy" className={cn("object-cover", className)} />
  );
}

export function MediaLibraryView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useCrmMedia(workspaceId);
  const upload = useUpload(workspaceId);
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [preview, setPreview] = useState<MediaItem | null>(null);

  const byKind = useMemo(
    () => items.filter((m) => kind === "all" || (kind === "video" ? isVideo(m) : !isVideo(m))),
    [items, kind],
  );
  const filtered = useSearchFilter(byKind, term, (m) => [m.name]);
  const p = usePagination(filtered, 25);
  const total = items.reduce((s, m) => s + Number(m.size_bytes || 0), 0);
  const { entitlements } = useApp();
  const quota = storageQuota(entitlements.qalling?.limits, total);

  const remove = useMutation({
    mutationFn: async (m: MediaItem) => {
      await deleteWorkspaceRow({ data: { table: "crm_media", workspaceId, id: m.id } });
      await deleteWorkspaceFile({ data: { workspaceId, path: m.file_path } }).catch(
        () => undefined,
      );
    },
    onSuccess: () => {
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(id ? "Media dihapus" : "Media deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Qalling CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {id ? "Media" : "Media Library"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} file · {fmtSize(total)} ·{" "}
            {id ? "dipakai saat membuat postingan" : "reused when composing posts"}
          </p>
        </div>
      </div>

      {quota.capBytes != null && (
        <div
          className="space-y-1.5 rounded-xl border border-border bg-card p-4"
          data-testid="storage-quota"
        >
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              {id ? "Penyimpanan" : "Storage"}: {fmtBytes(total)} / {fmtBytes(quota.capBytes)}
            </span>
            <span
              className={cn(
                "font-medium",
                quota.percent >= 90 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {id ? "Sisa" : "Left"} {fmtBytes(quota.remainingBytes ?? 0)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full",
                quota.percent >= 90 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${quota.percent}%` }}
            />
          </div>
        </div>
      )}

      <DropZone
        onFiles={(f) => {
          const incoming = f.reduce((s, x) => s + x.size, 0);
          if (quota.remainingBytes != null && incoming > quota.remainingBytes) {
            toast.error(
              id
                ? `Penyimpanan tidak cukup. Sisa ${fmtBytes(quota.remainingBytes)}, file ${fmtBytes(incoming)}. Hapus file atau upgrade paket.`
                : `Not enough storage left (${fmtBytes(quota.remainingBytes)}).`,
            );
            return;
          }
          upload.mutate(f);
        }}
        busy={upload.isPending}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(["all", "image", "video"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded px-3 py-1 text-sm",
                kind === k && "bg-navy text-primary-foreground",
              )}
            >
              {k === "all"
                ? id
                  ? "Semua"
                  : "All"
                : k === "image"
                  ? id
                    ? "Gambar"
                    : "Images"
                  : "Video"}
            </button>
          ))}
        </div>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={id ? "Cari nama file…" : "Search file name…"}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {items.length
              ? id
                ? "Tidak ada media yang cocok."
                : "No matching media."
              : id
                ? "Belum ada media. Unggah gambar atau video pertama Anda."
                : "No media yet. Upload your first image or video."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {p.items.map((m) => (
              <button
                key={m.id}
                onClick={() => setPreview(m)}
                className="group overflow-hidden rounded-xl border border-border bg-card text-left"
              >
                <div className="relative">
                  <Thumb
                    m={m}
                    className="aspect-square w-full transition-transform group-hover:scale-105"
                  />
                  {isVideo(m) && (
                    <Badge className="absolute left-2 top-2 gap-1">
                      <Film className="h-3 w-3" /> Video
                    </Badge>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtSize(m.size_bytes)}</p>
                </div>
              </button>
            ))}
          </div>
          <PaginationBar p={p} />
        </>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.url &&
            (isVideo(preview) ? (
              <video
                src={preview.url}
                controls
                className="max-h-[60vh] w-full rounded-lg bg-secondary"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[60vh] w-full rounded-lg bg-secondary object-contain"
              />
            ))}
          <p className="text-xs text-muted-foreground">
            {preview &&
              `${fmtSize(preview.size_bytes)} · ${new Date(preview.created_at).toLocaleString(id ? "id-ID" : "en-US")}`}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => preview && remove.mutate(preview)}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" /> {id ? "Hapus" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pick (or upload) library files for a post; returns storage paths. */
export function MediaPickerDialog({
  workspaceId,
  open,
  onOpenChange,
  selected,
  onConfirm,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: string[];
  onConfirm: (paths: string[]) => void;
}) {
  const { lang } = useI18n();
  const id = lang === "id";
  const { data: items = [], isLoading } = useCrmMedia(workspaceId);
  const upload = useUpload(workspaceId);
  const [pick, setPick] = useState<string[]>(selected);
  useEffect(() => {
    if (open) setPick(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toggle = (path: string) =>
    setPick((cur) =>
      cur.includes(path) ? cur.filter((x) => x !== path) : [...cur, path].slice(0, 10),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{id ? "Pilih dari Media" : "Choose from Media"}</DialogTitle>
        </DialogHeader>
        <DropZone
          busy={upload.isPending}
          onFiles={(f) =>
            upload.mutate(f, {
              onSuccess: (paths) => setPick((cur) => [...cur, ...paths].slice(0, 10)),
            })
          }
        />
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {id ? "Memuat…" : "Loading…"}
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {id ? "Belum ada media." : "No media yet."}
          </p>
        ) : (
          <div className="grid max-h-[45vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {items.map((m) => {
              const idx = pick.indexOf(m.file_path);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.file_path)}
                  className={cn(
                    "relative overflow-hidden rounded-lg border-2",
                    idx >= 0 ? "border-gold" : "border-transparent",
                  )}
                >
                  <Thumb m={m} className="aspect-square w-full" />
                  {idx >= 0 && (
                    <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-semibold text-navy">
                      {idx + 1}
                    </span>
                  )}
                  {isVideo(m) && (
                    <Film className="absolute bottom-1 left-1 h-4 w-4 text-primary-foreground drop-shadow" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {pick.length}/10 {id ? "dipilih" : "selected"}
          </span>
          <Button
            onClick={() => {
              onConfirm(pick);
              onOpenChange(false);
            }}
          >
            <Check className="h-4 w-4" /> {id ? "Gunakan" : "Use"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { Thumb as MediaThumb };
