import { useEffect, useMemo, useState } from "react";
import { validateScheduleTime } from "@/lib/post-delivery-rules";
import {
  COMMENT_LIMITS,
  supportsFirstComment,
  supportsVideoCover,
  validateEnhancements,
  type FirstCommentOutcome,
} from "@/lib/post-enhancements";
import { GOLDEN_HOURS, nextGoldenSlot, toLocalInputValue } from "@/lib/golden-hours";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageIcon,
  List,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { MediaPickerDialog, MediaThumb, useCrmMedia } from "@/components/app/CrmMedia";
import { SocialIcon } from "@/components/qalling/SocialIcon";
import {
  PaginationBar,
  SearchInput,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/app-context";
import { accountsFull } from "@/lib/qalling-quota";
import { CRM_SOCIAL_PLATFORMS } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { TablePager } from "@/components/app/admin-table";
import { getMetaSettings, publishPostNow, startMetaConnect } from "@/lib/meta-social.functions";
import {
  disconnectTebarAccount,
  getTebarStatus,
  startTebarConnect,
  syncTebarAccounts,
  syncTebarPosts,
} from "@/lib/tebar.functions";

/**
 * Qalling **Social Accounts / Posts / Insights** — diporting dari BS New 11 `CrmSocial.tsx`:
 * UI, field, dan alur disalin apa adanya; hanya lapisan datanya yang memakai server fn MySQL Old.
 * Kuota tier belum ada (klaster wallet/entitlement menunggu keputusan pemilik produk), jadi tidak
 * ada batas akun yang ditampilkan.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const rowsOf = (r: unknown) => ((r as { rows?: any[] } | undefined)?.rows ?? []) as any[];
const jsonArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};
/** DATETIME UTC dari pool (`dateStrings`) → ISO supaya `new Date()` di browser benar. */
const isoOf = (v: unknown): string => {
  const d = new Date(String(v ?? "").replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
};
const normPost = (r: any): Post & { media_paths: string[] } => ({
  id: String(r.id),
  title: String(r.title ?? ""),
  caption: String(r.caption ?? ""),
  media_url: (r.media_url as string | null) ?? null,
  media_paths: jsonArr(r.media_paths),
  account_ids: jsonArr(r.account_ids),
  scheduled_at: isoOf(r.scheduled_at),
  status: String(r.status),
  last_error: (r.last_error as string | null) ?? null,
  source: String(r.source ?? "manual"),
  permalinks: jsonArr(r.permalinks),
  first_comment: (r.first_comment as string | null) ?? null,
  cover_path: (r.cover_path as string | null) ?? null,
  results: jsonArr(r.results) as unknown as {
    account_id: string;
    first_comment?: FirstCommentOutcome;
  }[],
});

type Account = {
  id: string;
  platform: string;
  account_name: string;
  handle: string | null;
  profile_url: string | null;
  status: string;
  source?: string;
};
type Post = {
  first_comment?: string | null;
  cover_path?: string | null;
  results?: { account_id: string; first_comment?: FirstCommentOutcome }[];
  id: string;
  title: string;
  caption: string;
  media_url: string | null;
  account_ids: string[];
  scheduled_at: string;
  status: string;
  last_error?: string | null;
  source?: string;
  permalinks?: string[];
};

const platformLabel = (id: string) => CRM_SOCIAL_PLATFORMS.find((p) => p.id === id)?.label ?? id;

function useAccounts(workspaceId: string) {
  return useQuery({
    queryKey: ["crm-social-accounts", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_social_accounts",
          workspaceId,
          orderBy: "platform",
          orderDir: "asc",
          limit: 500,
        },
      });
      return rowsOf(res) as Account[];
    },
  });
}

type MetaSettings = {
  app_id: string;
  app_name: string | null;
  status: string;
  last_error: string | null;
  connected_at: string | null;
  native_social_enabled: boolean;
};

export function useMetaSettings(workspaceId: string) {
  const fn = useServerFn(getMetaSettings);
  return useQuery({
    queryKey: ["crm-meta", workspaceId],
    queryFn: async () => (await fn({ data: { workspaceId } })) as MetaSettings | null,
  });
}

const TEBAR_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    hintId: "Business / Creator",
    hintEn: "Business / Creator",
  },
  { id: "facebook", label: "Facebook", hintId: "Halaman", hintEn: "Page" },
  { id: "tiktok", label: "TikTok", hintId: "Profil", hintEn: "Profile" },
  { id: "youtube", label: "YouTube", hintId: "Channel", hintEn: "Channel" },
  { id: "threads", label: "Threads", hintId: "Profil", hintEn: "Profile" },
  { id: "linkedin", label: "LinkedIn", hintId: "Profil pribadi", hintEn: "Personal profile" },
  { id: "x", label: "X", hintId: "Profil", hintEn: "Profile" },
  { id: "telegram", label: "Telegram", hintId: "Channel & grup", hintEn: "Channel & group" },
  { id: "discord", label: "Discord", hintId: "Channel server", hintEn: "Server channel" },
];

/** Sinkronisasi akun Tebar + penanganan hasil kembalian OAuth (?status=connected&state=<workspace>). */
function useTebarSync(workspaceId: string) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const syncFn = useServerFn(syncTebarAccounts);
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { workspaceId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] });
      toast.success(id ? `${r.count} akun tersinkron` : `${r.count} accounts synced`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("status");
    if (!s || q.get("state") !== workspaceId) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (s === "connected") sync.mutate();
    else
      toast.error(
        id
          ? `Koneksi gagal: ${q.get("error") ?? "dibatalkan"}`
          : `Connection failed: ${q.get("error") ?? "cancelled"}`,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  return sync;
}

export function SocialAccountsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts(workspaceId);
  const [open, setOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accPage, setAccPage] = useState(0);
  const sync = useTebarSync(workspaceId);
  const { data: nativeMeta } = useMetaSettings(workspaceId);
  const nativeFn = useServerFn(startMetaConnect);
  const nativeConnect = useMutation({
    mutationFn: () => nativeFn({ data: { workspaceId, origin: window.location.origin } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const status = query.get("meta");
    if (!status) return;
    query.delete("meta");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query.size ? `?${query}` : ""}`,
    );
    qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-meta", workspaceId] });
    if (status === "ok") toast.success(id ? "Akun Meta terhubung." : "Meta accounts connected.");
    else
      toast.error(
        id
          ? "Koneksi Meta belum berhasil. Periksa izin aplikasi dan akun Tebar yang masih aktif."
          : "Meta connection incomplete. Check app permissions and existing Tebar accounts.",
      );
  }, [workspaceId, qc, id]);
  const tebarStatusFn = useServerFn(getTebarStatus);
  const connectFn = useServerFn(startTebarConnect);
  const { data: tebarSt } = useQuery({
    queryKey: ["tebar-status", workspaceId],
    queryFn: () => tebarStatusFn({ data: { workspaceId } }),
  });
  const connect = useMutation({
    mutationFn: (platform: string) => {
      const u = new URL(window.location.href);
      u.search = "";
      return connectFn({ data: { workspaceId, returnUrl: u.toString(), platforms: [platform] } });
    },
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [form, setForm] = useState({
    platform: "instagram",
    account_name: "",
    handle: "",
    profile_url: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.account_name.trim())
        throw new Error(id ? "Nama akun wajib diisi" : "Account name is required");
      await saveWorkspaceRow({
        data: { table: "crm_social_accounts", workspaceId, data: { ...form } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] });
      setOpen(false);
      setForm({ platform: "instagram", account_name: "", handle: "", profile_url: "" });
      toast.success(id ? "Akun ditambahkan" : "Account added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const discFn = useServerFn(disconnectTebarAccount);
  const remove = useMutation({
    mutationFn: async (accId: string) => {
      if (accounts.find((x) => x.id === accId)?.source === "tebar") {
        await discFn({ data: { workspaceId, accountId: accId } });
        return;
      }
      await deleteWorkspaceRow({ data: { table: "crm_social_accounts", workspaceId, id: accId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] }),
  });

  const { entitlements } = useApp();
  const activeCount = accounts.filter((a) => a.status !== "disconnected").length;
  const maxAccounts = entitlements.qalling?.limits.max_accounts ?? null;
  const isFull = accountsFull(entitlements.qalling?.limits, activeCount);
  const shown = (() => {
    const t = search.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) =>
      [a.account_name, a.handle, platformLabel(a.platform)].join(" ").toLowerCase().includes(t),
    );
  })();

  const PAGE = 10;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pg = Math.min(accPage, pages - 1);
  const pageRows = shown.slice(pg * PAGE, pg * PAGE + PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Qalling CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {id ? "Akun Media Sosial" : "Social Accounts"}
          </h1>
          <p className="text-sm text-muted-foreground max-sm:hidden">
            {id
              ? "Hubungkan lebih dari satu akun per platform."
              : "Connect multiple accounts per platform."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
          <div className="flex items-center gap-2 max-sm:[&>button:last-child]:flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || !tebarSt?.ready}
            >
              <RefreshCw className={cn("h-4 w-4", sync.isPending && "animate-spin")} />{" "}
              <span className="max-sm:hidden">{id ? "Sinkronkan" : "Sync"}</span>
            </Button>
            <Button
              onClick={() =>
                isFull
                  ? toast.error(
                      id
                        ? `Kuota akun paket Anda penuh (${maxAccounts}). Upgrade paket untuk menambah akun.`
                        : `Account quota full (${maxAccounts}). Upgrade to add more.`,
                    )
                  : setPickOpen(true)
              }
              variant={isFull ? "outline" : "default"}
            >
              {isFull ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{" "}
              {id ? "Tambah Akun" : "Add Account"}
            </Button>
          </div>
          {maxAccounts != null && (
            <span className="text-xs text-muted-foreground">
              {activeCount}/{maxAccounts} {id ? "akun terpakai" : "accounts used"}
            </span>
          )}
        </div>
      </div>

      {nativeMeta?.native_social_enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4">
          <div className="flex items-center gap-2">
            <p className="font-medium">Facebook & Instagram · Meta</p>
            <Badge variant="outline">Beta</Badge>
          </div>
          <Button
            variant="outline"
            disabled={nativeConnect.isPending}
            onClick={() => nativeConnect.mutate()}
          >
            <Plus className="size-4" />
            {id ? "Hubungkan native" : "Connect natively"}
          </Button>
        </div>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {id ? "Belum ada akun terhubung." : "No accounts connected yet."}
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <p className="text-sm font-medium">
                {shown.length}
                {shown.length !== accounts.length ? ` / ${accounts.length}` : ""}{" "}
                {id ? "akun" : "accounts"}
              </p>
              {accounts.length > 6 && (
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setAccPage(0);
                  }}
                  placeholder={id ? "Cari akun atau platform…" : "Search accounts or platforms…"}
                  className="h-9 w-full rounded-full sm:max-w-64"
                  aria-label={id ? "Cari akun" : "Search accounts"}
                />
              )}
            </div>
            <ul className="divide-y">
              {pageRows.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                    <SocialIcon platform={a.platform} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.account_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {platformLabel(a.platform)}
                      {a.handle ? ` · @${a.handle.replace(/^@/, "")}` : ""}
                    </p>
                  </div>
                  {a.source === "meta" || a.source === "tebar" ? (
                    <Badge className="hidden gap-1 sm:inline-flex">
                      <CheckCircle2 className="h-3 w-3" />
                      {id ? "Terhubung" : "Connected"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      Manual
                    </Badge>
                  )}
                  {a.profile_url && (
                    <a
                      href={a.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={id ? "Buka profil" : "Open profile"}
                      title={id ? "Buka profil" : "Open profile"}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate(a.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {id ? "Tidak ada akun yang cocok." : "No matching accounts."}
                </li>
              )}
            </ul>
            {shown.length > PAGE && (
              <TablePager
                page={pg}
                pages={pages}
                total={shown.length}
                pageSize={PAGE}
                setPage={setAccPage}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id ? "Pilih media sosial" : "Choose a social network"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {id
              ? "Pilih platform, lalu login dan izinkan akses untuk menghubungkan akun."
              : "Pick a platform, then sign in and grant access to connect."}
          </p>
          {tebarSt && !tebarSt.ready ? (
            <p className="text-sm text-muted-foreground">
              {id
                ? "Fitur koneksi belum diaktifkan admin XPERD."
                : "Connection is not enabled by XPERD admin yet."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEBAR_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(p.id)}
                  className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-background">
                    <SocialIcon platform={p.id} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {id ? p.hintId : p.hintEn}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPickOpen(false);
                setOpen(true);
              }}
            >
              {id ? "Tambah manual" : "Add manually"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id ? "Tambah Akun" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <AdminField label="Platform">
              <AdminSelect
                value={form.platform}
                onChange={(v) => setForm({ ...form, platform: v })}
              >
                {CRM_SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={id ? "Nama akun" : "Account name"}>
              <Input
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              />
            </AdminField>
            <AdminField label="Username">
              <Input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="@brand"
              />
            </AdminField>
            <AdminField label={id ? "Link profil" : "Profile URL"}>
              <Input
                value={form.profile_url}
                onChange={(e) => setForm({ ...form, profile_url: e.target.value })}
                placeholder="https://"
              />
            </AdminField>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {id ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const toLocalInput = toLocalInputValue;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-secondary text-foreground",
  published: "bg-gold/20 text-foreground",
  draft: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  publishing: "bg-secondary text-muted-foreground",
};
const STATUS_LABEL = (s: string, id: boolean) =>
  ({
    draft: "Draft",
    scheduled: id ? "Terjadwal" : "Scheduled",
    published: id ? "Terkirim" : "Published",
    failed: id ? "Gagal" : "Failed",
    publishing: id ? "Diproses" : "Publishing",
  })[s] ?? s;

/** Platforms that reject text-only posts. */
const NEEDS_MEDIA = ["instagram", "tiktok", "youtube", "pinterest"];

type Draft = {
  first_comment: string;
  cover_path: string | null;
  results?: { account_id: string; first_comment?: FirstCommentOutcome }[];
  id?: string;
  title: string;
  caption: string;
  media_url: string;
  media_paths: string[];
  account_ids: string[];
  when: string;
  status: string;
  last_error?: string | null;
  source?: string;
  permalinks?: string[];
};

const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-gold",
  facebook: "bg-navy",
  tiktok: "bg-foreground",
  threads: "bg-muted-foreground",
  linkedin: "bg-navy",
  x: "bg-foreground",
};

function AccountChip({ a, active, onClick }: { a: Account; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-gold bg-gold/15 font-medium"
          : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", PLATFORM_DOT[a.platform] ?? "bg-muted-foreground")}
      />
      {platformLabel(a.platform)} · {a.handle ? `@${a.handle.replace(/^@/, "")}` : a.account_name}
      {active && <CheckCircle2 className="h-3 w-3 text-gold" />}
    </button>
  );
}

/** Navigates to a sibling CRM submodule in both the ERP and Qalling shells. */
function useGoSub() {
  const router = useRouter();
  return (sub: string) => {
    const parts = window.location.pathname.replace(/\/$/, "").split("/");
    parts[parts.length - 1] = sub;
    router.history.push(parts.join("/"));
  };
}

/** Composer layar penuh untuk HP: akun berupa avatar, caption memenuhi layar, aksi di bawah. */
function MobileComposer({
  id,
  editing,
  setEditing,
  accounts,
  mediaUrl,
  onPickMedia,
  onNewAccount,
  showFirstComment,
  commentLimit,
  saving,
  publishing,
  onDraft,
  onSchedule,
  onPublishNow,
  onDelete,
}: {
  id: boolean;
  editing: Draft;
  setEditing: (d: Draft) => void;
  accounts: Account[];
  mediaUrl: Map<string, Parameters<typeof MediaThumb>[0]["m"]>;
  onPickMedia: () => void;
  onNewAccount: () => void;
  showFirstComment: boolean;
  commentLimit: number;
  saving: boolean;
  publishing: boolean;
  onDraft: () => void;
  onSchedule: () => void;
  onPublishNow: () => void;
  onDelete?: () => void;
}) {
  const [more, setMore] = useState(false);
  const [when, setWhen] = useState<"now" | "later">(
    editing.id && editing.status === "scheduled" ? "later" : "now",
  );
  const editable = ["draft", "scheduled"].includes(editing.status) && editing.source !== "tebar";
  const toggle = (accId: string) =>
    setEditing({
      ...editing,
      account_ids: editing.account_ids.includes(accId)
        ? editing.account_ids.filter((x) => x !== accId)
        : [...editing.account_ids, accId],
    });
  return (
    <div className="flex h-full min-h-0 flex-col sm:hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4 pr-12">
        <DialogTitle className="text-lg">
          {editing.id ? (id ? "Ubah post" : "Edit post") : id ? "Buat post" : "Create post"}
        </DialogTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {editing.source === "tebar" && (
          <p className="mb-2 rounded border border-gold/40 bg-gold/10 p-2 text-xs">
            {id
              ? "Postingan tersinkron ini hanya dapat dilihat."
              : "This synced post is read-only."}
          </p>
        )}
        {editing.last_error && editing.status === "failed" && (
          <p className="mb-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
            {editing.last_error}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {accounts.map((a) => {
            const on = editing.account_ids.includes(a.id);
            const name = a.handle ? a.handle.replace(/^@/, "") : a.account_name;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className="flex w-16 flex-col items-center gap-1"
                aria-pressed={on}
                aria-label={`${platformLabel(a.platform)} ${name}`}
              >
                <span
                  className={cn(
                    "relative grid size-14 place-items-center rounded-full bg-secondary text-lg font-semibold transition",
                    on
                      ? "ring-[3px] ring-primary ring-offset-2 ring-offset-background"
                      : "opacity-45",
                  )}
                >
                  {(name || "?").charAt(0).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-background bg-background">
                    <SocialIcon platform={a.platform} className="size-3.5" />
                  </span>
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[11px]",
                    !on && "text-muted-foreground",
                  )}
                >
                  {name}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onNewAccount}
            className="flex w-16 flex-col items-center gap-1"
            aria-label={id ? "Akun baru" : "New account"}
          >
            <span className="grid size-14 place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground">
              <Plus className="size-5" />
            </span>
          </button>
        </div>

        <div className="mt-3 flex min-h-[220px] flex-1 flex-col rounded-2xl border bg-card">
          <Textarea
            value={editing.caption}
            onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
            placeholder={id ? "Apa yang ingin kamu bagikan?" : "What do you want to share?"}
            className="min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
            disabled={!editable}
          />
          {editing.media_paths.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-3 pb-2">
              {editing.media_paths.map((path) => {
                const m = mediaUrl.get(path);
                return (
                  <div
                    key={path}
                    className="relative size-16 shrink-0 overflow-hidden rounded-lg border bg-secondary"
                  >
                    {m && <MediaThumb m={m} className="h-full w-full" />}
                    {editable && (
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            media_paths: editing.media_paths.filter((x) => x !== path),
                          })
                        }
                        className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-1 border-t px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onPickMedia}
              disabled={!editable}
              aria-label={id ? "Tambah media" : "Add media"}
            >
              <ImageIcon className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMore((v) => !v)}
              className="text-muted-foreground"
            >
              {id ? "Opsi lainnya" : "More options"}
            </Button>
            <span className="ml-auto pr-2 text-xs text-muted-foreground">
              {editing.caption.length}
            </span>
          </div>
        </div>

        {more && (
          <div className="mt-3 space-y-3 rounded-2xl border p-3">
            {showFirstComment && (
              <AdminField label={id ? "Komentar pertama otomatis" : "Automatic first comment"}>
                <Textarea
                  rows={2}
                  value={editing.first_comment}
                  maxLength={commentLimit}
                  onChange={(e) => setEditing({ ...editing, first_comment: e.target.value })}
                />
              </AdminField>
            )}
            <AdminField label={id ? "Link gambar/video (opsional)" : "Image/video link (optional)"}>
              <Input
                value={editing.media_url}
                onChange={(e) => setEditing({ ...editing, media_url: e.target.value })}
              />
            </AdminField>
            <AdminField label={id ? "Judul internal (opsional)" : "Internal title (optional)"}>
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </AdminField>
            {onDelete && (
              <Button variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> {id ? "Hapus postingan" : "Delete post"}
              </Button>
            )}
          </div>
        )}
      </div>

      {editable && (
        <div className="shrink-0 space-y-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {when === "later" && (
            <div className="space-y-1.5">
              <Input
                type="datetime-local"
                value={editing.when}
                onChange={(e) => setEditing({ ...editing, when: e.target.value })}
              />
              <div className="flex gap-1 overflow-x-auto">
                {GOLDEN_HOURS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        when: toLocalInputValue(nextGoldenSlot(new Date(), g.id)),
                      })
                    }
                  >
                    ⭐ {id ? g.label : g.en} {g.start}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDraft} disabled={saving} className="px-2">
              {id ? "Draf" : "Draft"}
            </Button>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => setWhen(when === "now" ? "later" : "now")}
            >
              <Clock className="size-4" />
              {when === "now" ? (id ? "Sekarang" : "Now") : id ? "Terjadwal" : "Scheduled"}
            </Button>
            <Button
              disabled={saving || publishing || editing.account_ids.length === 0}
              onClick={() => (when === "now" ? onPublishNow() : onSchedule())}
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : when === "now" ? (
                <Send className="size-4" />
              ) : (
                <CalendarDays className="size-4" />
              )}
              {when === "now" ? (id ? "Posting" : "Post") : id ? "Jadwalkan" : "Schedule"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PostSchedulerView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const goSub = useGoSub();
  const { data: allAccounts = [], isLoading: accLoading } = useAccounts(workspaceId);
  const accounts = allAccounts.filter((a) => a.source === "meta" || a.source === "tebar");
  const { data: media = [] } = useCrmMedia(workspaceId);
  const mediaUrl = useMemo(() => new Map(media.map((m) => [m.file_path, m])), [media]);
  const publishFn = useServerFn(publishPostNow);
  const [mode, setMode] = useState<"list" | "week" | "month">("list");
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<Draft | null>(null);
  const [picker, setPicker] = useState(false);
  const [coverPicker, setCoverPicker] = useState(false);
  const [statusTab, setStatusTab] = useState("all");
  const [term, setTerm] = useState("");

  const days = useMemo(() => {
    if (mode === "week") {
      const s = startOfWeek(anchor);
      return Array.from(
        { length: 7 },
        (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i),
      );
    }
    const s = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from(
      { length: 42 },
      (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i),
    );
  }, [mode, anchor]);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["crm-posts", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId,
          orderBy: "scheduled_at",
          orderDir: "desc",
          limit: 1000,
        },
      });
      return rowsOf(res).map(normPost);
    },
  });
  const byDay = useMemo(() => {
    const m = new Map<string, typeof posts>();
    posts.forEach((p) => {
      const k = dayKey(new Date(p.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    return m;
  }, [posts]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    posts.forEach((p) => (c[p.status] = (c[p.status] ?? 0) + 1));
    return c;
  }, [posts]);
  const byStatus = useMemo(
    () => posts.filter((p) => statusTab === "all" || p.status === statusTab),
    [posts, statusTab],
  );
  const filtered = useSearchFilter(byStatus, term, (p) => [p.title, p.caption]);
  const pager = usePagination(filtered, 10);
  const accName = (aid: string) => {
    const a = allAccounts.find((x) => x.id === aid);
    return a
      ? `${platformLabel(a.platform)} · ${a.handle ? `@${a.handle.replace(/^@/, "")}` : a.account_name}`
      : null;
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-posts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-posts-all", workspaceId] });
  };

  const hasTebar = accounts.some((a) => a.source === "tebar");
  const syncPostsFn = useServerFn(syncTebarPosts);
  const syncPosts = useMutation({
    mutationFn: (_v: { silent?: boolean }) => syncPostsFn({ data: { workspaceId } }),
    onSuccess: (r, v) => {
      invalidate();
      if (!v.silent)
        toast.success(
          id
            ? `Sinkron selesai: ${r.imported} baru, ${r.updated} diperbarui`
            : `Synced: ${r.imported} new, ${r.updated} updated`,
        );
    },
    onError: (e: Error, v) => {
      if (!v.silent) toast.error(e.message);
    },
  });
  // Pull Tebar-made posts and fresh publish statuses once when the page opens.
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (hasTebar && !autoSynced) {
      setAutoSynced(true);
      syncPosts.mutate({ silent: true });
    }
  }, [hasTebar, autoSynced]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (d: Draft, status: string) => {
    if (!d.caption.trim() && !d.media_paths.length && !d.media_url.trim())
      throw new Error(id ? "Isi caption atau pilih media" : "Add a caption or media");
    if (status === "draft") return;
    const singleVideo =
      (d.media_paths.length === 1 &&
        !d.media_url.trim() &&
        !!mediaUrl.get(d.media_paths[0])?.mime_type?.startsWith("video/")) ||
      (!d.media_paths.length && /\.(mp4|mov|webm)(?:[?#]|$)/i.test(d.media_url.trim()));
    validateEnhancements(
      accounts.filter((a) => d.account_ids.includes(a.id)),
      d.first_comment,
      d.cover_path,
      !!singleVideo,
    );
    if (!d.account_ids.length)
      throw new Error(id ? "Pilih minimal satu akun" : "Select at least one account");
    if (!d.when) throw new Error(id ? "Jadwal wajib diisi" : "Schedule is required");
    const hasMedia = d.media_paths.length > 0 || !!d.media_url.trim();
    const needs = accounts.filter(
      (a) => d.account_ids.includes(a.id) && NEEDS_MEDIA.includes(a.platform),
    );
    if (!hasMedia && needs.length)
      throw new Error(
        id
          ? `${[...new Set(needs.map((a) => platformLabel(a.platform)))].join(", ")} wajib memakai gambar/video`
          : `${[...new Set(needs.map((a) => platformLabel(a.platform)))].join(", ")} requires an image/video`,
      );
  };

  const persist = async (d: Draft, status: string, immediate = false) => {
    validate(d, status);
    const payload = {
      title:
        d.title.trim() ||
        d.caption.trim().split("\n")[0].slice(0, 80) ||
        (id ? "Postingan" : "Post"),
      caption: d.caption,
      media_url: d.media_url.trim() || null,
      media_paths: JSON.stringify(d.media_paths),
      first_comment: d.first_comment.trim() || null,
      cover_path: d.cover_path,
      account_ids: JSON.stringify(d.account_ids),
      scheduled_at: sqlDateTime(
        status === "scheduled" && !immediate
          ? new Date(validateScheduleTime(d.when, Date.now()))
          : status === "draft" && d.when && Number.isFinite(Date.parse(d.when))
            ? new Date(d.when)
            : new Date(),
      ),
      status,
      last_error: null,
    };
    const saved = await saveWorkspaceRow({
      data: { table: "crm_scheduled_posts", workspaceId, id: d.id, data: payload },
    });
    return (saved as { id: string }).id;
  };

  const save = useMutation({
    mutationFn: ({ status }: { status: string }) => persist(editing!, status),
    onSuccess: (_, v) => {
      invalidate();
      setEditing(null);
      toast.success(
        v.status === "draft"
          ? id
            ? "Draft disimpan"
            : "Draft saved"
          : id
            ? "Postingan dijadwalkan"
            : "Post scheduled",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const publishNow = useMutation({
    mutationFn: async () => {
      const pid = await persist(
        { ...editing!, when: editing!.when || toLocalInput(new Date()) },
        "scheduled",
        true,
      );
      setEditing((e) => (e ? { ...e, id: pid } : e));
      return publishFn({ data: { postId: pid } });
    },
    onSuccess: (r) => {
      invalidate();
      // Tebar publishes in the background; refresh statuses and links shortly after.
      if (hasTebar) setTimeout(() => syncPosts.mutate({ silent: true }), 10_000);
      if (r.ok) {
        toast.success(
          hasTebar
            ? id
              ? "Terkirim, sedang diterbitkan"
              : "Sent, publishing now"
            : id
              ? "Berhasil diposting"
              : "Published",
        );
        setEditing(null);
      } else
        toast.error(
          r.results
            .map((x) => x.error)
            .filter(Boolean)
            .join("; "),
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (pid: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_scheduled_posts", workspaceId, id: pid } });
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success(id ? "Postingan dihapus" : "Post deleted");
    },
  });

  const shift = (dir: number) => {
    const d = new Date(anchor);
    if (mode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };
  // Tombol + di navigasi bawah membuka composer langsung (?new=1).
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("new") !== "1") return;
    u.searchParams.delete("new");
    window.history.replaceState(null, "", u.pathname + u.search);
    openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = () => openNew();
    window.addEventListener("qalling:new-post", h);
    return () => window.removeEventListener("qalling:new-post", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openNew = (d?: Date) => {
    const base = d
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0)
      : new Date(Date.now() + 3600_000);
    setEditing({
      title: "",
      caption: "",
      media_url: "",
      media_paths: [],
      first_comment: "",
      cover_path: null,
      account_ids: accounts.map((a) => a.id),
      status: "scheduled",
      when: toLocalInput(base),
    });
  };
  const openEdit = (p: Post & { media_paths: string[] }) =>
    setEditing({
      id: p.id,
      title: p.title,
      caption: p.caption ?? "",
      media_url: p.media_url ?? "",
      media_paths: p.media_paths ?? [],
      first_comment: p.first_comment ?? "",
      cover_path: p.cover_path ?? null,
      results: p.results,
      account_ids: p.account_ids ?? [],
      when: toLocalInput(new Date(p.scheduled_at)),
      status: p.status,
      last_error: p.last_error,
      source: p.source,
      permalinks: p.permalinks ?? [],
    });
  const weekdays = id
    ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const title = anchor.toLocaleDateString(id ? "id-ID" : "en-US", {
    month: "long",
    year: "numeric",
  });
  const today = dayKey(new Date());
  const fmt = (d: string) =>
    new Date(d).toLocaleString(id ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const firstThumb = (p: { media_paths?: string[]; media_url: string | null }) => {
    const m = p.media_paths?.length ? mediaUrl.get(p.media_paths[0]) : undefined;
    return m ?? (p.media_url ? { url: p.media_url, mime_type: null } : null);
  };

  if (!accLoading && accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-gold" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-foreground">
          {id ? "Hubungkan akun sosial dulu" : "Connect a social account first"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {id
            ? "Postingan dikirim ke akun Instagram, Facebook, TikTok, dan lainnya yang sudah terhubung."
            : "Posts are sent to your connected Instagram, Facebook, TikTok and other accounts."}
        </p>
        <Button className="mt-5" onClick={() => goSub("social-accounts")}>
          <Plus className="h-4 w-4" /> {id ? "Hubungkan akun" : "Connect account"}
        </Button>
      </div>
    );
  }

  const xSelected =
    !!editing && accounts.some((a) => a.platform === "x" && editing.account_ids.includes(a.id));
  const previewAcc = editing ? accounts.find((a) => editing.account_ids.includes(a.id)) : undefined;
  const previewMedia = editing
    ? firstThumb({ media_paths: editing.media_paths, media_url: editing.media_url || null })
    : null;
  const selectedAccounts = accounts.filter((a) => editing?.account_ids.includes(a.id));
  const commentAccounts = selectedAccounts.filter(supportsFirstComment);
  const coverAccounts = selectedAccounts.filter(supportsVideoCover);
  const commentLimit = commentAccounts.length
    ? Math.min(...commentAccounts.map((a) => COMMENT_LIMITS[a.platform]))
    : 8000;
  const coverMedia = editing?.cover_path ? mediaUrl.get(editing.cover_path) : undefined;
  const platformNames = (list: Account[]) =>
    [...new Set(list.map((a) => platformLabel(a.platform)))].join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Qalling CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">Posts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} {id ? "akun terhubung" : "connected accounts"} ·{" "}
            {counts.scheduled ?? 0} {id ? "terjadwal" : "scheduled"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTebar && (
            <Button
              variant="outline"
              onClick={() => syncPosts.mutate({})}
              disabled={syncPosts.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", syncPosts.isPending && "animate-spin")} />{" "}
              {syncPosts.isPending
                ? id
                  ? "Menyinkronkan..."
                  : "Syncing..."
                : id
                  ? "Sinkronkan"
                  : "Sync"}
            </Button>
          )}
          <Button variant="outline" onClick={() => goSub("social-accounts")}>
            <Plus className="h-4 w-4" /> {id ? "Tambah akun" : "Add account"}
          </Button>
          <Button onClick={() => openNew()}>
            <Send className="h-4 w-4" /> {id ? "Buat postingan" : "Create post"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(["list", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1 rounded px-3 py-1 text-sm",
                mode === m && "bg-navy text-primary-foreground",
              )}
            >
              {m === "list" ? (
                <List className="h-3.5 w-3.5" />
              ) : (
                <CalendarDays className="h-3.5 w-3.5" />
              )}
              {m === "list"
                ? id
                  ? "Daftar"
                  : "List"
                : m === "week"
                  ? id
                    ? "Minggu"
                    : "Week"
                  : id
                    ? "Bulan"
                    : "Month"}
            </button>
          ))}
        </div>
        {mode === "list" ? (
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder={id ? "Cari caption…" : "Search caption…"}
          />
        ) : (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => shift(-1)} aria-label="Prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{title}</span>
            <Button size="icon" variant="outline" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {mode === "list" ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {["all", "draft", "scheduled", "published", "failed"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusTab(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    statusTab === s
                      ? "border-gold bg-gold/15 font-medium"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s === "all" ? (id ? "Semua" : "All") : STATUS_LABEL(s, id)} ({counts[s] ?? 0})
                </button>
              ))}
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p>{id ? "Belum ada postingan." : "No posts yet."}</p>
                <Button className="mt-3" size="sm" onClick={() => openNew()}>
                  <Plus className="h-4 w-4" /> {id ? "Buat postingan" : "Create post"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pager.items.map((p) => {
                  const th = firstThumb(p);
                  const n = (p.media_paths?.length ?? 0) + (p.media_url ? 1 : 0);
                  return (
                    <button
                      key={p.id}
                      onClick={() => openEdit(p)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-secondary/40"
                    >
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                        {th?.url ? (
                          (th.mime_type ?? "").startsWith("video/") ? (
                            <video
                              src={th.url}
                              muted
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <img
                              src={th.url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <ImageIcon className="m-auto mt-4 h-5 w-5 text-muted-foreground" />
                        )}
                        {n > 1 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-navy px-1 text-[10px] text-primary-foreground">
                            +{n - 1}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{p.caption || p.title}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {(p.account_ids ?? []).map(accName).filter(Boolean).join(", ") ||
                            (id ? "Belum pilih akun" : "No accounts")}
                        </p>
                        {p.status === "failed" && p.last_error && (
                          <p className="truncate text-xs text-destructive">{p.last_error}</p>
                        )}
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-xs text-muted-foreground">{fmt(p.scheduled_at)}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-2 py-0.5 text-xs",
                          STATUS_STYLE[p.status] ?? STATUS_STYLE.scheduled,
                        )}
                      >
                        {STATUS_LABEL(p.status, id)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {filtered.length > 0 && <PaginationBar p={pager} />}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {weekdays.map((w) => (
              <div
                key={w}
                className="bg-secondary/60 px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground"
              >
                {w}
              </div>
            ))}
            {days.map((d) => {
              const list = byDay.get(dayKey(d)) ?? [];
              const faded = mode === "month" && d.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={d.toISOString()}
                  onClick={() => openNew(d)}
                  className={cn(
                    "cursor-pointer bg-card p-2 hover:bg-secondary/40",
                    mode === "week" ? "min-h-64" : "min-h-28",
                    faded && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      dayKey(d) === today && "bg-gold font-semibold text-navy",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                        className={cn(
                          "block w-full truncate rounded px-1.5 py-1 text-left text-xs",
                          STATUS_STYLE[p.status] ?? STATUS_STYLE.scheduled,
                        )}
                      >
                        {new Date(p.scheduled_at).toLocaleTimeString(id ? "id-ID" : "en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {p.caption || p.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-sm:left-0 max-sm:top-0 max-sm:flex max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:gap-0 max-sm:overflow-hidden max-sm:rounded-none max-sm:border-0 max-sm:p-0 max-sm:data-[state=open]:slide-in-from-bottom sm:max-w-4xl">
          {editing && (
            <MobileComposer
              id={id}
              editing={editing}
              setEditing={setEditing}
              accounts={accounts}
              mediaUrl={mediaUrl}
              onPickMedia={() => setPicker(true)}
              onNewAccount={() => goSub("social-accounts")}
              showFirstComment={commentAccounts.length > 0 || !!editing.first_comment}
              commentLimit={commentLimit}
              saving={save.isPending}
              publishing={publishNow.isPending}
              onDraft={() => save.mutate({ status: "draft" })}
              onSchedule={() => save.mutate({ status: "scheduled" })}
              onPublishNow={() => publishNow.mutate()}
              onDelete={editing.id ? () => remove.mutate(editing.id!) : undefined}
            />
          )}
          <DialogHeader className="max-sm:hidden">
            <DialogTitle>
              {editing?.id
                ? id
                  ? "Ubah Postingan"
                  : "Edit Post"
                : id
                  ? "Buat Postingan"
                  : "Create Post"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-5 max-sm:hidden md:grid-cols-[1fr_280px]">
              <div className="min-w-0 space-y-4">
                {editing.source === "tebar" && (
                  <p className="rounded border border-gold/40 bg-gold/10 p-2 text-xs">
                    {id
                      ? "Postingan tersinkron ini hanya dapat dilihat. Perubahan dan penjadwalan ulang belum tersedia di sini."
                      : "This synced post is read-only. Editing and rescheduling are not available here yet."}
                  </p>
                )}
                {editing.last_error &&
                  (editing.status === "failed" || editing.status === "published") && (
                    <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                      {editing.last_error}
                    </p>
                  )}
                {!!editing.permalinks?.length && (
                  <div className="flex flex-wrap gap-2">
                    {editing.permalinks.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary"
                      >
                        <ExternalLink className="h-3 w-3" /> {id ? "Lihat postingan" : "View post"}
                      </a>
                    ))}
                  </div>
                )}
                <AdminField label={id ? "Posting ke akun" : "Post to accounts"}>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const on = editing.account_ids.includes(a.id);
                      return (
                        <AccountChip
                          key={a.id}
                          a={a}
                          active={on}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              account_ids: on
                                ? editing.account_ids.filter((x) => x !== a.id)
                                : [...editing.account_ids, a.id],
                            })
                          }
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => goSub("social-accounts")}
                      className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                    >
                      <Plus className="h-3 w-3" /> {id ? "Akun baru" : "New account"}
                    </button>
                  </div>
                </AdminField>
                <AdminField label="Caption">
                  <Textarea
                    rows={7}
                    value={editing.caption}
                    onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                    placeholder={
                      id
                        ? "Tulis caption, hashtag, dan ajakan…"
                        : "Write your caption, hashtags and call to action…"
                    }
                  />
                  <p
                    className={cn(
                      "mt-1 text-right text-[11px] text-muted-foreground",
                      xSelected && editing.caption.length > 280 && "text-destructive",
                    )}
                  >
                    {editing.caption.length}
                    {xSelected ? " / 280 (X)" : ""}
                  </p>
                </AdminField>
                <AdminField label={id ? "Media" : "Media"}>
                  <div className="flex flex-wrap gap-2">
                    {editing.media_paths.map((path) => {
                      const m = mediaUrl.get(path);
                      return (
                        <div
                          key={path}
                          className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-secondary"
                        >
                          {m && <MediaThumb m={m} className="h-full w-full" />}
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() =>
                              setEditing({
                                ...editing,
                                media_paths: editing.media_paths.filter((x) => x !== path),
                              })
                            }
                            className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setPicker(true)}
                      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-[11px] text-muted-foreground hover:bg-secondary"
                    >
                      <ImageIcon className="h-5 w-5" /> {id ? "Tambah" : "Add"}
                    </button>
                  </div>
                  <Input
                    className="mt-2"
                    value={editing.media_url}
                    onChange={(e) => setEditing({ ...editing, media_url: e.target.value })}
                    placeholder={
                      id
                        ? "atau tempel link gambar/video (opsional)"
                        : "or paste an image/video link (optional)"
                    }
                  />
                </AdminField>
                {(commentAccounts.length > 0 || editing.first_comment) && (
                  <AdminField label={id ? "Komentar pertama otomatis" : "Automatic first comment"}>
                    <Textarea
                      rows={3}
                      value={editing.first_comment}
                      maxLength={commentLimit}
                      onChange={(e) => setEditing({ ...editing, first_comment: e.target.value })}
                      placeholder={
                        id
                          ? "Hashtag, tautan, atau pesan tambahan…"
                          : "Hashtags, links or an extra message…"
                      }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {platformNames(commentAccounts)} · {editing.first_comment.length}/
                      {commentLimit}
                    </p>
                  </AdminField>
                )}
                {(coverAccounts.length > 0 || editing.cover_path) && (
                  <AdminField label={id ? "Cover video / thumbnail" : "Video cover / thumbnail"}>
                    <div className="flex flex-wrap items-center gap-2">
                      {coverMedia && (
                        <MediaThumb m={coverMedia} className="h-20 w-20 rounded-md object-cover" />
                      )}
                      <Button variant="outline" onClick={() => setCoverPicker(true)}>
                        <ImageIcon className="h-4 w-4" />
                        {id ? "Pilih cover" : "Choose cover"}
                      </Button>
                      {editing.cover_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={id ? "Hapus cover" : "Remove cover"}
                          onClick={() => setEditing({ ...editing, cover_path: null })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {platformNames(coverAccounts)} · JPG/PNG ·{" "}
                      {id
                        ? "Video tunggal; TikTok Business, YouTube non-Shorts terverifikasi"
                        : "Single video; TikTok Business, verified non-Shorts YouTube"}
                    </p>
                  </AdminField>
                )}
                {editing.results
                  ?.filter((r) => r.first_comment)
                  .map((r) => (
                    <p key={r.account_id} className="text-xs text-muted-foreground">
                      {accName(r.account_id)} · {id ? "Komentar pertama" : "First comment"}:{" "}
                      {r.first_comment?.status}
                      {r.first_comment?.error_message ? ` — ${r.first_comment.error_message}` : ""}
                    </p>
                  ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label={id ? "Jadwal posting" : "Publish at"}>
                    <Input
                      type="datetime-local"
                      value={editing.when}
                      onChange={(e) => setEditing({ ...editing, when: e.target.value })}
                    />
                    <div
                      className="mt-2 flex flex-wrap gap-1"
                      aria-label={id ? "Jam emas WIB" : "Golden hours WIB"}
                    >
                      {GOLDEN_HOURS.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              when: toLocalInputValue(nextGoldenSlot(new Date(), g.id)),
                            })
                          }
                        >
                          ⭐ {id ? g.label : g.en} {g.start}
                        </button>
                      ))}
                    </div>
                  </AdminField>
                  <AdminField
                    label={id ? "Judul internal (opsional)" : "Internal title (optional)"}
                  >
                    <Input
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    />
                  </AdminField>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-xs font-semibold">
                      {(previewAcc?.account_name ?? "Q").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {previewAcc?.account_name ?? (id ? "Pilih akun" : "Pick an account")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {previewAcc ? platformLabel(previewAcc.platform) : "—"}
                      </p>
                    </div>
                  </div>
                  {previewMedia?.url ? (
                    (previewMedia.mime_type ?? "").startsWith("video/") ? (
                      <video
                        src={previewMedia.url}
                        poster={coverMedia?.url ?? undefined}
                        muted
                        controls
                        className="aspect-square w-full bg-secondary object-cover"
                      />
                    ) : (
                      <img
                        src={previewMedia.url}
                        alt=""
                        className="aspect-square w-full bg-secondary object-cover"
                      />
                    )
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-secondary text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  <p className="line-clamp-6 whitespace-pre-wrap p-3 text-xs">
                    {editing.caption ||
                      (id ? "Caption akan tampil di sini" : "Caption appears here")}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2 max-sm:hidden">
            {editing?.id && (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => remove.mutate(editing.id!)}
              >
                <Trash2 className="h-4 w-4" /> {id ? "Hapus" : "Delete"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(editing?.caption ?? "");
                toast.success(id ? "Caption disalin" : "Caption copied");
              }}
            >
              <Copy className="h-4 w-4" /> {id ? "Salin" : "Copy"}
            </Button>
            {editing &&
              ["draft", "scheduled"].includes(editing.status) &&
              editing.source !== "tebar" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => save.mutate({ status: "draft" })}
                    disabled={save.isPending}
                  >
                    {id ? "Simpan draft" : "Save draft"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => publishNow.mutate()}
                    disabled={publishNow.isPending}
                  >
                    {publishNow.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}{" "}
                    {id ? "Posting sekarang" : "Post now"}
                  </Button>
                  <Button
                    onClick={() => save.mutate({ status: "scheduled" })}
                    disabled={save.isPending}
                  >
                    <CalendarDays className="h-4 w-4" /> {id ? "Jadwalkan" : "Schedule"}
                  </Button>
                </>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <MediaPickerDialog
          workspaceId={workspaceId}
          open={coverPicker}
          onOpenChange={setCoverPicker}
          selected={editing.cover_path ? [editing.cover_path] : []}
          imagesOnly
          maxSelection={1}
          onConfirm={(paths) => setEditing((e) => (e ? { ...e, cover_path: paths[0] ?? null } : e))}
        />
      )}
      {editing && (
        <MediaPickerDialog
          workspaceId={workspaceId}
          open={picker}
          onOpenChange={setPicker}
          selected={editing.media_paths}
          onConfirm={(paths) => setEditing((e) => (e ? { ...e, media_paths: paths } : e))}
        />
      )}
    </div>
  );
}

export function SocialDashboardView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const { data: accounts = [] } = useAccounts(workspaceId);
  const connected = accounts.filter((a) => a.source === "meta" || a.source === "tebar").length;
  const { data: posts = [] } = useQuery({
    queryKey: ["crm-posts-all", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId,
          orderBy: "scheduled_at",
          orderDir: "desc",
          limit: 1000,
        },
      });
      return rowsOf(res).map(normPost) as Post[];
    },
  });
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const count = (st: string) => posts.filter((p) => p.status === st).length;
  const thisMonth = posts.filter((p) => new Date(p.scheduled_at).getTime() >= monthStart).length;
  const upcoming = posts
    .filter((p) => p.status === "scheduled" && new Date(p.scheduled_at).getTime() >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 6);
  const failed = posts.filter((p) => p.status === "failed").slice(0, 5);
  const done = count("published") + count("failed");
  const rate = done ? Math.round((count("published") / done) * 100) : 0;
  const perAccount = accounts.map((a) => ({
    a,
    n: posts.filter((p) => p.account_ids.includes(a.id)).length,
  }));
  const maxN = Math.max(1, ...perAccount.map((x) => x.n));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const s = startOfWeek(new Date(now - (7 - i) * 7 * 86_400_000));
    const e = s.getTime() + 7 * 86_400_000;
    return {
      label: s.toLocaleDateString(id ? "id-ID" : "en-US", { day: "numeric", month: "short" }),
      n: posts.filter((p) => {
        const t = new Date(p.scheduled_at).getTime();
        return t >= s.getTime() && t < e;
      }).length,
    };
  });
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const fmt = (d: string) =>
    new Date(d).toLocaleString(id ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  const stats = [
    { label: id ? "Total postingan" : "Total posts", v: posts.length },
    { label: id ? "Terjadwal" : "Scheduled", v: count("scheduled") },
    { label: id ? "Sudah diposting" : "Published", v: count("published") },
    { label: id ? "Gagal" : "Failed", v: count("failed") },
    { label: id ? "Bulan ini" : "This month", v: thisMonth },
    { label: id ? "Tingkat sukses" : "Success rate", v: `${rate}%` },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Qalling CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {id ? "Dasbor Media Sosial" : "Social Dashboard"}
          </h1>
        </div>
        <Badge
          variant={connected ? "default" : "secondary"}
          className="shrink-0 gap-1 rounded-full"
        >
          {connected > 0 && <CheckCircle2 className="h-3 w-3" />}
          {connected}{" "}
          <span className="max-sm:hidden">{id ? "akun terhubung" : "accounts connected"}</span>
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-2xl">
            <CardContent className="p-3.5 sm:p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <p className="mb-4 font-semibold">
              {id ? "Postingan per minggu (8 minggu)" : "Posts per week (8 weeks)"}
            </p>
            <div className="flex h-32 items-end gap-1 sm:h-40 sm:gap-2">
              {weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs">{w.n}</span>
                  <div
                    className="w-full rounded-t bg-gold"
                    style={{ height: `${(w.n / maxW) * 100}%`, minHeight: 2 }}
                  />
                  <span className="max-w-full truncate text-[9px] text-muted-foreground sm:text-[10px]">
                    {w.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <p className="font-semibold">
              {id ? "Postingan per akun" : "Posts per account"} ({accounts.length}{" "}
              {id ? "akun" : "accounts"})
            </p>
            {perAccount.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {id ? "Belum ada akun." : "No accounts yet."}
              </p>
            )}
            {perAccount.map(({ a, n }) => (
              <div key={a.id}>
                <div className="flex justify-between text-sm">
                  <span>
                    {platformLabel(a.platform)} · {a.account_name}
                  </span>
                  <span>{n}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-secondary">
                  <div
                    className="h-2 rounded bg-navy dark:bg-gold"
                    style={{ width: `${(n / maxN) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="font-semibold">{id ? "Jadwal berikutnya" : "Upcoming"}</p>
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {id ? "Tidak ada jadwal." : "Nothing scheduled."}
              </p>
            )}
            {upcoming.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between gap-0.5 text-sm sm:flex-row sm:gap-3"
              >
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-muted-foreground">{fmt(p.scheduled_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="font-semibold">{id ? "Gagal terbaru" : "Recent failures"}</p>
            {failed.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {id ? "Tidak ada kegagalan." : "No failures."}
              </p>
            )}
            {failed.map((p) => (
              <div key={p.id} className="text-sm">
                <p className="truncate font-medium">{p.title}</p>
                <p className="truncate text-xs text-destructive">{p.last_error}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
