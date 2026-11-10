import { SocialIcon } from "@/components/qalling/SocialIcon";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCheck,
  Clock,
  ArrowLeft,
  Inbox,
  Lock,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserPlus,
} from "lucide-react";
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
export function CrmInboxView({
  workspaceId,
  embedded,
}: {
  workspaceId: string;
  /** Di dalam InboxHub: judul halaman sudah ada, cukup tombol segarkan. */
  embedded?: boolean;
}) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("open");
  const [account, setAccount] = useState("all");
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { entitlements } = useApp();
  const crmAccess = {
    data: Boolean(
      entitlements.qalling &&
      (entitlements.qalling.features.legacy || entitlements.qalling.features.crm),
    ),
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
          ? id
            ? "Sudah tersimpan di Leads."
            : "Already in Leads."
          : id
            ? "Prospek baru masuk ke Leads."
            : "Lead created.",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (list.data ?? []).filter(
    (c) =>
      (account === "all" || c.account_id === account) &&
      (filter === "all" || (filter === "unread" ? c.unread_count > 0 : c.status === filter)) &&
      `${c.participant_name} ${c.last_message} ${c.crm_social_accounts?.account_name ?? ""}`
        .toLowerCase()
        .includes(term.toLowerCase()),
  );
  const accountsInList = [
    ...new Map(
      (list.data ?? []).map((c) => [
        c.account_id,
        {
          id: c.account_id,
          name: c.crm_social_accounts?.account_name || "—",
          platform: c.crm_social_accounts?.platform ?? "",
        },
      ]),
    ).values(),
  ];
  const open = replyWindowOpen(active?.reply_window_expires_at ?? null, now);
  const locale = id ? "id-ID" : "en-US";
  const shortDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  };
  const handle = (n?: string | null) => (n ? (n.startsWith("@") ? n : `@${n}`) : "—");
  const canReply = !note && open && active?.crm_social_accounts?.status === "connected";
  // Kelompokkan pesan per tanggal.
  const groups: { day: string; items: NonNullable<typeof messages.data> }[] = [];
  for (const m of messages.data ?? []) {
    const day = new Date(m.created_at).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const g = groups.at(-1);
    if (g && g.day === day) g.items.push(m);
    else groups.push({ day, items: [m] });
  }
  const avatar = (name: string, platform: string, size = "size-11") => (
    <span className="relative shrink-0">
      <span
        className={cn(
          "grid place-items-center rounded-full bg-muted font-semibold text-muted-foreground",
          size,
        )}
      >
        {(name.replace(/^@/, "") || "?").charAt(0).toUpperCase()}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-card bg-card">
        <SocialIcon platform={platform} className="size-3" />
      </span>
    </span>
  );

  return (
    <div className="min-w-0">
      {!embedded && <h1 className="mb-4 text-2xl font-medium">Inbox</h1>}
      <div className="grid min-w-0 overflow-hidden rounded-3xl border bg-card shadow-sm sm:rounded-2xl md:h-[calc(100dvh-13rem)] md:min-h-[540px] md:grid-cols-[360px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-md:h-[calc(100dvh-15.5rem-env(safe-area-inset-bottom))] max-md:min-h-[360px]">
        {/* Daftar percakapan */}
        <aside
          className={cn(
            "min-h-0 min-w-0 flex-col md:flex md:border-r",
            selected ? "hidden" : "flex",
          )}
        >
          <div className="space-y-3 border-b p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <select
                aria-label={id ? "Akun" : "Account"}
                className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="all">{id ? "Semua akun" : "All accounts"}</option>
                {accountsInList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {handle(a.name)}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={id ? "Segarkan Inbox" : "Refresh Inbox"}
                onClick={refresh}
              >
                <RefreshCw className={cn("size-4", list.isFetching && "animate-spin")} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={id ? "Cari percakapan" : "Search conversations"}
                placeholder={id ? "Cari nama atau username" : "Search name or username"}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="rounded-full pl-9"
              />
            </div>
            <div className="grid grid-cols-4 gap-0.5 rounded-full bg-muted p-1 text-xs sm:text-sm">
              {[
                ["open", id ? "Belum selesai" : "Open"],
                ["unread", id ? "Belum dibaca" : "Unread"],
                ["resolved", id ? "Selesai" : "Done"],
                ["all", id ? "Semua" : "All"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cn(
                    "truncate rounded-full px-1 py-1.5 font-medium",
                    filter === v ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {list.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {id ? "Memuat…" : "Loading…"}
              </p>
            ) : list.error ? (
              <p className="p-4 text-sm text-destructive">{list.error.message}</p>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Inbox className="mx-auto mb-3 size-7 opacity-40" />
                <p className="text-sm">{id ? "Belum ada percakapan." : "No conversations."}</p>
              </div>
            ) : (
              rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-muted/60",
                    selected === c.id && "bg-muted",
                  )}
                  onClick={() => {
                    setSelected(c.id);
                    setBody("");
                    if (c.unread_count) update.mutate({ conversationId: c.id, read: true });
                  }}
                >
                  {avatar(c.participant_name, c.crm_social_accounts?.platform ?? "")}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate",
                          c.unread_count > 0 ? "font-semibold" : "font-medium",
                        )}
                      >
                        {c.participant_name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {shortDate(c.last_message_at)}
                      </span>
                    </span>
                    {c.last_message && (
                      <span
                        className={cn(
                          "block truncate text-sm",
                          c.unread_count > 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {c.last_message}
                      </span>
                    )}
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {id ? "ke" : "to"} {handle(c.crm_social_accounts?.account_name)}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Isi percakapan */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-col md:flex",
            selected
              ? "flex max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-card max-md:pb-[env(safe-area-inset-bottom)] max-md:pt-[env(safe-area-inset-top)]"
              : "hidden",
          )}
        >
          {!active ? (
            <div className="hidden flex-1 place-items-center text-sm text-muted-foreground md:grid">
              <div className="text-center">
                <Inbox className="mx-auto mb-2 size-9 opacity-30" />
                {id ? "Pilih percakapan untuk mulai membalas." : "Pick a conversation to reply."}
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-5">
                <button
                  type="button"
                  className="rounded-full p-1.5 hover:bg-muted md:hidden"
                  onClick={() => setSelected(null)}
                  aria-label={id ? "Kembali" : "Back"}
                >
                  <ArrowLeft className="size-5" />
                </button>
                {avatar(
                  active.participant_name,
                  active.crm_social_accounts?.platform ?? "",
                  "size-10",
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{active.participant_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {id ? "ke" : "to"} {handle(active.crm_social_accounts?.account_name)}
                  </p>
                </div>
                {active.lead_id ? (
                  <Badge variant="secondary" className="hidden rounded-full sm:inline-flex">
                    <UserPlus className="mr-1 size-3" />
                    {id ? "Di Leads" : "In Leads"}
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full max-sm:size-9 max-sm:p-0"
                    disabled={toLead.isPending}
                    title={id ? "Simpan ke Leads" : "Save to Leads"}
                    onClick={() =>
                      crmAccess.data
                        ? toLead.mutate(active.id)
                        : toast.info(
                            id
                              ? "Simpan DM ke Leads tersedia mulai paket Pro. Upgrade di menu Tagihan & Saldo."
                              : "Save to Leads is available from the Pro plan.",
                          )
                    }
                  >
                    {crmAccess.data ? <UserPlus className="size-4" /> : <Lock className="size-4" />}
                    <span className="max-sm:hidden">
                      {id ? "Simpan ke Leads" : "Save to Leads"}
                    </span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full max-sm:size-9 max-sm:p-0"
                  disabled={update.isPending}
                  title={
                    active.status === "open"
                      ? id
                        ? "Tandai selesai"
                        : "Mark done"
                      : id
                        ? "Buka lagi"
                        : "Reopen"
                  }
                  onClick={() =>
                    update.mutate({
                      conversationId: active.id,
                      status: active.status === "open" ? "resolved" : "open",
                    })
                  }
                >
                  <CheckCheck className="size-4" />
                  <span className="max-sm:hidden">
                    {active.status === "open"
                      ? id
                        ? "Tandai selesai"
                        : "Mark done"
                      : id
                        ? "Buka lagi"
                        : "Reopen"}
                  </span>
                </Button>
              </header>

              <div
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-5 md:min-h-0"
                aria-label={id ? "Pesan percakapan" : "Conversation messages"}
              >
                {messages.error ? (
                  <p className="text-destructive">{messages.error.message}</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.day} className="space-y-2">
                      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        {g.day}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      {g.items.map((m) => {
                        const out = m.direction === "outbound";
                        const isNote = m.direction === "note";
                        const hasAtt = Array.isArray(m.attachments) && m.attachments.length > 0;
                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "flex",
                              out ? "justify-end" : isNote ? "justify-center" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                                out
                                  ? "rounded-br-md bg-primary text-primary-foreground"
                                  : isNote
                                    ? "border border-dashed bg-amber-500/10"
                                    : "rounded-bl-md bg-muted",
                              )}
                            >
                              {isNote && (
                                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                  <StickyNote className="size-3" />
                                  {id ? "Catatan internal" : "Internal note"}
                                </p>
                              )}
                              {m.body ? (
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              ) : null}
                              {hasAtt && (
                                <p
                                  className={cn(
                                    "text-xs",
                                    out ? "opacity-80" : "text-muted-foreground",
                                  )}
                                >
                                  {id
                                    ? "Lampiran ini hanya bisa dilihat di aplikasinya"
                                    : "This attachment can only be viewed in the app"}
                                </p>
                              )}
                              <p
                                className={cn(
                                  "mt-1 text-right text-[10px]",
                                  out ? "opacity-75" : "text-muted-foreground",
                                )}
                              >
                                {new Date(m.created_at).toLocaleTimeString(locale, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {out && m.status !== "sent" ? ` · ${m.status}` : ""}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <footer className="space-y-2 border-t p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid grid-cols-2 gap-0.5 rounded-full bg-muted p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setNote(false)}
                      className={cn(
                        "rounded-full px-3 py-1 font-medium",
                        !note ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {id ? "Balasan" : "Reply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNote(true)}
                      className={cn(
                        "rounded-full px-3 py-1 font-medium",
                        note ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {id ? "Catatan" : "Note"}
                    </button>
                  </div>
                  {!note && open && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {`${Math.ceil((Date.parse(active.reply_window_expires_at ?? "") - now) / 3600000)} ${id ? "jam tersisa" : "hours left"}`}
                    </span>
                  )}
                  {(note || open) && (
                    <span className="ml-auto flex gap-2">
                      <QuickReplies workspaceId={workspaceId} onPick={(t) => setBody(t)} />
                      <QuickInvoice
                        workspaceId={workspaceId}
                        customer={active.participant_name ?? ""}
                        onUse={(t) => setBody(t)}
                      />
                    </span>
                  )}
                </div>
                {!note && !open ? (
                  <p className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
                    <Clock className="mt-0.5 size-4 shrink-0" />
                    {id
                      ? "Instagram hanya mengizinkan balasan dalam 24 jam sejak pesan terakhir pelanggan. Anda bisa membalas lagi setelah pelanggan mengirim pesan baru. Catatan internal tetap bisa ditulis."
                      : "Instagram only allows replies within 24 hours of the customer's last message. You can reply again once they message you. Internal notes still work."}
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <Textarea
                      aria-label={note ? "Catatan internal" : "Balasan pesan"}
                      rows={1}
                      maxLength={2000}
                      disabled={send.isPending || (!note && !canReply)}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          if (body.trim() && !send.isPending && (note || canReply)) send.mutate();
                        }
                      }}
                      placeholder={
                        note
                          ? id
                            ? "Catatan internal (tidak terlihat pelanggan)…"
                            : "Internal note (not visible to the customer)…"
                          : id
                            ? "Tulis balasan…"
                            : "Write a reply…"
                      }
                      className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl"
                    />
                    <Button
                      size="icon"
                      className="size-11 shrink-0 rounded-full"
                      disabled={!body.trim() || send.isPending || (!note && !canReply)}
                      onClick={() => send.mutate()}
                      aria-label={
                        note ? (id ? "Simpan catatan" : "Save note") : id ? "Kirim" : "Send"
                      }
                    >
                      {note ? <StickyNote className="size-4" /> : <Send className="size-4" />}
                    </Button>
                  </div>
                )}
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
