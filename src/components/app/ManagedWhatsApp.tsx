import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  connectKirimdevManaged,
  disconnectKirimdevManaged,
  getKirimdevManaged,
  syncKirimdevManaged,
} from "@/lib/kirimdev.functions";
import { listLeadInvoices } from "@/lib/lead-invoice.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { WhatsAppCostInfo } from "@/components/qalling/WhatsAppCostInfo";

const idr = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

/**
 * Halaman WhatsApp untuk pengguna: hubungkan nomor sendiri lewat Qalling (Kirimdev + Embedded Signup Meta)
 * tanpa API key, lihat status nomor & template, dan riwayat invoice yang terkirim.
 */
export function ManagedWhatsApp({ workspaceId }: { workspaceId: string }) {
  const { pick } = useI18n();
  const { entitlements } = useApp();
  const canInvoice = entitlements.qalling?.features?.lead_invoice === true;
  const qc = useQueryClient();
  const key = ["kirimdev-managed", workspaceId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getKirimdevManaged({ data: { workspaceId } }),
    refetchInterval: (query) =>
      query.state.data?.managed && !query.state.data.connected ? 8000 : false,
  });
  const invoices = useQuery({
    queryKey: ["wa-sent-invoices", workspaceId],
    enabled: canInvoice && !!q.data?.connected,
    queryFn: () => listLeadInvoices({ data: { workspaceId } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["crm-wa-settings", workspaceId] });
  };
  const sync = useMutation({
    mutationFn: () => syncKirimdevManaged({ data: { workspaceId } }),
    onSuccess: (r) => {
      if (r.connected) toast.success(pick("WhatsApp number connected", "Nomor WhatsApp terhubung"));
      if (r.template?.startsWith("error")) toast.error(r.template);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const connect = useMutation({
    mutationFn: () => connectKirimdevManaged({ data: { workspaceId } }),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const off = useMutation({
    mutationFn: () => disconnectKirimdevManaged({ data: { workspaceId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  // Saat menunggu pemasangan, periksa status otomatis agar nomor muncul setelah selesai di Meta.
  const polled = useRef(false);
  useEffect(() => {
    if (d?.managed && !d.connected && !polled.current) {
      polled.current = true;
      sync.mutate();
    }
    if (d?.connected) polled.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.managed, d?.connected]);

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!d) return null;
  if (!d.platformReady && !d.managed)
    return (
      <section className="rounded-3xl border bg-card p-6 text-center shadow-sm sm:rounded-2xl">
        <MessageCircle className="mx-auto size-10 text-emerald-600" />
        <p className="mt-3 font-semibold">
          {pick("WhatsApp is not available yet", "WhatsApp belum tersedia")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {pick(
            "This feature is still being prepared. Contact support if you need it now.",
            "Fitur ini sedang disiapkan. Hubungi support bila Anda membutuhkannya sekarang.",
          )}
        </p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to="/qalling/app/support">{pick("Contact support", "Hubungi support")}</Link>
        </Button>
      </section>
    );

  const tpl = d.templateStatus?.toLowerCase() ?? null;
  const tplApproved = tpl === "approved";
  const sent = (invoices.data ?? []).filter((i) => i.sentAt).slice(0, 8);
  const waiting = d.managed && !d.connected;

  return (
    <div className="space-y-4">
      {/* Status utama */}
      <section
        className={cn(
          "overflow-hidden rounded-3xl border p-5 shadow-sm sm:rounded-2xl sm:p-6",
          d.connected
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card"
            : "bg-gradient-to-br from-primary/10 via-card to-card",
        )}
      >
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl",
              d.connected ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-600",
            )}
          >
            <MessageCircle className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            {d.connected ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> {pick("Connected", "Terhubung")}
                </p>
                <p className="mt-0.5 truncate text-xl font-bold">{d.number ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {pick(
                    "Messages are sent from this official WhatsApp Business number.",
                    "Pesan dikirim dari nomor WhatsApp Business resmi ini.",
                  )}
                </p>
              </>
            ) : waiting ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
                  <Clock className="size-4" /> {pick("Waiting for setup", "Menunggu pemasangan")}
                </p>
                <p className="mt-0.5 text-lg font-bold">
                  {pick(
                    "Finish connecting in the Meta page",
                    "Selesaikan pemasangan di halaman Meta",
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pick(
                    "We check automatically. If you are done, tap “Check status”.",
                    "Kami memeriksa otomatis. Kalau sudah selesai, ketuk “Cek status”.",
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold sm:text-xl">
                  {pick("Connect your WhatsApp number", "Hubungkan nomor WhatsApp Anda")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pick(
                    "Send invoices to customers straight from Qalling, from your own number. No API key or technical setup.",
                    "Kirim invoice ke pelanggan langsung dari Qalling, memakai nomor Anda sendiri. Tanpa API key atau pengaturan teknis.",
                  )}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {d.connected ? (
            <>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCw className={cn(sync.isPending && "animate-spin")} />
                {pick("Refresh status", "Perbarui status")}
              </Button>
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={off.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      pick(
                        "Disconnect this WhatsApp number from Qalling?",
                        "Putuskan nomor WhatsApp ini dari Qalling?",
                      ),
                    )
                  )
                    off.mutate();
                }}
              >
                {pick("Disconnect", "Putuskan")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 max-sm:w-full"
                disabled={connect.isPending}
                onClick={() => connect.mutate()}
              >
                {connect.isPending ? <Loader2 className="animate-spin" /> : <Smartphone />}
                {waiting
                  ? pick("Open setup page again", "Buka halaman pemasangan lagi")
                  : pick("Connect WhatsApp number", "Hubungkan nomor WhatsApp")}
              </Button>
              {waiting && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full max-sm:w-full"
                  disabled={sync.isPending}
                  onClick={() => sync.mutate()}
                >
                  {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {pick("Check status", "Cek status")}
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      {/* Langkah atau status template */}
      {d.connected ? (
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                tplApproved
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-amber-500/15 text-amber-600",
              )}
            >
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {pick("Invoice message template", "Template pesan invoice")}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full",
                    tplApproved
                      ? "border-emerald-500 text-emerald-600"
                      : "border-amber-500 text-amber-600",
                  )}
                >
                  {tplApproved
                    ? pick("Approved", "Disetujui")
                    : tpl === "rejected"
                      ? pick("Rejected", "Ditolak")
                      : pick("Waiting for Meta", "Menunggu Meta")}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tplApproved
                  ? pick(
                      "Ready. Invoices can be sent to customers via WhatsApp.",
                      "Siap. Invoice bisa dikirim ke pelanggan lewat WhatsApp.",
                    )
                  : tpl === "rejected"
                    ? pick(
                        "Meta rejected the template. Contact support so we can fix it.",
                        "Meta menolak template. Hubungi support agar kami perbaiki.",
                      )
                    : pick(
                        "We created it for you. Meta usually approves it within minutes, at most 48 hours. Tap Refresh status to check.",
                        "Sudah kami buatkan otomatis. Meta biasanya menyetujui dalam hitungan menit, paling lama 48 jam. Ketuk Perbarui status untuk mengecek.",
                      )}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
          <p className="font-semibold">{pick("How it works", "Cara menghubungkan")}</p>
          <ol className="mt-3 space-y-3">
            {[
              [
                pick("Tap “Connect WhatsApp number”", "Ketuk “Hubungkan nomor WhatsApp”"),
                pick("A Meta (Facebook) page opens.", "Halaman Meta (Facebook) akan terbuka."),
              ],
              [
                pick("Sign in and choose your number", "Login lalu pilih nomor Anda"),
                pick(
                  "Pick your business and WhatsApp Business number, or register a new one. You can keep using it in the WhatsApp Business app.",
                  "Pilih bisnis dan nomor WhatsApp Business, atau daftarkan nomor baru. Nomor tetap bisa dipakai di aplikasi WhatsApp Business.",
                ),
              ],
              [
                pick("Come back here", "Kembali ke halaman ini"),
                pick(
                  "The number appears automatically and we prepare the invoice template for you.",
                  "Nomor muncul otomatis dan template invoice kami siapkan untuk Anda.",
                ),
              ],
            ].map(([title, desc], i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Yang bisa dilakukan */}
      <section className="rounded-3xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
        <p className="font-semibold">{pick("What you can do", "Yang bisa Anda lakukan")}</p>
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {pick("Send invoices on WhatsApp", "Kirim invoice ke WhatsApp")}
            </p>
            <p className="text-xs text-muted-foreground">
              {pick(
                "Open a lead in Leads or Pipeline, create an invoice, then tap Send WhatsApp. The customer receives the total and a link to view and download the PDF.",
                "Buka prospek di Prospek atau Pipeline, buat invoice, lalu ketuk Kirim WhatsApp. Pelanggan menerima total tagihan dan link untuk melihat serta mengunduh PDF.",
              )}
            </p>
            {canInvoice ? (
              <Button asChild size="sm" variant="outline" className="mt-2 rounded-full">
                <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "leads" }}>
                  {pick("Open Leads", "Buka Prospek")}
                </Link>
              </Button>
            ) : (
              <p className="mt-1 text-xs text-amber-600">
                {pick("Available on Pro and Agency plans.", "Tersedia di paket Pro dan Agency.")}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Riwayat */}
      {d.connected && canInvoice && (
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
          <p className="font-semibold">
            {pick("Recently sent invoices", "Invoice terkirim terakhir")}
          </p>
          {sent.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {pick("No invoices sent yet.", "Belum ada invoice yang dikirim.")}
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {sent.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.customer}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.number} · {i.sentAt ? new Date(i.sentAt).toLocaleString() : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{idr(i.total)}</p>
                    <p
                      className={cn(
                        "text-xs",
                        i.status === "paid"
                          ? "text-emerald-600"
                          : i.overdue
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {i.status === "paid"
                        ? pick("Paid", "Lunas")
                        : i.overdue
                          ? pick("Overdue", "Jatuh tempo")
                          : pick("Unpaid", "Belum dibayar")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="rounded-3xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
        <summary className="cursor-pointer font-semibold">{pick("Costs", "Biaya")}</summary>
        <div className="mt-3">
          <WhatsAppCostInfo />
        </div>
      </details>
    </div>
  );
}
