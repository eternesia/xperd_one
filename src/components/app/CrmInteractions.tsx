import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Pencil, Trash2, MessageSquare, Zap, ChevronRight } from "lucide-react";
import { SocialIcon } from "@/components/qalling/SocialIcon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuickReplies } from "@/components/app/QuickReplies";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableRow,
  TableHead,
  TableHeader,
  TableCell,
} from "@/components/ui/table";
import { TablePager, TableSearch, usePaged } from "@/components/app/admin-table";
import {
  getAutomationBoard,
  listCrmComments,
  manageAutomation,
  replySocialComment,
  syncTebarSocial,
  likeSocialComments,
} from "@/lib/social-interactions.functions";
import { canLikeOn, validateAutomation } from "@/lib/automation-payload";
import { Heart } from "lucide-react";

export function CrmCommentsView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const send = useServerFn(replySocialComment);
  const syncFn = useServerFn(syncTebarSocial);
  const likeFn = useServerFn(likeSocialComments);
  const listFn = useServerFn(listCrmComments);
  const query = useQuery({
    queryKey: ["crm-comments", workspaceId],
    queryFn: async () => {
      await syncFn({ data: { workspaceId } }).catch(() => null);
      return listFn({ data: { workspaceId } });
    },
  });
  const pages = usePaged(
    query.data ?? [],
    (r) => `${r.post_id} ${r.author_name} ${r.body} ${r.crm_social_accounts?.account_name}`,
  );
  const reply = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Pilih komentar.");
      return send({ data: { workspaceId, commentId: selected, body } });
    },
    onSuccess: (r) => {
      setSelected(null);
      setBody("");
      qc.invalidateQueries({ queryKey: ["crm-comments", workspaceId] });
      if (r.status !== "sent")
        toast.warning(`Status balasan: ${r.status}. Periksa izin akun sebelum mencoba lagi.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const like = useMutation({
    mutationFn: (ids: string[]) => likeFn({ data: { workspaceId, commentIds: ids } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["crm-comments", workspaceId] });
      toast.success(`${r.liked} komentar disukai` + (r.skipped ? `, ${r.skipped} dilewati` : ""));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const groups = new Map<string, typeof pages.rows>();
  for (const r of pages.rows) {
    const key = `${r.account_id}:${r.post_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="min-w-0 space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-2xl font-medium">Komentar</h1>
        <Button
          size="icon"
          variant="outline"
          aria-label="Segarkan komentar"
          onClick={() => query.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <div className="md:rounded-2xl md:border md:bg-card md:p-4 md:shadow-sm">
        <TableSearch
          value={pages.query}
          onChange={pages.setQuery}
          placeholder="Cari postingan atau komentar…"
        />
      </div>
      {query.error && <p className="text-destructive">Komentar tidak dapat dimuat.</p>}
      {query.isLoading ? (
        <p>Memuat komentar…</p>
      ) : pages.total === 0 ? (
        <div className="rounded-2xl border bg-card py-14 text-center text-muted-foreground shadow-sm">
          <MessageSquare className="mx-auto mb-3 size-7" />
          Belum ada komentar masuk dari akun Meta atau Tebar.
        </div>
      ) : (
        [...groups].map(([key, comments]) => (
          <section
            key={key}
            className="rounded-2xl border bg-card p-3 shadow-sm sm:p-5 md:shadow-md"
          >
            {(() => {
              const c0 = comments[0];
              return (
                <div className="flex items-start gap-3">
                  {c0?.post_thumbnail_url ? (
                    <img
                      src={c0.post_thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="size-14 shrink-0 rounded-xl border object-cover sm:size-16"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground sm:size-16">
                      <MessageSquare className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c0?.crm_social_accounts?.account_name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {c0?.crm_social_accounts?.platform}
                      </span>
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {c0?.post_caption || "Postingan tanpa caption"}
                    </p>
                    {c0?.post_permalink && (
                      <a
                        href={c0.post_permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Lihat postingan
                      </a>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 rounded-full">
                    {comments.length}
                    <span className="max-sm:hidden">&nbsp;komentar</span>
                  </Badge>
                </div>
              );
            })()}
            {comments.map((c) => (
              <article key={c.id} className="mt-3 rounded-2xl bg-muted/50 p-3 sm:p-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold">
                    {(c.author_name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{c.author_name}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.crm_social_accounts?.platform} ·{" "}
                      {new Date(c.created_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="h-fit rounded-full">
                    {c.status}
                  </Badge>
                </div>
                {c.reply && (
                  <p className="ml-12 mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm">{c.reply}</p>
                )}
                <div className="mt-3 flex gap-2 pl-12">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={c.status !== "open"}
                    onClick={() => {
                      setSelected(c.id);
                      setBody("");
                    }}
                  >
                    Balas
                  </Button>
                  {canLikeOn(c.crm_social_accounts?.platform) && (
                    <Button
                      size="sm"
                      variant={c.liked_at ? "secondary" : "outline"}
                      disabled={!!c.liked_at || like.isPending}
                      onClick={() => like.mutate([c.id])}
                    >
                      <Heart className="size-4" />
                      {c.liked_at ? "Disukai" : "Like"}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))
      )}
      <TablePager {...pages} />
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Balas komentar</DialogTitle>
          </DialogHeader>
          <QuickReplies workspaceId={workspaceId} onPick={setBody} />
          <Textarea
            aria-label="Balasan komentar"
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={reply.isPending || !body.trim()} onClick={() => reply.mutate()}>
              Kirim balasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
type Form = {
  id?: string;
  accountId: string;
  name: string;
  trigger: "dm" | "comment";
  action: "reply" | "comment_to_dm";
  keyword: string;
  reply: string;
  publicReply: string;
  linkLabel: string;
  linkUrl: string;
  trackClicks: boolean;
  followGate: boolean;
  followAsk: string;
  followButton: string;
  followRetry: string;
  autoLike: boolean;
  enabled: boolean;
};
const EMPTY: Omit<Form, "accountId"> = {
  name: "",
  trigger: "comment",
  action: "comment_to_dm",
  keyword: "link",
  reply: "Makasih sudah follow! Ini linknya, tekan tombol di bawah ya 👇",
  publicReply: "Cek DM ya kak 🙌",
  linkLabel: "Buka link",
  linkUrl: "",
  trackClicks: true,
  followGate: false,
  followAsk: "Follow akun kami dulu ya, lalu tekan tombol di bawah untuk dapat linknya.",
  followButton: "Saya sudah follow",
  followRetry: "Sepertinya kamu belum follow. Follow dulu, lalu tekan tombolnya lagi ya.",
  autoLike: false,
  enabled: true,
};
const KIND_LABEL: Record<string, string> = {
  comment_to_dm: "Komentar → DM",
  comment_reply: "Balas komentar publik",
  dm_keyword: "DM kata kunci",
  default_reply: "Balasan DM default",
  story_reply: "Balasan story",
  story_mention: "Mention di story",
};

export function CrmAutomationsView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [picker, setPicker] = useState(false);
  const manage = useServerFn(manageAutomation);
  const boardFn = useServerFn(getAutomationBoard);
  const syncAll = useServerFn(syncTebarSocial);
  const query = useQuery({
    queryKey: ["crm-automations", workspaceId],
    queryFn: async () => {
      await syncAll({ data: { workspaceId } }).catch(() => null); // tarik otomasi & statistik dari Tebar
      return boardFn({ data: { workspaceId } });
    },
  });
  const [ruleAccount, setRuleAccount] = useState("all");
  const [ruleState, setRuleState] = useState("all");
  const filteredRules = (query.data?.rules ?? []).filter(
    (r) =>
      (ruleAccount === "all" || r.account_id === ruleAccount) &&
      (ruleState === "all" || (ruleState === "on" ? r.enabled : !r.enabled)),
  );
  const pages = usePaged(filteredRules, (r) => `${r.name} ${r.keyword} ${r.reply_body}`, 15);
  const history = usePaged(
    query.data?.runs ?? [],
    (r) => `${r.crm_automation_rules?.name} ${r.status}`,
  );
  const save = useMutation({
    mutationFn: (data: Form & { remove?: boolean }) => manage({ data: { workspaceId, ...data } }),
    onSuccess: () => {
      setForm(null);
      qc.invalidateQueries({ queryKey: ["crm-automations", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fromRow = (r: NonNullable<typeof query.data>["rules"][number]): Form => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    trigger: r.trigger_type as "dm" | "comment",
    action: (r.action_kind as Form["action"]) ?? "reply",
    keyword: r.keyword,
    reply: r.reply_body,
    publicReply: r.public_reply ?? "",
    linkLabel: r.link_label ?? "",
    linkUrl: r.link_url ?? "",
    trackClicks: r.track_clicks,
    followGate: r.follow_gate,
    followAsk: r.follow_ask ?? EMPTY.followAsk,
    followButton: r.follow_button ?? EMPTY.followButton,
    followRetry: r.follow_retry ?? EMPTY.followRetry,
    autoLike: r.auto_like,
    enabled: r.enabled,
  });
  return (
    <div className="min-w-0 space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-2xl font-medium">Automation</h1>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label="Sinkron dari Tebar"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
          </Button>
          <Button disabled={!query.data?.accounts.length} onClick={() => setPicker(true)}>
            <Plus className="size-4" />
            <span className="max-sm:hidden">Buat automation</span>
            <span className="sm:hidden">Buat</span>
          </Button>
        </div>
      </header>
      {query.error && <p className="text-destructive">{query.error.message}</p>}
      {!query.isLoading && !query.data?.accounts.length && (
        <p className="border-y py-8 text-sm text-muted-foreground">
          Hubungkan akun Meta native untuk balasan otomatis DM dan komentar. Akun Tebar tetap
          digunakan untuk publishing.
        </p>
      )}
      <Tabs defaultValue="rules">
        <TabsList className="grid w-full grid-cols-2 rounded-full sm:inline-flex sm:w-auto">
          <TabsTrigger value="rules" className="rounded-full">
            Aturan
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-full">
            Riwayat eksekusi
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap [&>*:first-child]:col-span-2">
            <TableSearch
              value={pages.query}
              onChange={pages.setQuery}
              placeholder="Cari nama, kata kunci, atau isi balasan…"
            />
            <select
              className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm sm:h-9 sm:rounded-md"
              value={ruleAccount}
              onChange={(e) => setRuleAccount(e.target.value)}
              aria-label="Filter akun"
            >
              <option value="all">Semua akun</option>
              {query.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name} ({a.platform})
                </option>
              ))}
            </select>
            <select
              className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm sm:h-9 sm:rounded-md"
              value={ruleState}
              onChange={(e) => setRuleState(e.target.value)}
              aria-label="Filter status"
            >
              <option value="all">Semua status</option>
              <option value="on">Aktif</option>
              <option value="off">Nonaktif</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card">
            <ul className="divide-y">
              {pages.rows.map((r) => {
                const acc = query.data?.accounts.find((a) => a.id === r.account_id);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Switch
                      aria-label={`Aktifkan ${r.name}`}
                      checked={r.enabled}
                      disabled={save.isPending}
                      onCheckedChange={(enabled) => save.mutate({ ...fromRow(r), enabled })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.tebar_kind
                            ? (KIND_LABEL[r.tebar_kind] ?? r.tebar_kind)
                            : r.trigger_type === "dm"
                              ? "DM masuk"
                              : r.action_kind === "comment_to_dm"
                                ? "Komentar → DM"
                                : "Komentar baru"}
                        </Badge>
                        {r.follow_gate && (
                          <Badge variant="secondary" className="text-[10px]">
                            Wajib follow
                          </Badge>
                        )}
                        {r.auto_like && (
                          <Badge variant="secondary" className="text-[10px]">
                            Auto-like
                          </Badge>
                        )}
                        {r.synced_at && (
                          <Badge variant="secondary" className="text-[10px]">
                            Tebar
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {acc ? `${acc.account_name} · ` : ""}
                        {r.keyword ? `Kata kunci: ${r.keyword}` : "Semua pesan"} ·{" "}
                        {r.reply_body || "—"}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>
                        <span className="font-semibold text-foreground">{r.run_count}</span>{" "}
                        berjalan
                        {r.link_url ? ` · ${r.click_count} klik` : ""}
                      </p>
                      <p>
                        {r.last_run_at
                          ? `Terakhir ${new Date(r.last_run_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}`
                          : "Belum pernah berjalan"}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Ubah ${r.name}`}
                        onClick={() => setForm(fromRow(r))}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Hapus ${r.name}`}
                        disabled={save.isPending}
                        onClick={() => {
                          if (window.confirm("Hapus aturan ini?"))
                            save.mutate({ ...fromRow(r), remove: true });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {!pages.total && (
            <div className="py-10 text-center text-muted-foreground">
              <Zap className="mx-auto mb-3 size-7" />
              Belum ada aturan otomatisasi.
            </div>
          )}
          <TablePager {...pages} />
        </TabsContent>
        <TabsContent value="history">
          <TableSearch value={history.query} onChange={history.setQuery} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aturan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.crm_automation_rules?.name}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleString("id-ID")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...history} />
        </TabsContent>
      </Tabs>
      <TemplatePicker
        open={picker}
        onOpenChange={setPicker}
        accounts={query.data?.accounts ?? []}
        onPick={(f) => {
          setPicker(false);
          setForm(f);
        }}
      />
      <AutomationDialog
        form={form}
        setForm={setForm}
        accounts={query.data?.accounts ?? []}
        pending={save.isPending}
        onSave={(f) => save.mutate(f)}
      />
    </div>
  );
}
function AutomationDialog({
  form,
  setForm,
  accounts,
  pending,
  onSave,
}: {
  form: Form | null;
  setForm: (f: Form | null) => void;
  accounts: { id: string; account_name: string; platform: string }[];
  pending: boolean;
  onSave: (f: Form) => void;
}) {
  const f = form;
  const set = (p: Partial<Form>) => f && setForm({ ...f, ...p });
  const sendsDm = !!f && (f.trigger === "dm" || f.action === "comment_to_dm");
  const platform = accounts.find((a) => a.id === f?.accountId)?.platform;
  const commentOnly = !!platform && platform !== "instagram";
  const replyMax = replyLimitFor(platform);
  const err = f
    ? commentOnly && (f.trigger === "dm" || f.action === "comment_to_dm")
      ? "Platform ini hanya mendukung balasan komentar."
      : f.reply.length > replyMax
        ? `Balasan maksimal ${replyMax} karakter untuk platform ini.`
        : validateAutomation(f)
    : null;
  return (
    <Dialog
      open={!!f}
      onOpenChange={(v) => {
        if (!v) setForm(null);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{f?.id ? "Ubah aturan" : "Aturan baru"}</DialogTitle>
        </DialogHeader>
        {f && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-3">
              <label className="block text-sm">
                Nama aturan
                <Input
                  value={f.name}
                  maxLength={100}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Akun
                  <select
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={f.accountId}
                    onChange={(e) => {
                      const p = accounts.find((a) => a.id === e.target.value)?.platform;
                      set(
                        p && p !== "instagram"
                          ? {
                              accountId: e.target.value,
                              trigger: "comment",
                              action: "reply",
                              followGate: false,
                            }
                          : { accountId: e.target.value },
                      );
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_name} · {a.platform}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Pemicu
                  <select
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={f.trigger === "dm" ? "dm" : f.action}
                    onChange={(e) => {
                      const v = e.target.value;
                      set(
                        v === "dm"
                          ? { trigger: "dm", action: "reply" }
                          : {
                              trigger: "comment",
                              action: v as Form["action"],
                              followGate: v === "reply" ? false : f.followGate,
                            },
                      );
                    }}
                  >
                    {!commentOnly && <option value="comment_to_dm">Komentar → kirim DM</option>}
                    <option value="reply">Komentar → balas komentar</option>
                    {!commentOnly && <option value="dm">DM masuk → balas DM</option>}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                Kata kunci (pisahkan koma, kosong = semua)
                <Input
                  value={f.keyword}
                  maxLength={100}
                  onChange={(e) => set({ keyword: e.target.value })}
                />
              </label>
              {f.action === "comment_to_dm" && f.trigger === "comment" && (
                <label className="block text-sm">
                  Balasan publik di komentar
                  <Input
                    value={f.publicReply}
                    maxLength={2200}
                    onChange={(e) => set({ publicReply: e.target.value })}
                  />
                </label>
              )}
              <label className="block text-sm">
                {sendsDm ? "Isi DM" : "Balasan komentar"}
                <Textarea
                  value={f.reply}
                  maxLength={f.linkUrl ? 640 : replyMax}
                  onChange={(e) => set({ reply: e.target.value })}
                />
              </label>
              {sendsDm && (
                <section className="space-y-3 rounded-md border p-4">
                  <p className="text-sm font-medium">Tombol link</p>
                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <Input
                      aria-label="Judul tombol"
                      placeholder="Buka link"
                      maxLength={20}
                      value={f.linkLabel}
                      onChange={(e) => set({ linkLabel: e.target.value })}
                    />
                    <Input
                      aria-label="Link tujuan"
                      placeholder="https://websiteanda.com"
                      value={f.linkUrl}
                      onChange={(e) => set({ linkUrl: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
                    <button
                      type="button"
                      className={`rounded px-2 py-1.5 ${f.trackClicks ? "bg-background shadow-sm" : ""}`}
                      onClick={() => set({ trackClicks: true })}
                    >
                      Lewat link pelacak
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1.5 ${!f.trackClicks ? "bg-background shadow-sm" : ""}`}
                      onClick={() => set({ trackClicks: false })}
                    >
                      Link sendiri
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.trackClicks
                      ? "Tombol lewat link pelacak lalu diteruskan ke website Anda, sehingga jumlah klik terhitung."
                      : "Tombol langsung membuka website Anda; klik tidak dihitung (pakai UTM bila perlu)."}
                  </p>
                </section>
              )}
              {sendsDm && (
                <section className="space-y-3 rounded-md border p-4">
                  <label className="flex items-start justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">Wajib follow dulu</span>
                      <span className="block text-xs text-muted-foreground">
                        Orang diminta follow dulu; status follow dicek ke Instagram sebelum DM
                        dikirim.
                      </span>
                    </span>
                    <Switch
                      checked={f.followGate}
                      onCheckedChange={(v) => set({ followGate: v })}
                    />
                  </label>
                  {f.followGate && (
                    <>
                      <label className="block text-sm">
                        Ajakan follow
                        <Textarea
                          value={f.followAsk}
                          maxLength={640}
                          onChange={(e) => set({ followAsk: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm">
                        Judul tombol
                        <Input
                          value={f.followButton}
                          maxLength={20}
                          onChange={(e) => set({ followButton: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm">
                        Bila belum follow
                        <Textarea
                          value={f.followRetry}
                          maxLength={640}
                          onChange={(e) => set({ followRetry: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                </section>
              )}
              {f.trigger === "comment" && (
                <label className="flex items-start justify-between gap-3 rounded-md border p-4 text-sm">
                  <span>
                    <span className="font-medium">Like komentar otomatis</span>
                    <span className="block text-xs text-muted-foreground">
                      Beri like ke komentar yang masuk. Hanya Facebook Page dan TikTok
                      {platform && !canLikeOn(platform) ? " — akun ini tidak mendukung" : ""}.
                    </span>
                  </span>
                  <Switch checked={f.autoLike} onCheckedChange={(v) => set({ autoLike: v })} />
                </label>
              )}
              <label className="flex items-center justify-between text-sm">
                Aktif
                <Switch checked={f.enabled} onCheckedChange={(v) => set({ enabled: v })} />
              </label>
              {err && <p className="text-sm text-destructive">{err}</p>}
            </div>
            <AutomationPreview f={f} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setForm(null)}>
            Batal
          </Button>
          <Button
            disabled={pending || !f?.name.trim() || !f.reply.trim() || !f.accountId || !!err}
            onClick={() => f && onSave(f)}
          >
            Simpan dan aktifkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs ${me ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
    >
      {children}
    </div>
  );
}
function AutomationPreview({ f }: { f: Form }) {
  const dm = f.trigger === "dm" || f.action === "comment_to_dm";
  return (
    <aside className="space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
      <p className="text-muted-foreground">Pratinjau</p>
      {f.trigger === "comment" && (
        <div className="rounded-md border bg-background p-3">
          <p>
            <b>pelanggan</b> {f.keyword.split(",")[0] || "halo"}
          </p>
          {(f.action === "reply" ? f.reply : f.publicReply) && (
            <p className="mt-2 border-l-2 pl-2 text-muted-foreground">
              {f.action === "reply" ? f.reply : f.publicReply}
            </p>
          )}
        </div>
      )}
      {dm && (
        <div className="space-y-2 rounded-md border bg-background p-3">
          {f.trigger === "dm" && <Bubble me>{f.keyword.split(",")[0] || "Halo kak"}</Bubble>}
          {f.followGate && (
            <>
              <Bubble>
                {f.followAsk}
                <span className="mt-2 block text-center font-medium">{f.followButton}</span>
              </Bubble>
              <Bubble me>{f.followButton}</Bubble>
              <p className="text-center text-muted-foreground">Bila sudah follow:</p>
            </>
          )}
          <Bubble>
            {f.reply || "…"}
            {f.linkUrl && (
              <span className="mt-2 block text-center font-medium">
                {f.linkLabel || "Buka link"}
              </span>
            )}
          </Bubble>
        </div>
      )}
    </aside>
  );
}

type Tpl = { title: string; hint: string; sample: string; patch: Partial<Form> };
const IG_COMMENT: Tpl[] = [
  {
    title: "Kirim link ke yang komentar",
    hint: 'Komentar "link"',
    sample: "Halo kak! Ini link yang kamu minta, tinggal tekan tombol di bawah ya 👇",
    patch: {
      name: "Kirim link",
      trigger: "comment",
      action: "comment_to_dm",
      keyword: "link",
      reply: "Halo kak! Ini link yang kamu minta, tinggal tekan tombol di bawah ya 👇",
      followGate: false,
    },
  },
  {
    title: "Jawab pertanyaan harga",
    hint: 'Komentar "harga", "berapa"',
    sample: "Halo kak, terima kasih sudah tanya! Harganya…",
    patch: {
      name: "Jawab harga",
      trigger: "comment",
      action: "comment_to_dm",
      keyword: "harga,berapa,price",
      reply: "Halo kak, terima kasih sudah tanya! Harganya ",
      followGate: false,
    },
  },
  {
    title: "Kirim link hanya ke follower",
    hint: 'Komentar "link", setelah follow',
    sample: "Makasih sudah follow! Ini linknya, tekan tombol di bawah ya 👇",
    patch: {
      name: "Link khusus follower",
      trigger: "comment",
      action: "comment_to_dm",
      keyword: "link",
      reply: "Makasih sudah follow! Ini linknya, tekan tombol di bawah ya 👇",
      followGate: true,
    },
  },
  {
    title: "Balas semua komentar",
    hint: "Komentar apa saja",
    sample: "Makasih sudah komentar! 🙏",
    patch: {
      name: "Balas semua komentar",
      trigger: "comment",
      action: "reply",
      keyword: "",
      reply: "Makasih sudah komentar! 🙏",
      followGate: false,
    },
  },
];
const IG_DM: Tpl[] = [
  {
    title: "Balas otomatis DM dengan kata kunci",
    hint: 'DM "harga", "price"',
    sample: "Halo kak, terima kasih sudah tanya! Harganya…",
    patch: {
      name: "DM kata kunci harga",
      trigger: "dm",
      action: "reply",
      keyword: "harga,price",
      reply: "Halo kak, terima kasih sudah tanya! Harganya ",
      followGate: false,
    },
  },
  {
    title: "Sambut DM pertama",
    hint: "DM apa saja",
    sample: "Halo kak, terima kasih sudah menghubungi kami! Kami akan membalas secepatnya ya.",
    patch: {
      name: "Sambutan DM",
      trigger: "dm",
      action: "reply",
      keyword: "",
      reply: "Halo kak, terima kasih sudah menghubungi kami! Kami akan membalas secepatnya ya.",
      followGate: false,
    },
  },
  {
    title: "Kirim katalog via DM",
    hint: 'DM "katalog", "menu"',
    sample: "Ini katalog lengkap kami kak, tekan tombol di bawah 👇",
    patch: {
      name: "Katalog via DM",
      trigger: "dm",
      action: "reply",
      keyword: "katalog,menu,list",
      reply: "Ini katalog lengkap kami kak, tekan tombol di bawah 👇",
      followGate: false,
    },
  },
];
const TH_COMMENT: Tpl[] = [
  {
    title: "Balas semua balasan",
    hint: "Balasan apa saja di thread",
    sample: "Makasih sudah mampir di thread ini! 🙌",
    patch: {
      name: "Balas balasan Threads",
      trigger: "comment",
      action: "reply",
      keyword: "",
      reply: "Makasih sudah mampir di thread ini! 🙌",
    },
  },
  {
    title: "Jawab pertanyaan harga",
    hint: 'Balasan "harga", "berapa"',
    sample: "Halo kak, info harga lengkap sudah ada di link bio ya 🙏",
    patch: {
      name: "Harga di Threads",
      trigger: "comment",
      action: "reply",
      keyword: "harga,berapa",
      reply: "Halo kak, info harga lengkap sudah ada di link bio ya 🙏",
    },
  },
  {
    title: "Arahkan ke link",
    hint: 'Balasan "link", "info"',
    sample: "Linknya ada di bio kami ya kak 👆",
    patch: {
      name: "Link di Threads",
      trigger: "comment",
      action: "reply",
      keyword: "link,info",
      reply: "Linknya ada di bio kami ya kak 👆",
    },
  },
];
const FB_COMMENT: Tpl[] = [
  {
    title: "Balas semua komentar",
    hint: "Komentar apa saja di Page",
    sample: "Terima kasih sudah berkomentar kak! 🙏",
    patch: {
      name: "Balas komentar Facebook",
      trigger: "comment",
      action: "reply",
      keyword: "",
      reply: "Terima kasih sudah berkomentar kak! 🙏",
    },
  },
  {
    title: "Jawab pertanyaan harga",
    hint: 'Komentar "harga", "berapa"',
    sample: "Halo kak, info harga sudah kami kirim lewat Messenger ya 🙏",
    patch: {
      name: "Harga di Facebook",
      trigger: "comment",
      action: "reply",
      keyword: "harga,berapa,price",
      reply: "Halo kak, info harga lengkap ada di link di profil kami ya 🙏",
    },
  },
];
const TT_COMMENT: Tpl[] = [
  {
    title: "Balas semua komentar",
    hint: "Komentar apa saja di video",
    sample: "Makasih udah nonton kak! 🔥",
    patch: {
      name: "Balas komentar TikTok",
      trigger: "comment",
      action: "reply",
      keyword: "",
      reply: "Makasih udah nonton kak! 🔥",
    },
  },
  {
    title: "Arahkan ke link",
    hint: 'Komentar "link", "info", "harga"',
    sample: "Linknya ada di bio ya kak 👆",
    patch: {
      name: "Link di TikTok",
      trigger: "comment",
      action: "reply",
      keyword: "link,info,harga",
      reply: "Linknya ada di bio ya kak 👆",
    },
  },
];
type AutoPlatform = "instagram" | "threads" | "facebook" | "tiktok";
const AUTO_PLATFORMS: { id: AutoPlatform; label: string; desc: string }[] = [
  {
    id: "instagram",
    label: "Instagram",
    desc: "Komentar → DM, balas komentar & DM, balasan story",
  },
  { id: "threads", label: "Threads", desc: "Balas komentar dengan kata kunci" },
  { id: "facebook", label: "Facebook", desc: "Balas komentar di Page dengan kata kunci" },
  { id: "tiktok", label: "TikTok", desc: "Balas komentar video dengan kata kunci" },
];
/** Platform selain Instagram hanya mendukung balasan komentar (tanpa DM). */
export const replyLimitFor = (platform?: string) =>
  platform === "tiktok" ? 150 : platform && platform !== "instagram" ? 500 : 2000;

function TemplatePicker({
  open,
  onOpenChange,
  accounts,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: { id: string; account_name: string; platform: string }[];
  onPick: (f: Form) => void;
}) {
  const [tab, setTab] = useState<AutoPlatform | null>(null);
  const acc = tab ? accounts.find((a) => a.platform === tab) : undefined;
  const pick = (t?: Tpl) =>
    onPick({ ...EMPTY, accountId: acc?.id ?? accounts[0]?.id ?? "", ...(t?.patch ?? {}) });
  const card = (t: Tpl) => (
    <button
      key={t.title}
      disabled={!acc}
      onClick={() => pick(t)}
      className="group w-full rounded-2xl border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-md disabled:opacity-50"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{t.title}</p>
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
      <p className="mt-3 w-fit max-w-full rounded-2xl bg-secondary px-3 py-2 text-sm">{t.sample}</p>
    </button>
  );
  const label = AUTO_PLATFORMS.find((p) => p.id === tab)?.label ?? "";
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTab(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader className="sm:text-center">
          <DialogTitle className="flex items-center gap-2 sm:justify-center">
            {tab && (
              <button
                type="button"
                onClick={() => setTab(null)}
                className="rounded-full p-1 hover:bg-muted"
                aria-label="Kembali"
              >
                <ChevronRight className="size-4 rotate-180" />
              </button>
            )}
            {tab ? `Automation ${label}` : "Automation baru"}
          </DialogTitle>
          {!tab && <p className="text-sm text-muted-foreground">Pilih platform-nya dulu.</p>}
        </DialogHeader>
        {!tab ? (
          <div className="grid grid-cols-2 gap-3">
            {AUTO_PLATFORMS.map((p) => {
              const has = accounts.some((a) => a.platform === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTab(p.id)}
                  className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center transition hover:border-primary/50 hover:shadow-md sm:p-6"
                >
                  <SocialIcon platform={p.id} className="size-10 sm:size-12" />
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-xs text-muted-foreground sm:text-sm">{p.desc}</span>
                  {!has && (
                    <span className="text-[11px] text-amber-600">Belum ada akun terhubung</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {!acc && (
              <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Belum ada akun {label} terhubung. Hubungkan dulu di menu Akun Sosial.
              </p>
            )}
            {tab === "instagram" ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Komentar di post</p>
                  {IG_COMMENT.map(card)}
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">DM</p>
                  {IG_DM.map(card)}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {(tab === "threads"
                    ? TH_COMMENT
                    : tab === "facebook"
                      ? FB_COMMENT
                      : TT_COMMENT
                  ).map(card)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {label} hanya mendukung balasan komentar otomatis (tanpa DM), maksimal{" "}
                  {replyLimitFor(tab)} karakter per balasan dan 30 balasan per jam per akun.
                </p>
              </>
            )}
          </div>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Pilih template, lalu sesuaikan isinya.</p>
          <Button variant="outline" disabled={tab ? !acc : !accounts.length} onClick={() => pick()}>
            Buat dari awal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
