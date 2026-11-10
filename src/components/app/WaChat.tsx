import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  MessageCircle,
  Paperclip,
  Search,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuickReplies } from "@/components/app/QuickReplies";
import { getWaChatMessages, listWaChats, sendWaChatMessage } from "@/lib/kirimdev.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { WaMessage } from "@/lib/wa-chat.server";

const DAY = 24 * 60 * 60 * 1000;

function initials(name: string | null, phone: string | null) {
  const n = (name ?? "").trim();
  if (n) return n.charAt(0).toUpperCase();
  return (phone ?? "?").replace(/\D/g, "").slice(0, 2) || "?";
}
function shortTime(iso: string | null, locale: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Chat WhatsApp: daftar percakapan & isi pesan dari Kirimdev, balas teks dalam jendela 24 jam. */
export function WaChat({ workspaceId }: { workspaceId: string }) {
  const { pick, lang } = useI18n();
  const locale = lang === "id" ? "id-ID" : "en-US";
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const chats = useQuery({
    queryKey: ["wa-chats", workspaceId, status],
    queryFn: () =>
      listWaChats({ data: { workspaceId, status: status === "all" ? undefined : status } }),
    refetchInterval: 15_000,
  });
  const list = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (chats.data ?? []).filter(
      (c) => !q || (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q),
    );
  }, [chats.data, term]);
  const current = (chats.data ?? []).find((c) => c.id === selected) ?? null;

  const msgs = useQuery({
    queryKey: ["wa-chat-messages", workspaceId, selected],
    enabled: !!selected,
    queryFn: () => getWaChatMessages({ data: { workspaceId, conversationId: selected! } }),
    refetchInterval: 8_000,
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.data?.length, selected]);

  const lastInbound = current?.lastInboundAt ? new Date(current.lastInboundAt).getTime() : 0;
  const windowOpen = lastInbound > 0 && Date.now() - lastInbound < DAY;
  const hoursLeft = windowOpen
    ? Math.max(0, Math.floor((lastInbound + DAY - Date.now()) / 3600000))
    : 0;

  const send = useMutation({
    mutationFn: () =>
      sendWaChatMessage({ data: { workspaceId, to: current!.phone ?? "", text: text.trim() } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["wa-chat-messages", workspaceId, selected] });
      qc.invalidateQueries({ queryKey: ["wa-chats", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Kelompokkan pesan per tanggal.
  const groups = useMemo(() => {
    const out: { day: string; items: WaMessage[] }[] = [];
    for (const m of msgs.data ?? []) {
      const day = new Date(m.createdAt).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [msgs.data, locale]);

  return (
    <div className="grid min-w-0 overflow-hidden rounded-3xl border bg-card shadow-md sm:rounded-2xl md:h-[calc(100dvh-14rem)] md:min-h-[520px] md:grid-cols-[340px_minmax(0,1fr)]">
      {/* Daftar percakapan */}
      <aside
        className={cn(
          "min-w-0 flex-col border-r bg-muted/30 md:flex",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="space-y-3 border-b p-3">
          <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
            {(
              [
                ["open", pick("Open", "Terbuka")],
                ["resolved", pick("Done", "Selesai")],
                ["all", pick("All", "Semua")],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                className={cn(
                  "rounded-full py-1.5 text-sm font-medium",
                  status === k ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={pick("Search name or number…", "Cari nama atau nomor…")}
              className="rounded-full pl-9"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chats.isLoading && (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {chats.isError && (
            <p className="p-4 text-sm text-destructive">{(chats.error as Error).message}</p>
          )}
          {chats.isSuccess && list.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              <MessageCircle className="mx-auto mb-2 size-8 opacity-40" />
              {pick(
                "No chats yet. When customers message your WhatsApp number, they appear here.",
                "Belum ada chat. Saat pelanggan mengirim pesan ke nomor WhatsApp Anda, chat muncul di sini.",
              )}
            </div>
          )}
          <ul>
            {list.map((c) => {
              const open =
                c.lastInboundAt && Date.now() - new Date(c.lastInboundAt).getTime() < DAY;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60",
                      selected === c.id && "bg-emerald-500/10",
                    )}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-400">
                      {initials(c.name, c.phone)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate", c.unread > 0 && "font-semibold")}>
                          {c.name || c.phone || "—"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {shortTime(c.lastMessageAt, locale)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {c.name ? c.phone : ""}
                          {open ? (
                            <span className="ml-1 text-emerald-600">
                              · {pick("can reply", "bisa dibalas")}
                            </span>
                          ) : (
                            <span className="ml-1">· {pick("24h passed", "lewat 24 jam")}</span>
                          )}
                        </span>
                        {c.unread > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Isi chat */}
      <section className={cn("min-w-0 flex-col md:flex", selected ? "flex" : "hidden")}>
        {!current ? (
          <div className="hidden flex-1 place-items-center p-8 text-center text-sm text-muted-foreground md:grid">
            <div>
              <MessageCircle className="mx-auto mb-2 size-10 opacity-30" />
              {pick("Pick a chat to start replying.", "Pilih chat untuk mulai membalas.")}
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b px-3 py-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full p-1.5 hover:bg-muted md:hidden"
                aria-label={pick("Back", "Kembali")}
              >
                <ArrowLeft className="size-5" />
              </button>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-400">
                {initials(current.name, current.phone)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{current.name || current.phone}</p>
                <p
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    windowOpen ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  <Clock className="size-3" />
                  {windowOpen
                    ? pick(`Free reply · ${hoursLeft}h left`, `Balas bebas · sisa ${hoursLeft} jam`)
                    : pick("Waiting for the customer to reply", "Menunggu pelanggan membalas")}
                </p>
              </div>
              {current.phone && (
                <a
                  href={`https://wa.me/${current.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden text-xs text-muted-foreground underline sm:block"
                >
                  {current.phone}
                </a>
              )}
            </header>

            <div className="min-h-[50dvh] flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted))_1px,transparent_0)] bg-[size:18px_18px] p-3 sm:p-5 md:min-h-0">
              {msgs.isLoading && (
                <div className="grid place-items-center py-10 text-muted-foreground">
                  <Loader2 className="animate-spin" />
                </div>
              )}
              {groups.map((g) => (
                <div key={g.day} className="space-y-2">
                  <p className="mx-auto w-fit rounded-full bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                    {g.day}
                  </p>
                  {g.items.map((m) => {
                    const out = m.direction === "outbound";
                    return (
                      <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
                            out
                              ? "rounded-br-md bg-emerald-600 text-white"
                              : "rounded-bl-md border bg-background",
                          )}
                        >
                          {m.mediaUrl && (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "mb-1 flex items-center gap-1 underline",
                                out ? "text-white/90" : "text-primary",
                              )}
                            >
                              <Paperclip className="size-3.5" />
                              {m.type === "image"
                                ? pick("Photo", "Foto")
                                : m.type === "video"
                                  ? "Video"
                                  : m.type === "audio"
                                    ? pick("Voice note", "Pesan suara")
                                    : pick("Attachment", "Lampiran")}
                            </a>
                          )}
                          {m.text ? (
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          ) : (
                            !m.mediaUrl && <p className="italic opacity-70">[{m.type}]</p>
                          )}
                          <p
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1 text-[10px]",
                              out ? "text-white/75" : "text-muted-foreground",
                            )}
                          >
                            {new Date(m.createdAt).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {out &&
                              (m.status === "read" ? (
                                <CheckCheck className="size-3.5 text-sky-200" />
                              ) : m.status === "delivered" ? (
                                <CheckCheck className="size-3.5" />
                              ) : m.status === "failed" ? (
                                <AlertTriangle className="size-3.5 text-amber-200" />
                              ) : (
                                <Check className="size-3.5" />
                              ))}
                          </p>
                          {m.error && (
                            <p className="mt-1 text-[11px] text-amber-100">
                              {m.error === "outside_24h_window"
                                ? pick("Not sent: 24-hour window closed", "Gagal: lewat 24 jam")
                                : m.error}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <footer className="border-t p-3">
              {!windowOpen && (
                <p className="mb-2 flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {pick(
                    "More than 24 hours since the customer's last message. WhatsApp only allows free-form replies after the customer messages you again.",
                    "Sudah lewat 24 jam sejak pesan terakhir pelanggan. WhatsApp hanya mengizinkan balasan bebas setelah pelanggan mengirim pesan lagi.",
                  )}
                </p>
              )}
              {windowOpen && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <QuickReplies workspaceId={workspaceId} onPick={(t) => setText(t)} />
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (text.trim() && windowOpen && !send.isPending) send.mutate();
                    }
                  }}
                  disabled={!windowOpen}
                  rows={1}
                  maxLength={4096}
                  placeholder={pick("Type a message…", "Tulis pesan…")}
                  className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl"
                />
                <Button
                  size="icon"
                  className="size-11 shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!text.trim() || !windowOpen || send.isPending}
                  onClick={() => send.mutate()}
                  aria-label={pick("Send", "Kirim")}
                >
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
