/**
 * #54–#56 (BS New 3): akun media sosial multi-akun, penjadwal postingan, dan
 * dasbor media sosial, plus kartu koneksi Meta App (#55).
 *
 * Catatan porting ke Old:
 * - Lapisan data memakai server fn Old (`listWorkspaceRows`, `saveWorkspaceRow`,
 *   `deleteWorkspaceRow`) bukan Supabase; App Secret & access token tetap hanya
 *   di server (`lib/meta-social.functions.ts`).
 * - Kolom `account_ids` bertipe JSON → disimpan sebagai string JSON.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Lock,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { sqlDateTime, sqlDateTimeOrNull } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { CRM_SOCIAL_PLATFORMS } from "@/lib/crm";
import { cn } from "@/lib/utils";
import {
  disconnectMeta,
  getMetaSettings,
  publishPostNow,
  saveMetaApp,
  startMetaConnect,
  type MetaSettingsView,
} from "@/lib/meta-social.functions";

interface Account {
  id: string;
  platform: string;
  account_name: string;
  handle: string | null;
  profile_url: string | null;
  status: string;
  source: string;
}
interface Post {
  id: string;
  title: string;
  caption: string | null;
  media_url: string | null;
  account_ids: string[];
  scheduled_at: string;
  status: string;
  last_error?: string | null;
}

const platformLabel = (id: string) => CRM_SOCIAL_PLATFORMS.find((p) => p.id === id)?.label ?? id;

/** `account_ids` bisa datang sebagai array (JSON column) atau string. */
function parseAccountIds(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function useAccounts(workspaceId: string) {
  return useQuery({
    queryKey: ["crm-social-accounts", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "crm_social_accounts", workspaceId, orderBy: "platform", orderDir: "asc", limit: 500 },
      });
      return (data?.rows ?? []) as unknown as Account[];
    },
  });
}

function useMetaSettings(workspaceId: string) {
  const fn = useServerFn(getMetaSettings);
  return useQuery({
    queryKey: ["crm-meta", workspaceId],
    queryFn: async () => (await fn({ data: { workspaceId } })) as MetaSettingsView | null,
  });
}

function MetaConnectCard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const t = (en: string, i: string) => (id ? i : en);
  const qc = useQueryClient();
  const { data: meta } = useMetaSettings(workspaceId);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const saveFn = useServerFn(saveMetaApp);
  const connectFn = useServerFn(startMetaConnect);
  const discFn = useServerFn(disconnectMeta);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["crm-meta", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] });
  };

  const verify = useMutation({
    mutationFn: () => saveFn({ data: { workspaceId, appId: appId.trim(), appSecret: secret.trim() } }),
    onSuccess: (r) => {
      refresh();
      setSecret("");
      if (r.status === "verified") toast.success(t(`Verified: ${r.appName}`, `Terverifikasi: ${r.appName}`));
      else toast.error(r.lastError ?? t("Invalid app credentials", "App ID/Secret tidak valid"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connect = useMutation({
    mutationFn: () => connectFn({ data: { workspaceId, origin: window.location.origin } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disc = useMutation({ mutationFn: () => discFn({ data: { workspaceId } }), onSuccess: refresh });

  const status = meta?.status ?? "none";
  const badge =
    status === "connected"
      ? t("Connected", "Terhubung")
      : status === "verified"
        ? t("App verified", "App terverifikasi")
        : status === "invalid"
          ? t("Invalid", "Tidak valid")
          : t("Not set", "Belum diatur");

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Meta (Facebook Page & Instagram)</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Enter App ID & App Secret from developers.facebook.com",
                "Masukkan App ID & App Secret dari developers.facebook.com",
              )}
            </p>
          </div>
          <Badge variant={status === "connected" ? "default" : "secondary"} className="gap-1">
            {status === "connected" && <CheckCircle2 className="h-3 w-3" />} {badge}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <AdminField label="App ID">
            <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder={meta?.app_id ?? "1234567890"} />
          </AdminField>
          <AdminField label="App Secret">
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={meta ? "••••••••" : ""}
            />
          </AdminField>
          <Button onClick={() => verify.mutate()} disabled={verify.isPending || !appId || !secret}>
            {verify.isPending ? t("Verifying…", "Memverifikasi…") : t("Save & Verify", "Simpan & Verifikasi")}
          </Button>
        </div>

        {meta?.app_name && <p className="text-xs text-muted-foreground">App: {meta.app_name}</p>}
        {meta?.last_error && <p className="text-xs text-destructive">{meta.last_error}</p>}

        {(status === "verified" || status === "connected") && (
          <div className="space-y-2 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p>
              {t(
                "Add this URL under Facebook Login → Valid OAuth Redirect URIs:",
                "Tambahkan URL ini di Facebook Login → Valid OAuth Redirect URIs:",
              )}
            </p>
            <code className="block break-all text-foreground">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/public/meta/callback
            </code>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {status === "connected"
                  ? t("Reconnect / add Pages", "Hubungkan ulang / tambah Page")
                  : t("Connect with Facebook", "Hubungkan dengan Facebook")}
              </Button>
              {status === "connected" && (
                <Button size="sm" variant="outline" onClick={() => disc.mutate()}>
                  {t("Disconnect", "Putuskan")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SocialAccountsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const t = (en: string, i: string) => (id ? i : en);
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts(workspaceId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ platform: "instagram", account_name: "", handle: "", profile_url: "" });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.account_name.trim()) throw new Error(t("Account name is required", "Nama akun wajib diisi"));
      await upsertWorkspaceRows({
        data: {
          table: "crm_social_accounts",
          workspaceId,
          rows: [
            {
              id: crypto.randomUUID(),
              platform: form.platform,
              account_name: form.account_name.trim(),
              handle: form.handle.trim() || null,
              profile_url: form.profile_url.trim() || null,
              status: "connected",
              source: "manual",
            },
          ],
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] });
      setOpen(false);
      setForm({ platform: "instagram", account_name: "", handle: "", profile_url: "" });
      toast.success(t("Account added", "Akun ditambahkan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (accId: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_social_accounts", workspaceId, id: accId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-social-accounts", workspaceId] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">QALLING CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {t("Social Accounts", "Akun Media Sosial")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("Connect multiple accounts per platform.", "Hubungkan lebih dari satu akun per platform.")}
          </p>
        </div>
        <Button variant="navy" onClick={() => setOpen(true)}>
          <Plus /> {t("Add Account", "Tambah Akun")}
        </Button>
      </div>

      <MetaConnectCard workspaceId={workspaceId} />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("No accounts connected yet.", "Belum ada akun terhubung.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Badge variant="secondary">{platformLabel(a.platform)}</Badge>
                    {a.source === "meta" ? (
                      <Badge className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("Connected", "Terhubung")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(a.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="font-semibold text-navy dark:text-primary-foreground">{a.account_name}</p>
                {a.handle && <p className="text-sm text-muted-foreground">@{a.handle.replace(/^@/, "")}</p>}
                {a.profile_url && (
                  <a
                    href={a.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gold underline"
                  >
                    {t("Open profile", "Buka profil")} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Add Account", "Tambah Akun")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <AdminField label="Platform">
              <AdminSelect value={form.platform} onChange={(v) => setForm({ ...form, platform: v })}>
                {CRM_SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Account name", "Nama akun")}>
              <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
            </AdminField>
            <AdminField label="Username">
              <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@brand" />
            </AdminField>
            <AdminField label={t("Profile URL", "Link profil")}>
              <Input
                value={form.profile_url}
                onChange={(e) => setForm({ ...form, profile_url: e.target.value })}
                placeholder="https://"
              />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
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

export function PostSchedulerView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const t = (en: string, i: string) => (id ? i : en);
  const qc = useQueryClient();
  const { data: allAccounts = [] } = useAccounts(workspaceId);
  const accounts = allAccounts.filter((a) => a.source === "meta");
  const { data: meta, isLoading: metaLoading } = useMetaSettings(workspaceId);
  const publishFn = useServerFn(publishPostNow);
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<(Partial<Post> & { when?: string }) | null>(null);

  const days = useMemo(() => {
    if (mode === "week") {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
    }
    const s = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  }, [mode, anchor]);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1].getTime() + 86_400_000);

  const { data: posts = [] } = useQuery({
    queryKey: ["crm-posts", workspaceId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId,
          ranges: { scheduled_at: { gte: sqlDateTime(rangeStart), lt: sqlDateTime(rangeEnd) } },
          orderBy: "scheduled_at",
          orderDir: "asc",
          limit: 500,
        },
      });
      return (data?.rows ?? []).map((row) => ({
        ...row,
        account_ids: parseAccountIds(row.account_ids),
      })) as unknown as Post[];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    posts.forEach((p) => {
      const key = dayKey(new Date(p.scheduled_at));
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return map;
  }, [posts]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-posts", workspaceId] });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing?.title?.trim()) throw new Error(t("Title is required", "Judul wajib diisi"));
      if (!editing.when) throw new Error(t("Schedule is required", "Jadwal wajib diisi"));
      const payload = {
        title: editing.title.trim(),
        caption: editing.caption ?? "",
        media_url: editing.media_url || null,
        account_ids: JSON.stringify(editing.account_ids ?? []),
        scheduled_at: sqlDateTimeOrNull(editing.when),
        status: editing.status ?? "scheduled",
      };
      if (editing.id) {
        await saveWorkspaceRow({ data: { table: "crm_scheduled_posts", workspaceId, id: editing.id, data: payload } });
      } else {
        await upsertWorkspaceRows({
          data: { table: "crm_scheduled_posts", workspaceId, rows: [{ id: crypto.randomUUID(), ...payload }] },
        });
      }
    },
    onSuccess: () => {
      void invalidate();
      toast.success(t("Post saved", "Postingan tersimpan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (pid: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_scheduled_posts", workspaceId, id: pid } });
    },
    onSuccess: () => {
      void invalidate();
      setEditing(null);
    },
  });

  const publishNow = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      if (!editing?.id) throw new Error(t("Save the post first", "Simpan postingan terlebih dahulu"));
      return publishFn({ data: { workspaceId, postId: editing.id } });
    },
    onSuccess: (r) => {
      void invalidate();
      if (r.ok) toast.success(t("Published", "Berhasil diposting"));
      else toast.error(r.results.map((x) => x.error).filter(Boolean).join("; "));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shift = (dir: number) => {
    const d = new Date(anchor);
    if (mode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };
  const openNew = (d: Date) => {
    const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
    setEditing({ title: "", caption: "", account_ids: accounts.map((a) => a.id), status: "scheduled", when: toLocalInput(when) });
  };
  const weekdays = id
    ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const title = anchor.toLocaleDateString(id ? "id-ID" : "en-US", { month: "long", year: "numeric" });
  const today = dayKey(new Date());

  if (!metaLoading && meta?.status !== "connected") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-gold" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-primary-foreground">
          {t("Post Scheduler is locked", "Jadwal Postingan belum aktif")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Connect a Facebook Page/Instagram under Social Accounts first.",
            "Hubungkan Facebook Page/Instagram di menu Akun Media Sosial terlebih dahulu.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">QALLING CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {t("Post Scheduler", "Jadwal Postingan")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {posts.length} {t("posts in this period", "postingan di periode ini")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded px-3 py-1 text-sm", mode === m && "bg-navy text-primary-foreground")}
              >
                {m === "week" ? t("Week", "Minggu") : t("Month", "Bulan")}
              </button>
            ))}
          </div>
          <Button size="icon" variant="outline" onClick={() => shift(-1)} aria-label="Prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">{title}</span>
          <Button size="icon" variant="outline" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="navy" onClick={() => openNew(new Date())}>
            <Plus /> {t("Post", "Postingan")}
          </Button>
        </div>
      </div>

      {accounts.length === 0 && (
        <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          {t("Add accounts under Social Accounts first.", "Tambahkan akun di menu Akun Media Sosial terlebih dahulu.")}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {weekdays.map((w) => (
            <div key={w} className="bg-secondary/60 px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">
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
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing({ ...p, when: toLocalInput(new Date(p.scheduled_at)) });
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
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("Edit Post", "Ubah Postingan") : t("New Post", "Postingan Baru")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.status === "failed" && editing.last_error && (
                <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">{editing.last_error}</p>
              )}
              <AdminField label={t("Title", "Judul")}>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </AdminField>
              <AdminField label="Caption">
                <Textarea rows={5} value={editing.caption ?? ""} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} />
              </AdminField>
              <AdminField label={t("Media URL", "Link gambar/video")}>
                <Input
                  value={editing.media_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, media_url: e.target.value })}
                  placeholder="https://"
                />
              </AdminField>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label={t("Schedule", "Jadwal")}>
                  <Input
                    type="datetime-local"
                    value={editing.when ?? ""}
                    onChange={(e) => setEditing({ ...editing, when: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Status">
                  <AdminSelect value={editing.status ?? "scheduled"} onChange={(v) => setEditing({ ...editing, status: v })}>
                    <option value="draft">Draft</option>
                    <option value="scheduled">{t("Scheduled", "Terjadwal")}</option>
                    <option value="published">{t("Published", "Sudah diposting")}</option>
                    <option value="failed">{t("Failed", "Gagal")}</option>
                  </AdminSelect>
                </AdminField>
              </div>
              <AdminField label={t("Post to accounts", "Posting ke akun")}>
                <div className="space-y-2">
                  {accounts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("No Meta account connected yet.", "Belum ada akun Meta yang terhubung.")}
                    </p>
                  )}
                  {accounts.map((a) => {
                    const checked = (editing.account_ids ?? []).includes(a.id);
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setEditing({
                              ...editing,
                              account_ids: v
                                ? [...(editing.account_ids ?? []), a.id]
                                : (editing.account_ids ?? []).filter((x) => x !== a.id),
                            })
                          }
                        />
                        {platformLabel(a.platform)} · {a.account_name}
                      </label>
                    );
                  })}
                </div>
              </AdminField>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {editing?.id && (
              <Button variant="outline" onClick={() => remove.mutate(editing.id!)}>
                <Trash2 className="h-4 w-4" /> {t("Delete", "Hapus")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(editing?.caption ?? "");
                toast.success(t("Caption copied", "Caption disalin"));
              }}
            >
              <Copy className="h-4 w-4" /> {t("Copy caption", "Salin caption")}
            </Button>
            {editing?.id && editing.status !== "published" && (
              <Button variant="outline" onClick={() => publishNow.mutate()} disabled={publishNow.isPending}>
                <Send className="h-4 w-4" /> {t("Post now", "Posting sekarang")}
              </Button>
            )}
            <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SocialDashboardView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const t = (en: string, i: string) => (id ? i : en);
  const { data: accounts = [] } = useAccounts(workspaceId);
  const { data: meta } = useMetaSettings(workspaceId);
  const { data: posts = [] } = useQuery({
    queryKey: ["crm-posts-all", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "crm_scheduled_posts", workspaceId, orderBy: "scheduled_at", orderDir: "desc", limit: 1000 },
      });
      return (data?.rows ?? []).map((row) => ({
        ...row,
        account_ids: parseAccountIds(row.account_ids),
      })) as unknown as Post[];
    },
  });

  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const count = (status: string) => posts.filter((p) => p.status === status).length;
  const thisMonth = posts.filter((p) => new Date(p.scheduled_at).getTime() >= monthStart).length;
  const upcoming = posts
    .filter((p) => p.status === "scheduled" && new Date(p.scheduled_at).getTime() >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 6);
  const failed = posts.filter((p) => p.status === "failed").slice(0, 5);
  const done = count("published") + count("failed");
  const rate = done ? Math.round((count("published") / done) * 100) : 0;
  const perAccount = accounts.map((a) => ({ a, n: posts.filter((p) => p.account_ids.includes(a.id)).length }));
  const maxN = Math.max(1, ...perAccount.map((x) => x.n));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const s = startOfWeek(new Date(now - (7 - i) * 7 * 86_400_000));
    const e = s.getTime() + 7 * 86_400_000;
    return {
      label: s.toLocaleDateString(id ? "id-ID" : "en-US", { day: "numeric", month: "short" }),
      n: posts.filter((p) => {
        const ts = new Date(p.scheduled_at).getTime();
        return ts >= s.getTime() && ts < e;
      }).length,
    };
  });
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const fmt = (d: string) =>
    new Date(d).toLocaleString(id ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  const stats = [
    { label: t("Total posts", "Total postingan"), v: posts.length },
    { label: t("Scheduled", "Terjadwal"), v: count("scheduled") },
    { label: t("Published", "Sudah diposting"), v: count("published") },
    { label: t("Failed", "Gagal"), v: count("failed") },
    { label: t("This month", "Bulan ini"), v: thisMonth },
    { label: t("Success rate", "Tingkat sukses"), v: `${rate}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">QALLING CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {t("Social Dashboard", "Dasbor Media Sosial")}
          </h1>
        </div>
        <Badge variant={meta?.status === "connected" ? "default" : "secondary"} className="gap-1">
          {meta?.status === "connected" && <CheckCircle2 className="h-3 w-3" />}
          Meta: {meta?.status === "connected" ? t("Connected", "Terhubung") : t("Not connected", "Belum terhubung")}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-navy dark:text-primary-foreground">{s.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 font-semibold text-navy dark:text-primary-foreground">
              {t("Posts per week (8 weeks)", "Postingan per minggu (8 minggu)")}
            </p>
            <div className="flex h-40 items-end gap-2">
              {weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs">{w.n}</span>
                  <div
                    className="w-full rounded-t bg-gold"
                    style={{ height: `${(w.n / maxW) * 100}%`, minHeight: 2 }}
                  />
                  <span className="text-[10px] text-muted-foreground">{w.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="font-semibold text-navy dark:text-primary-foreground">
              {t("Posts per account", "Postingan per akun")} ({accounts.length})
            </p>
            {perAccount.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No accounts yet.", "Belum ada akun.")}</p>
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
                  <div className="h-2 rounded bg-navy dark:bg-gold" style={{ width: `${(n / maxN) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="font-semibold text-navy dark:text-primary-foreground">{t("Upcoming", "Jadwal berikutnya")}</p>
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("Nothing scheduled.", "Tidak ada jadwal.")}</p>
            )}
            {upcoming.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-muted-foreground">{fmt(p.scheduled_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="font-semibold text-navy dark:text-primary-foreground">{t("Recent failures", "Gagal terbaru")}</p>
            {failed.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No failures.", "Tidak ada kegagalan.")}</p>
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
