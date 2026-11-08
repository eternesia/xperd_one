import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  connectKirimdevManaged,
  disconnectKirimdevManaged,
  getKirimdevManaged,
  syncKirimdevManaged,
  switchToOwnKirimdevKey,
} from "@/lib/kirimdev.functions";
import { useI18n } from "@/lib/i18n";
import { WhatsAppCostInfo } from "@/components/qalling/WhatsAppCostInfo";

/** Pasang nomor WhatsApp sendiri lewat Qalling (Kirimdev + Embedded Signup Meta), tanpa mengisi API key. */
export function ManagedWhatsApp({ workspaceId }: { workspaceId: string }) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const key = ["kirimdev-managed", workspaceId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getKirimdevManaged({ data: { workspaceId } }),
    refetchInterval: (query) =>
      query.state.data?.managed && !query.state.data.connected ? 8000 : false,
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
  const own = useMutation({
    mutationFn: () => switchToOwnKirimdevKey({ data: { workspaceId } }),
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

  if (!d) return null;
  if (!d.platformReady && !d.managed) return null;
  const tpl = d.templateStatus;
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-gold" />
          {pick("Official WhatsApp (via Qalling)", "WhatsApp resmi (lewat Qalling)")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.connected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">{pick("Connected", "Terhubung")}</span>
              <span className="text-muted-foreground">{d.number}</span>
              {tpl && (
                <Badge variant={tpl === "approved" ? "secondary" : "outline"}>
                  {pick("Invoice template", "Template invoice")}: {tpl}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {pick(
                "Invoices are sent from your own WhatsApp number. The invoice template is created for you and needs Meta approval (minutes to 48 hours) before the first send.",
                "Invoice terkirim dari nomor WhatsApp milik Anda. Template invoice dibuatkan otomatis dan perlu persetujuan Meta (menit hingga 48 jam) sebelum pengiriman pertama.",
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                {pick("Refresh status", "Perbarui status")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={off.isPending}
                onClick={() => off.mutate()}
              >
                {pick("Disconnect number", "Putuskan nomor")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {pick(
                "Connect your own WhatsApp Business number in a few clicks. You sign in to Meta, choose your business and number, and come back here. No API key needed. You can keep using the number in the WhatsApp Business app (coexistence) or register a new one.",
                "Hubungkan nomor WhatsApp Business milik Anda dalam beberapa klik. Anda masuk ke Meta, memilih bisnis dan nomor, lalu kembali ke sini. Tanpa API key. Nomor tetap bisa dipakai di aplikasi WhatsApp Business (coexistence) atau daftarkan nomor baru.",
              )}
            </p>
            <WhatsAppCostInfo />
            <div className="flex flex-wrap gap-2">
              <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
                {d.managed
                  ? pick("Open connection page again", "Buka halaman pemasangan lagi")
                  : pick("Connect WhatsApp number", "Hubungkan nomor WhatsApp")}
              </Button>
              {d.managed && (
                <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
                  {pick("I have finished, check status", "Sudah selesai, cek status")}
                </Button>
              )}
            </div>
          </>
        )}
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => own.mutate()}
          hidden={!d.managed}
        >
          {pick("Use my own Kirimdev API key instead", "Pakai API key Kirimdev milik sendiri")}
        </button>
      </CardContent>
    </Card>
  );
}
