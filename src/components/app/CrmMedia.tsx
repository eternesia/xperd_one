import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Film,
  Folder,
  FolderPlus,
  ImageIcon,
  Loader2,
  Upload,
  Trash2,
  UploadCloud,
} from "lucide-react";
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
import { deleteWorkspaceFile } from "@/lib/files.functions";
import { uploadFileChunked } from "@/lib/chunked-upload";
import { useI18n } from "@/lib/i18n";
import { fmtBytes, storageQuota } from "@/lib/qalling-quota";
import { cn } from "@/lib/utils";
import { AiVideoInterest } from "@/components/qalling/AiVideoInterest";
import { DEFAULT_MEDIA_POLICY, validateMediaFile } from "@/lib/media-upload-policy";
import { compressCrmMedia } from "@/lib/crm-media-compression";
import { getMediaPolicy } from "@/lib/media-policy.functions";

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
export type MediaItem = {
  id: string;
  name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  folder: string | null;
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
        folder: (r.folder as string | null) ?? null,
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
    mutationFn: async (input: File[] | { files: File[]; folder: string | null }) => {
      const files = Array.isArray(input) ? input : input.files;
      const folder = Array.isArray(input) ? null : input.folder;
      const policy = await getMediaPolicy();
      for (const file of files) {
        try {
          validateMediaFile(file, policy, lang);
        } catch (e) {
          throw new Error(`${file.name}: ${(e as Error).message}`);
        }
      }
      const out: string[] = [];
      for (const original of files) {
        // Kompresi hanya setelah unggah dikirim dan tidak pernah menggantikan berkas dengan hasil yang lebih besar.
        const f = await compressCrmMedia(original, policy);
        // Berpotongan kecil agar tidak terkena batas body proxy (±1 MB) pada gambar/video yang lebih besar.
        const { path } = await uploadFileChunked({
          workspaceId,
          folder: CRM_MEDIA_FOLDER,
          file: f,
        });
        try {
          await saveWorkspaceRow({
            data: {
              table: "crm_media",
              workspaceId,
              data: {
                name: original.name,
                file_path: path,
                mime_type: f.type,
                size_bytes: f.size,
                folder,
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
  const { data: policy = DEFAULT_MEDIA_POLICY } = useQuery({
    queryKey: ["media-upload-policy"],
    queryFn: () => getMediaPolicy(),
    staleTime: 60_000,
  });
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
        if (!busy && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
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
        {id
          ? `Foto hingga ${policy.photo_mb} MB · Video hingga ${policy.video_mb} MB`
          : `Photos up to ${policy.photo_mb} MB · Videos up to ${policy.video_mb} MB`}
      </p>
      {busy && (
        <p role="status" className="text-xs text-muted-foreground">
          {id ? "Memproses & mengunggah media…" : "Processing & uploading media…"}
        </p>
      )}
      <input
        ref={ref}
        type="file"
        multiple
        disabled={busy}
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
  // Bungkus + elemen absolut: mencegah baris grid "kempis" di Safari saat gambar dalam tombol/aspect-ratio.
  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      {isVideo(m) ? (
        <video
          src={m.url}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <img
          src={m.url}
          alt={m.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
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
  const [picked, setPicked] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);

  const [folder, setFolder] = useState<string>("__all");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [sort, setSort] = useState<"new" | "old" | "name" | "size">("new");
  const folders = useMemo(
    () =>
      Array.from(
        new Set([...items.map((m) => m.folder).filter((f): f is string => !!f), ...extraFolders]),
      ).sort((a, b) => a.localeCompare(b)),
    [items, extraFolders],
  );
  const targetFolder = folder === "__all" || folder === "__none" ? null : folder;

  const byKind = useMemo(() => {
    const rows = items.filter(
      (m) =>
        (kind === "all" || (kind === "video" ? isVideo(m) : !isVideo(m))) &&
        (folder === "__all" || (folder === "__none" ? !m.folder : m.folder === folder)),
    );
    const cmp: Record<typeof sort, (a: MediaItem, b: MediaItem) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.name.localeCompare(b.name),
      size: (a, b) => Number(b.size_bytes) - Number(a.size_bytes),
    };
    return [...rows].sort(cmp[sort]);
  }, [items, kind, folder, sort]);
  const move = useMutation({
    mutationFn: async ({ m, to }: { m: MediaItem; to: string | null }) => {
      await saveWorkspaceRow({
        data: { table: "crm_media", workspaceId, id: m.id, data: { folder: to } },
      });
      return to;
    },
    onSuccess: (to) => {
      setPreview((p) => (p ? { ...p, folder: to } : p));
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(id ? "Folder diperbarui" : "Folder updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const newFolder = () => {
    const name = window
      .prompt(id ? "Nama folder baru" : "New folder name")
      ?.trim()
      .slice(0, 60);
    if (!name) return;
    setExtraFolders((f) => (f.includes(name) ? f : [...f, name]));
    setFolder(name);
  };
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

  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      const rows = items.filter((m) => ids.includes(m.id));
      for (const m of rows) {
        await deleteWorkspaceRow({ data: { table: "crm_media", workspaceId, id: m.id } });
        await deleteWorkspaceFile({ data: { workspaceId, path: m.file_path } }).catch(
          () => undefined,
        );
      }
      return rows.length;
    },
    onSuccess: (n) => {
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["crm-media", workspaceId] });
      toast.success(id ? `${n} file dihapus` : `${n} files deleted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const togglePick = (mid: string) =>
    setPicked((s) => (s.includes(mid) ? s.filter((x) => x !== mid) : [...s, mid]));
  const pageIds = p.items.map((m) => m.id);
  const allPicked = pageIds.length > 0 && pageIds.every((x) => picked.includes(x));

  const onFiles = (f: File[]) => {
    const incoming = f.reduce((s, x) => s + x.size, 0);
    if (quota.remainingBytes != null && incoming > quota.remainingBytes) {
      toast.error(
        id
          ? `Penyimpanan tidak cukup. Sisa ${fmtBytes(quota.remainingBytes)}, file ${fmtBytes(incoming)}. Hapus file atau upgrade paket.`
          : `Not enough storage left (${fmtBytes(quota.remainingBytes)}).`,
      );
      return;
    }
    upload.mutate({ files: f, folder: targetFolder });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden text-xs uppercase tracking-widest text-gold sm:block">Qalling CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {id ? "Media" : "Media Library"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} file · {fmtSize(total)}
            <span className="hidden sm:inline">
              {" "}
              · {id ? "dipakai saat membuat postingan" : "reused when composing posts"}
            </span>
          </p>
          <AiVideoInterest workspaceId={workspaceId} className="mt-2" />
        </div>
        <label
          className={cn(
            "flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm",
            upload.isPending && "opacity-60",
          )}
          aria-label={id ? "Unggah media" : "Upload media"}
        >
          {upload.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (f.length) onFiles(f);
            }}
          />
        </label>
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

      <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {[
          ["__all", id ? "Semua folder" : "All folders"],
          ["__none", id ? "Tanpa folder" : "Unfiled"],
          ...folders.map((f) => [f, f]),
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFolder(k)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm",
              folder === k
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-secondary",
            )}
          >
            <Folder className="h-3.5 w-3.5" />
            {label}
            <span className="text-xs opacity-70">
              {k === "__all"
                ? items.length
                : items.filter((m) => (k === "__none" ? !m.folder : m.folder === k)).length}
            </span>
          </button>
        ))}
        <Button size="sm" variant="ghost" className="shrink-0" onClick={newFolder}>
          <FolderPlus className="h-4 w-4" />
          {id ? "Folder baru" : "New folder"}
        </Button>
      </div>
      {targetFolder && (
        <p className="-mt-3 text-xs text-muted-foreground">
          {id
            ? `File yang diunggah sekarang masuk ke folder “${targetFolder}”.`
            : `New uploads go to “${targetFolder}”.`}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-secondary p-1">
          {(["all", "image", "video"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm text-muted-foreground",
                kind === k && "bg-background font-medium text-foreground shadow-sm",
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
        <Button
          size="sm"
          variant={selectMode ? "default" : "outline"}
          className="rounded-full sm:hidden"
          onClick={() => {
            setSelectMode((v) => !v);
            setPicked([]);
          }}
        >
          {selectMode ? (id ? "Selesai" : "Done") : id ? "Pilih" : "Select"}
        </Button>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            aria-label={id ? "Urutkan" : "Sort"}
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="new">{id ? "Terbaru" : "Newest"}</option>
            <option value="old">{id ? "Terlama" : "Oldest"}</option>
            <option value="name">{id ? "Nama A–Z" : "Name A–Z"}</option>
            <option value="size">{id ? "Ukuran terbesar" : "Largest"}</option>
          </select>
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder={id ? "Cari nama file…" : "Search file name…"}
          />
        </div>
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
          <div
            className={cn(
              "flex-wrap items-center gap-3 text-sm",
              selectMode || picked.length ? "flex" : "hidden sm:flex",
            )}
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allPicked}
                onChange={() =>
                  setPicked((s) =>
                    allPicked
                      ? s.filter((x) => !pageIds.includes(x))
                      : Array.from(new Set([...s, ...pageIds])),
                  )
                }
              />
              {id ? "Pilih semua" : "Select all"}
            </label>
            {picked.length > 0 && (
              <>
                <span className="text-muted-foreground">
                  {picked.length} {id ? "file dipilih" : "selected"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                  {id ? "Batal" : "Clear"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkRemove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        id
                          ? `Hapus ${picked.length} file? Tindakan ini tidak bisa dibatalkan.`
                          : `Delete ${picked.length} files?`,
                      )
                    )
                      bulkRemove.mutate(picked);
                  }}
                >
                  {id ? "Hapus terpilih" : "Delete selected"}
                </Button>
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-5">
            {p.items.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "relative",
                  picked.includes(m.id) && "rounded-xl ring-2 ring-primary",
                )}
              >
                <input
                  type="checkbox"
                  aria-label={m.name}
                  checked={picked.includes(m.id)}
                  onChange={() => togglePick(m.id)}
                  className={cn(
                    "absolute right-2 top-2 z-10 size-5 accent-primary",
                    !selectMode && !picked.length && "max-sm:hidden",
                  )}
                />
                <button
                  onClick={() => (picked.length || selectMode ? togglePick(m.id) : setPreview(m))}
                  className="group w-full overflow-hidden rounded-lg border border-border bg-card text-left sm:rounded-xl"
                >
                  <div className="relative">
                    <span className="block pt-[100%]" />
                    <Thumb
                      m={m}
                      className="absolute inset-0 transition-transform group-hover:scale-105"
                    />
                    {isVideo(m) && (
                      <Badge className="absolute left-2 top-2 gap-1">
                        <Film className="h-3 w-3" /> Video
                      </Badge>
                    )}
                  </div>
                  <div className="hidden p-2 sm:block">
                    <p className="truncate text-xs font-medium">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtSize(m.size_bytes)}</p>
                  </div>
                </button>
              </div>
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
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Folder className="h-4 w-4" />
              <select
                value={preview?.folder ?? ""}
                disabled={move.isPending}
                onChange={(e) => preview && move.mutate({ m: preview, to: e.target.value || null })}
                className="h-9 rounded-md border border-border bg-background px-2 text-foreground"
              >
                <option value="">{id ? "Tanpa folder" : "Unfiled"}</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
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
  imagesOnly = false,
  maxSelection = 10,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: string[];
  onConfirm: (paths: string[]) => void;
  imagesOnly?: boolean;
  maxSelection?: number;
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
      cur.includes(path)
        ? cur.filter((x) => x !== path)
        : maxSelection === 1
          ? [path]
          : [...cur, path].slice(0, maxSelection),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-sheet max-sm:flex max-sm:flex-col max-sm:border-0 max-sm:p-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{id ? "Pilih dari Media" : "Choose from Media"}</DialogTitle>
        </DialogHeader>
        <DropZone
          busy={upload.isPending}
          onFiles={(f) => {
            if (imagesOnly && f.some((file) => !file.type.startsWith("image/"))) {
              toast.error(id ? "Cover harus berupa gambar" : "Cover must be an image");
              return;
            }
            upload.mutate(f.slice(0, maxSelection), {
              onSuccess: (paths) =>
                setPick((cur) =>
                  maxSelection === 1
                    ? paths.slice(0, 1)
                    : [...cur, ...paths].slice(0, maxSelection),
                ),
            });
          }}
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
          <div className="min-h-0 overflow-y-auto max-sm:flex-1 sm:max-h-[50vh]">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
              {items
                .filter((m) => !imagesOnly || m.mime_type?.startsWith("image/"))
                .map((m) => {
                  const idx = pick.indexOf(m.file_path);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.file_path)}
                      className={cn(
                        "relative block w-full overflow-hidden rounded-xl border-2",
                        idx >= 0 ? "border-gold" : "border-transparent",
                      )}
                    >
                      {/* trik padding 100%: tinggi kotak selalu = lebar, tidak bisa "kempis" di grid */}
                      <span className="block pt-[100%]" />
                      <Thumb m={m} className="absolute inset-0" />
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
          </div>
        )}
        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {pick.length}/{maxSelection} {id ? "dipilih" : "selected"}
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
