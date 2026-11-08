import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createMyTicket, getMyTicket, listMyTickets, replyMyTicket } from "@/lib/support.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qalling/app/support")({
  head: () => ({ meta: [{ title: "Support — Qalling" }] }),
  component: SupportPage,
});

const CATS = [
  ["general", "General question", "Pertanyaan umum"],
  ["technical", "Technical problem", "Kendala teknis"],
  ["billing", "Billing & payment", "Tagihan & pembayaran"],
  ["account", "Account & access", "Akun & akses"],
  ["feature", "Feature request", "Usulan fitur"],
] as const;
const PRIOS = [
  ["low", "Low", "Rendah"],
  ["normal", "Normal", "Normal"],
  ["high", "High", "Tinggi"],
  ["urgent", "Urgent", "Mendesak"],
] as const;
const STATUS: Record<string, [string, string]> = {
  open: ["Open", "Terbuka"],
  in_progress: ["In progress", "Diproses"],
  waiting_customer: ["Waiting for you", "Menunggu balasan Anda"],
  resolved: ["Resolved", "Selesai"],
  closed: ["Closed", "Ditutup"],
};
const when = (v: string) =>
  new Date(`${v.replace(" ", "T")}Z`).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function SupportPage() {
  const { tenant, activeWorkspace } = useApp();
  const { pick, lang } = useI18n();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    category: "general",
    priority: "normal",
    description: "",
  });
  const [reply, setReply] = useState("");
  const tenantId = tenant?.id ?? null;
  const list = useQuery({
    queryKey: ["my-tickets", tenantId],
    queryFn: () => listMyTickets({ data: { tenantId } }),
  });
  const detail = useQuery({
    queryKey: ["my-ticket", openId],
    enabled: Boolean(openId),
    queryFn: () => getMyTicket({ data: { ticketId: openId! } }),
    refetchInterval: 60_000,
  });
  const create = useMutation({
    mutationFn: () =>
      createMyTicket({
        data: {
          tenantId,
          workspaceId: activeWorkspace?.id ?? null,
          subject: form.subject,
          category: form.category as (typeof CATS)[number][0],
          priority: form.priority as (typeof PRIOS)[number][0],
          description: form.description,
        },
      }),
    onSuccess: (r) => {
      toast.success(pick(`Ticket ${r.ticketNo} sent`, `Tiket ${r.ticketNo} terkirim`));
      setCreating(false);
      setForm({ subject: "", category: "general", priority: "normal", description: "" });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      setOpenId(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => replyMyTicket({ data: { ticketId: openId!, body: reply } }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["my-ticket", openId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const label = (pair: readonly [string, string, string] | undefined) =>
    pair ? (lang === "id" ? pair[2] : pair[1]) : "";
  const st = (s: string) => (STATUS[s] ? STATUS[s][lang === "id" ? 1 : 0] : s);
  const t = detail.data?.ticket;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy dark:text-foreground">
            <LifeBuoy className="h-5 w-5 text-gold" /> {pick("Support", "Bantuan & Support")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pick(
              "Send a ticket to the Qalling team and follow the replies here.",
              "Kirim tiket ke tim Qalling dan pantau balasannya di sini.",
            )}
          </p>
        </div>
        {!creating && !openId && (
          <Button variant="gold" onClick={() => setCreating(true)}>
            <Plus /> {pick("New ticket", "Tiket baru")}
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{pick("New ticket", "Tiket baru")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder={pick("Subject", "Judul")}
              maxLength={200}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                aria-label={pick("Category", "Kategori")}
              >
                {CATS.map((c) => (
                  <option key={c[0]} value={c[0]}>
                    {label(c)}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                aria-label={pick("Priority", "Prioritas")}
              >
                {PRIOS.map((c) => (
                  <option key={c[0]} value={c[0]}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={6}
              maxLength={5000}
              placeholder={pick(
                "Describe the problem, the steps you took, and any error messages.",
                "Jelaskan kendalanya, langkah yang sudah dilakukan, dan pesan galat bila ada.",
              )}
            />
            <div className="flex gap-2">
              <Button
                variant="gold"
                disabled={
                  form.subject.trim().length < 3 ||
                  form.description.trim().length < 5 ||
                  create.isPending
                }
                onClick={() => create.mutate()}
              >
                <Send /> {pick("Send ticket", "Kirim tiket")}
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                {pick("Cancel", "Batal")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {openId ? (
        <Card>
          <CardHeader className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setOpenId(null)}
            >
              <ArrowLeft className="h-4 w-4" /> {pick("All tickets", "Semua tiket")}
            </button>
            {t && (
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {t.subject.replace(/^\[Qalling\] /, "")}
                </CardTitle>
                <Badge variant="outline">{t.ticket_no}</Badge>
                <Badge
                  variant={
                    t.status === "resolved" || t.status === "closed" ? "secondary" : "default"
                  }
                >
                  {st(t.status)}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {t?.description && (
              <div className="rounded-lg border bg-secondary/40 p-3 text-sm">
                <p className="whitespace-pre-line">{t.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{when(t.created_at)}</p>
              </div>
            )}
            {detail.data?.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  m.fromSupport ? "border-sky-200 bg-sky-50 dark:bg-secondary/40" : "ml-8",
                )}
              >
                <p className="text-xs font-semibold">
                  {m.fromSupport
                    ? pick("Qalling Support", "Tim Support Qalling")
                    : pick("You", "Anda")}
                </p>
                <p className="mt-1 whitespace-pre-line">{m.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{when(m.created_at)}</p>
              </div>
            ))}
            {t && t.status !== "closed" && (
              <div className="flex gap-2">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  maxLength={5000}
                  placeholder={pick("Write a reply…", "Tulis balasan…")}
                />
                <Button
                  disabled={!reply.trim() || send.isPending}
                  onClick={() => send.mutate()}
                  aria-label={pick("Send", "Kirim")}
                >
                  <Send />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {list.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">{pick("Loading…", "Memuat…")}</p>
            ) : !list.data?.length ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                {pick(
                  "No tickets yet. Create one if you need help.",
                  "Belum ada tiket. Buat tiket baru bila butuh bantuan.",
                )}
              </p>
            ) : (
              <ul className="divide-y">
                {list.data.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50"
                      onClick={() => setOpenId(r.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {r.subject.replace(/^\[Qalling\] /, "")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.ticket_no} · {when(r.updated_at)}
                        </span>
                      </span>
                      <Badge
                        variant={
                          r.status === "waiting_customer"
                            ? "destructive"
                            : r.status === "resolved" || r.status === "closed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {st(r.status)}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
