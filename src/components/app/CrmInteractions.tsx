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
} from "@/lib/social-interactions.functions";

/**
 * Qalling **Comments** & **Automations** — diporting dari BS New 11 `CrmInteractions.tsx`
 * (teks Indonesia hardcode seperti sumbernya). Data lewat server fn MySQL Old
 * (`social-interactions.functions.ts`), bukan Supabase.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function CrmCommentsView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const send = useServerFn(replySocialComment);
  const listFn = useServerFn(listCrmComments);
  const query = useQuery({
    queryKey: ["crm-comments", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
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
          Belum ada komentar masuk dari akun Meta native.
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
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={c.status !== "open"}
                  onClick={() => {
                    setSelected(c.id);
                    setBody("");
                  }}
                >
                  Balas
                </Button>
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
  keyword: string;
  reply: string;
  enabled: boolean;
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
    keyword: r.keyword,
    reply: r.reply_body,
    enabled: r.enabled,
  });
  return (
    <div className="min-w-0 space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-2xl font-medium">Automation</h1>
        <Button
          disabled={!query.data?.accounts.length}
          onClick={() =>
            setForm({
              name: "",
              accountId: query.data?.accounts[0]?.id ?? "",
              trigger: "dm",
              keyword: "",
              reply: "",
              enabled: false,
            })
          }
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
                      {r.trigger_type === "dm" ? "DM masuk" : "Komentar baru"} ·{" "}
                      {query.data?.accounts.find((a) => a.id === r.account_id)?.account_name} ·{" "}
                      {r.keyword || "Semua pesan"}
                    </p>
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
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v) setForm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah aturan" : "Aturan baru"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <label className="block text-sm">
                Nama aturan
                <Input
                  value={form.name}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Akun
                <select
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={form.accountId}
                  onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                >
                  {query.data?.accounts.map((a) => (
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
                  value={form.trigger}
                  onChange={(e) =>
                    setForm({ ...form, trigger: e.target.value as "dm" | "comment" })
                  }
                >
                  <option value="dm">DM masuk → balas DM</option>
                  <option value="comment">Komentar baru → balas komentar</option>
                </select>
              </label>
              <label className="block text-sm">
                Kata kunci (opsional)
                <Input
                  value={form.keyword}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Balasan
                <Textarea
                  value={form.reply}
                  maxLength={2000}
                  onChange={(e) => setForm({ ...form, reply: e.target.value })}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                Aktif
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={
                save.isPending || !form?.name.trim() || !form.reply.trim() || !form.accountId
              }
              onClick={() => form && save.mutate(form)}
            >
              Simpan aturan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
