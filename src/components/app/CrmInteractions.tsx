import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Pencil, Trash2, MessageSquare, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
      <TableSearch
        value={pages.query}
        onChange={pages.setQuery}
        placeholder="Cari postingan atau komentar…"
      />
      {query.error && <p className="text-destructive">Komentar tidak dapat dimuat.</p>}
      {query.isLoading ? (
        <p>Memuat komentar…</p>
      ) : pages.total === 0 ? (
        <div className="border-y py-14 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 size-7" />
          Belum ada komentar masuk dari akun Meta atau Tebar.
        </div>
      ) : (
        [...groups].map(([key, comments]) => (
          <section key={key} className="border-t pt-4">
            <h2 className="break-all text-sm font-medium">
              {comments[0]?.crm_social_accounts?.account_name} · Post {comments[0]?.post_id}
            </h2>
            {comments.map((c) => (
              <article key={c.id} className="mt-3 rounded-md border p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{c.author_name}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.crm_social_accounts?.platform} ·{" "}
                      {new Date(c.created_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="h-fit">
                    {c.status}
                  </Badge>
                </div>
                {c.reply && (
                  <p className="mt-3 border-l-2 pl-3 text-sm text-muted-foreground">{c.reply}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
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
export function CrmAutomationsView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const manage = useServerFn(manageAutomation);
  const boardFn = useServerFn(getAutomationBoard);
  const query = useQuery({
    queryKey: ["crm-automations", workspaceId],
    queryFn: () => boardFn({ data: { workspaceId } }),
  });
  const pages = usePaged(query.data?.rules ?? [], (r) => `${r.name} ${r.keyword} ${r.reply_body}`);
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
        <Button
          disabled={!query.data?.accounts.length}
          onClick={() => setForm({ ...EMPTY, accountId: query.data?.accounts[0]?.id ?? "" })}
        >
          <Plus className="size-4" />
          Aturan
        </Button>
      </header>
      {query.error && <p className="text-destructive">{query.error.message}</p>}
      {!query.isLoading && !query.data?.accounts.length && (
        <p className="border-y py-8 text-sm text-muted-foreground">
          Hubungkan akun Meta native untuk balasan otomatis DM dan komentar. Akun Tebar tetap
          digunakan untuk publishing.
        </p>
      )}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Aturan</TabsTrigger>
          <TabsTrigger value="history">Riwayat eksekusi</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="space-y-4">
          <TableSearch value={pages.query} onChange={pages.setQuery} />
          <div className="grid gap-4 lg:grid-cols-2">
            {pages.rows.map((r) => (
              <article key={r.id} className="rounded-md border p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-medium">{r.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.trigger_type === "dm"
                        ? "DM masuk"
                        : r.action_kind === "comment_to_dm"
                          ? "Komentar → DM"
                          : "Komentar baru"}{" "}
                      · {query.data?.accounts.find((a) => a.id === r.account_id)?.account_name} ·{" "}
                      {r.keyword || "Semua pesan"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.link_url && <Badge variant="secondary">Link · {r.click_count} klik</Badge>}
                      {r.follow_gate && <Badge variant="secondary">Wajib follow</Badge>}
                      {r.auto_like && <Badge variant="secondary">Auto-like</Badge>}
                    </div>
                  </div>
                  <Switch
                    aria-label={`Aktifkan ${r.name}`}
                    checked={r.enabled}
                    disabled={save.isPending}
                    onCheckedChange={(enabled) => save.mutate({ ...fromRow(r), enabled })}
                  />
                </div>
                <p className="mt-4 whitespace-pre-wrap break-words text-sm">{r.reply_body}</p>
                <div className="mt-3 flex justify-end">
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
              </article>
            ))}
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
  const err = f ? validateAutomation(f) : null;
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
                    onChange={(e) => set({ accountId: e.target.value })}
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
                    <option value="comment_to_dm">Komentar → kirim DM</option>
                    <option value="reply">Komentar → balas komentar</option>
                    <option value="dm">DM masuk → balas DM</option>
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
                  maxLength={f.linkUrl ? 640 : 2000}
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
