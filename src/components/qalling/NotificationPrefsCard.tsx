import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { getNotificationPrefs, setNotificationPref } from "@/lib/notification-prefs.functions";

const ITEMS = [
  {
    kind: "trial_reminder",
    label: "Pengingat masa trial",
    desc: "Email 7, 3, 1 hari dan di hari terakhir sebelum trial berakhir.",
  },
  {
    kind: "invoice_receipt",
    label: "Bukti pembayaran",
    desc: "Email otomatis setelah top up saldo atau perpanjangan dari saldo.",
  },
  {
    kind: "post_summary",
    label: "Ringkasan postingan mingguan",
    desc: "Rekap posting minggu lalu setiap hari Senin.",
  },
] as const;

export function NotificationPrefsCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const key = ["notification-prefs", tenantId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getNotificationPrefs({ data: { tenantId } }),
  });
  const m = useMutation({
    mutationFn: (v: { kind: (typeof ITEMS)[number]["kind"]; enabled: boolean }) =>
      setNotificationPref({ data: { tenantId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message || "Gagal menyimpan"),
  });
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-navy dark:text-foreground">Notifikasi email</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Peringatan saldo tidak cukup untuk perpanjangan dan perpanjangan gagal selalu dikirim karena
        memengaruhi layanan.
      </p>
      <div className="divide-y">
        {ITEMS.map((i) => (
          <div key={i.kind} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">{i.label}</p>
              <p className="text-xs text-muted-foreground">{i.desc}</p>
            </div>
            <Switch
              checked={data?.[i.kind] ?? true}
              disabled={!data || m.isPending}
              onCheckedChange={(enabled) => m.mutate({ kind: i.kind, enabled })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
