import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, Clock, Inbox, Lock, RefreshCw, Send, StickyNote, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-context";
import { convertConversationToLead } from "@/lib/inbox-lead.functions";
import { useI18n } from "@/lib/i18n";
import { replyWindowOpen } from "@/lib/meta-inbox-rules";
import {
  listConversations,
  listThread,
  sendInboxMessage,
  syncTebarSocial,
  updateConversation,
} from "@/lib/social-interactions.functions";
import { cn } from "@/lib/utils";
import { QuickInvoice, QuickReplies } from "@/components/app/QuickReplies";

/**
 * Qalling **Inbox** (DM Facebook/Instagram) — diporting dari BS New 11 `CrmInbox.tsx`; data lewat
 * server fn MySQL Old. Tanpa Realtime: segar saat fokus atau lewat tombol segarkan (tanpa polling).
 */
export function CrmInboxView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("open");
  const [platform, setPlatform] = useState("all");
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { entitlements } = useApp();
  const crmAccess = {
    data: Boolean(entitlements.qalling && (entitlements.qalling.features.legacy || entitlements.qalling.features.crm)),
  };
  const leadFn = useServerFn(convertConversationToLead);
  const sendFn = useServerFn(sendInboxMessage);
  const updateFn = useServerFn(updateConversation);
  const listFn = useServerFn(listConversations);
  const syncFn = useServerFn(syncTebarSocial);
  const threadFn = useServerFn(listThread);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["crm-inbox", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-thread", workspaceId] });
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  // This backend does not expose managed Realtime; refresh on focus or explicitly, without polling.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [workspaceId]);
  const list = useQuery({
    queryKey: ["crm-inbox", workspaceId],
    queryFn: async () => {
      try {
        await syncFn({ data: { workspaceId } }).catch(() => null); // tarik DM/komentar Tebar saat dibuka
        return await listFn({ data: { workspaceId } });
      } catch {
        throw new Error(id ? "Inbox tidak dapat dimuat." : "Unable to load Inbox.");
      }
    },
  });
  const active = list.data?.find((c) => c.id === selected);
  const messages = useQuery({
    queryKey: ["crm-thread", workspaceId, selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      if (!selected) return [];
      try {
        return await threadFn({ data: { workspaceId, conversationId: selected } });
      } catch {
        throw new Error(id ? "Pesan tidak dapat dimuat." : "Unable to load messages.");
      }
    },
  });
  const update = useMutation({
    mutationFn: (data: { conversationId: string; status?: "open" | "resolved"; read?: boolean }) =>
      updateFn({ data: { workspaceId, ...data } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Pilih percakapan.");
      return sendFn({
        data: { workspaceId, conversationId: selected, messageId: crypto.randomUUID(), body, note },
      });
    },
    onSuccess: (r) => {
      setBody("");
      refresh();
      if (r.status === "failed")
        toast.error(id ? "Meta menolak pesan." : "Meta rejected the message.");
      else if (r.status === "unknown" || r.status === "sending")
        toast.warning(
          id
            ? "Status belum pasti. Periksa percakapan sebelum mengirim ulang."
            : "Status uncertain. Check the conversation before resending.",
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toLead = useMutation({
    mutationFn: (conversationId: string) => leadFn({ data: { workspaceId, conversationId } }),
    onSuccess: (r) => {
      toast.success(
        r.existing
          ? id ? "Sudah tersimpan di Leads." : "Already in Leads."
          : id ? "Prospek baru masuk ke Leads." : "Lead created.",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (list.data ?? []).filter(
    (c) =>
      (platform === "all" || c.crm_social_accounts?.platform === platform) &&
      (filter === "all" || (filter === "unread" ? c.unread_count > 0 : c.status === filter)) &&
      `${c.participant_name} ${c.last_message} ${c.crm_social_accounts?.account_name ?? ""}`
        .toLowerCase()
        .includes(term.toLowerCase()),
  );
  const open = replyWindowOpen(active?.reply_window_expires_at ?? null, now);
  return (
    <div className="space-y-5 min-w-0">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-2xl font-medium">Inbox Terpadu</h1>
        <Button
          variant="outline"
          size="icon"
          aria-label={id ? "Segarkan Inbox" : "Refresh Inbox"}
          onClick={refresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <label className="block max-w-72 text-sm text-muted-foreground">
        {id ? "Media sosial" : "Social platform"}
        <select
          className="mt-1 w-full rounded-md border bg-background p-2 text-foreground"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="all">{id ? "Semua akun" : "All accounts"}</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
      </label>
      <div className="grid min-w-0 border-t md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 md:border-r">
          <div className="space-y-3 py-4 md:pr-4">
            <Input
              aria-label={id ? "Cari percakapan" : "Search conversations"}
              placeholder={id ? "Cari percakapan…" : "Search conversations…"}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {[
                ["open", id ? "Terbuka" : "Open"],
                ["resolved", id ? "Selesai" : "Resolved"],
                ["unread", id ? "Belum dibaca" : "Unread"],
                ["all", id ? "Semua" : "All"],
              ].map(([v, label]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={filter === v ? "secondary" : "ghost"}
                  onClick={() => setFilter(v)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {list.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">{id ? "Memuat…" : "Loading…"}</p>
          ) : list.error ? (
            <p className="py-6 text-sm text-destructive">{list.error.message}</p>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Inbox className="mx-auto mb-3 size-6" />
              <p className="text-sm">{id ? "Belum ada percakapan." : "No conversations."}</p>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              {rows.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-start rounded-none border-b p-4 text-left",
                    selected === c.id && "bg-muted",
                  )}
                  onClick={() => {
                    setSelected(c.id);
                    setBody("");
                    if (c.unread_count) update.mutate({ conversationId: c.id, read: true });
                  }}
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-semibold">{c.participant_name}</span>
                      {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.crm_social_accounts?.platform} · {c.crm_social_accounts?.account_name}
                    </span>
                    <span className="block truncate text-sm font-normal">
                      {c.last_message || (id ? "Lampiran" : "Attachment")}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </aside>
        <section className="min-w-0 md:pl-6">
          {!active ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
              {id ? "Pilih percakapan" : "Select a conversation"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b py-4">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{active.participant_name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {active.crm_social_accounts?.account_name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {active.lead_id ? (
                    <Badge variant="secondary">
                      <UserPlus className="mr-1 size-3" />
                      {id ? "Tersimpan di Leads" : "In Leads"}
                    </Badge>
                  ) : crmAccess.data ? (
                    <Button variant="outline" size="sm" disabled={toLead.isPending} onClick={() => toLead.mutate(active.id)}>
                      <UserPlus className="size-4" />
                      {id ? "Simpan ke Leads" : "Save to Leads"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      title={id ? "Tersedia mulai paket Pro" : "Available from Pro"}
                      onClick={() =>
                        toast.info(
                          id
                            ? "Simpan DM ke Leads tersedia mulai paket Pro. Upgrade di menu Tagihan & Saldo."
                            : "Save to Leads is available from the Pro plan.",
                        )
                      }
                    >
                      <Lock className="size-4" />
                      {id ? "Simpan ke Leads · Pro" : "Save to Leads · Pro"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        conversationId: active.id,
                        status: active.status === "open" ? "resolved" : "open",
                      })
                    }
                  >
                    <CheckCheck className="size-4" />
                    {active.status === "open"
                      ? id ? "Selesaikan" : "Resolve"
                      : id ? "Buka kembali" : "Reopen"}
                  </Button>
                </div>
              </div>
              <div
                className="flex max-h-[520px] min-h-64 flex-col gap-3 overflow-y-auto py-5"
                aria-label={id ? "Pesan percakapan" : "Conversation messages"}
              >
                {messages.error ? (
                  <p className="text-destructive">{messages.error.message}</p>
                ) : (
                  (messages.data ?? []).map((m) => (
                    <article
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-md border px-3 py-2",
                        m.direction === "outbound"
                          ? "self-end bg-secondary"
                          : m.direction === "note"
                            ? "self-center border-dashed bg-muted"
                            : "self-start bg-background",
                      )}
                    >
                      {m.direction === "note" && (
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {id ? "Catatan internal" : "Internal note"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {id ? "Lampiran diterima" : "Attachment received"}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()} · {m.status}
                      </p>
                    </article>
                  ))
                )}
              </div>
              <div className="space-y-3 border-t py-4">
                <div className="flex flex-wrap gap-2">
                  <QuickReplies workspaceId={workspaceId} onPick={(t) => setBody(t)} />
                  <QuickInvoice
                    workspaceId={workspaceId}
                    customer={active.participant_name ?? ""}
                    onUse={(t) => setBody(t)}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={!note ? "secondary" : "ghost"}
                      onClick={() => setNote(false)}
                    >
                      {id ? "Balasan" : "Reply"}
                    </Button>
                    <Button
                      size="sm"
                      variant={note ? "secondary" : "ghost"}
                      onClick={() => setNote(true)}
                    >
                      <StickyNote className="size-3" />
                      {id ? "Catatan" : "Note"}
                    </Button>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      open ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    <Clock className="size-3" />
                    {open
                      ? `${Math.ceil((Date.parse(active.reply_window_expires_at ?? "") - now) / 3600000)} ${id ? "jam tersisa" : "hours left"}`
                      : id
                        ? "Jendela balasan ditutup"
                        : "Reply window closed"}
                  </span>
                </div>
                <Textarea
                  aria-label={note ? "Catatan internal" : "Balasan pesan"}
                  rows={3}
                  maxLength={2000}
                  disabled={
                    send.isPending ||
                    (!note && (!open || active.crm_social_accounts?.status !== "connected"))
                  }
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    note
                      ? id
                        ? "Catatan internal…"
                        : "Internal note…"
                      : id
                        ? "Tulis balasan…"
                        : "Write a reply…"
                  }
                />
                <div className="flex justify-end">
                  <Button
                    disabled={
                      !body.trim() ||
                      send.isPending ||
                      (!note && (!open || active.crm_social_accounts?.status !== "connected"))
                    }
                    onClick={() => send.mutate()}
                  >
                    <Send className="size-4" />
                    {note ? (id ? "Simpan catatan" : "Save note") : id ? "Kirim" : "Send"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
