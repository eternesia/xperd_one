/**
 * #63 (BS New 3): Omnix — Pengaturan API kanal, Pengiriman & Pickup, dan Laporan.
 *
 * Catatan porting ke Old: secret kanal hanya ditulis di server
 * (`omnixSaveChannelKeys`), pembacaannya lewat `listOmnixChannelSettings`
 * (hanya jejak `••••1234`). Store & order memakai lapisan data generik.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, KeyRound, PackageCheck, ScanBarcode, ShieldCheck, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { OMNIX_CHANNELS, OMNIX_ORDER_STATUS, OMNIX_PACK_STATUS, omnixChannelName, packLabel } from "@/lib/omnix";
import {
  listOmnixChannelSettings,
  omnixClearChannelKeys,
  omnixSaveChannelKeys,
  type OmnixChannelSettingRow,
} from "@/lib/omnix.functions";

interface OmnixOrderRow {
  id: string;
  store_id: string | null;
  channel: string;
  order_no: string;
  buyer_name: string | null;
  order_date: string;
  status: string;
  gross_amount: number;
  marketplace_fee: number;
  net_amount: number;
  omnix_fee: number;
  packing_status: string;
  courier: string | null;
  tracking_no: string | null;
}

interface OmnixStoreRow {
  id: string;
  channel: string;
  store_name: string;
}

function useT() {
  const { lang } = useI18n();
  return { lang, t: (en: string, id: string) => (lang === "id" ? id : en) };
}

function Header({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">OMNIX</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

function useChannelSettings(workspaceId: string) {
  const fn = useServerFn(listOmnixChannelSettings);
  return useQuery({
    queryKey: ["omnix-settings", workspaceId],
    queryFn: async () => fn({ data: { workspaceId } }),
  });
}

function useAllOrders(workspaceId: string) {
  return useQuery({
    queryKey: ["omnix-orders", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "omnix_orders", workspaceId, orderBy: "order_date", orderDir: "desc", limit: 2000 },
      });
      return (data?.rows ?? []) as unknown as OmnixOrderRow[];
    },
  });
}

/* --------------------------- Pengaturan API kanal --------------------------- */

function ChannelKeyCard({
  workspaceId,
  channel,
  row,
}: {
  workspaceId: string;
  channel: (typeof OMNIX_CHANNELS)[number];
  row?: OmnixChannelSettingRow;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(omnixSaveChannelKeys);
  const clearFn = useServerFn(omnixClearChannelKeys);
  const [pid, setPid] = useState(row?.partner_id ?? "");
  const [pub, setPub] = useState(row?.public_key ?? "");
  const [sec, setSec] = useState("");

  useEffect(() => {
    setPid(row?.partner_id ?? "");
    setPub(row?.public_key ?? "");
  }, [row?.partner_id, row?.public_key]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["omnix-settings", workspaceId] });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: { workspaceId, channel: channel.id, partnerId: pid, publicKey: pub, secretKey: sec },
      }),
    onSuccess: () => {
      void refresh();
      setSec("");
      toast.success(t(`${channel.name} keys validated & saved`, `Kunci ${channel.name} tervalidasi & tersimpan`));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: () => clearFn({ data: { workspaceId, channel: channel.id } }),
    onSuccess: () => {
      void refresh();
      toast.success(t("Keys removed", "Kunci dihapus"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ok = row?.status === "validated";

  return (
    <Card className={ok ? "border-emerald-500/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-gold" /> {channel.name}
        </CardTitle>
        {ok ? (
          <Badge className="gap-1 bg-emerald-600 text-primary-foreground">
            <ShieldCheck className="h-3 w-3" /> {t("Validated", "Tervalidasi")}
          </Badge>
        ) : (
          <Badge variant="outline">{t("Not set", "Belum diisi")}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <AdminField label={channel.pid}>
          <Input value={pid} onChange={(e) => setPid(e.target.value)} />
        </AdminField>
        <AdminField label={channel.pub}>
          <Input value={pub} onChange={(e) => setPub(e.target.value)} />
        </AdminField>
        <AdminField label={channel.sec}>
          <Input
            type="password"
            autoComplete="new-password"
            value={sec}
            onChange={(e) => setSec(e.target.value)}
            placeholder={
              row?.secret_hint
                ? `${row.secret_hint} — ${t("leave blank to keep", "kosongkan jika tidak diganti")}`
                : ""
            }
          />
        </AdminField>
        <div className="flex gap-2">
          <Button variant="navy" className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
            {t("Validate & save", "Validasi & simpan")}
          </Button>
          {row && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => confirm(t("Remove keys?", "Hapus kunci?")) && clear.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {row?.validated_at && (
          <p className="text-[11px] text-muted-foreground">
            {t("Validated", "Divalidasi")}: {new Date(row.validated_at).toLocaleString("id-ID")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function OmnixSettingsView({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const { data = [] } = useChannelSettings(workspaceId);

  return (
    <div className="space-y-5">
      <Header
        title={t("Channel API Settings", "Pengaturan API Channel")}
        desc={t(
          "Enter the partner keys from each platform's developer/open platform. Secret keys are stored server-side and never shown again. A store can only be connected once its channel keys are validated.",
          "Isi kunci partner dari developer/open platform masing-masing toko online. Secret key disimpan di server dan tidak ditampilkan lagi. Toko hanya bisa dihubungkan jika kunci channel-nya sudah tervalidasi.",
        )}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {OMNIX_CHANNELS.map((channel) => (
          <ChannelKeyCard
            key={channel.id}
            workspaceId={workspaceId}
            channel={channel}
            row={data.find((r) => r.channel === channel.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Pengiriman & pickup --------------------------- */

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    oscillator.frequency.value = ok ? 880 : 220;
    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // Audio tidak wajib — abaikan bila browser menolak.
  }
}

export function OmnixShippingView({ workspaceId }: { workspaceId: string }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: orders = [] } = useAllOrders(workspaceId);
  const [mode, setMode] = useState<"packed" | "picked_up">("packed");
  const [code, setCode] = useState("");
  const [log, setLog] = useState<{ code: string; ok: boolean; msg: string; at: string }[]>([]);
  const [channel, setChannel] = useState("all");
  const [courier, setCourier] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const open = orders.filter((o) => o.status !== "cancelled" && o.status !== "completed");
  const couriers = Array.from(new Set(orders.map((o) => o.courier).filter(Boolean))) as string[];
  const queue = open.filter(
    (o) => (channel === "all" || o.channel === channel) && (courier === "all" || o.courier === courier),
  );
  const count = (status: string) => queue.filter((o) => o.packing_status === status).length;

  const scan = useMutation({
    mutationFn: async (raw: string) => {
      const target = raw.trim();
      const order = orders.find((o) => o.tracking_no === target || o.order_no === target);
      if (!order) throw new Error(t("Not found", "Tidak ditemukan"));
      if (order.status === "cancelled") throw new Error(t("Order cancelled", "Pesanan dibatalkan"));
      if (mode === "packed" && order.packing_status !== "unpacked") throw new Error(t("Already packed", "Sudah dikemas"));
      if (mode === "picked_up" && order.packing_status === "picked_up") {
        throw new Error(t("Already picked up", "Sudah diserahkan"));
      }
      if (mode === "picked_up" && order.packing_status === "unpacked") {
        throw new Error(t("Not packed yet", "Belum dikemas"));
      }

      const patch =
        mode === "packed"
          ? {
              packing_status: "packed",
              packed_at: sqlDateTime(),
              status: order.status === "pending" ? "processing" : order.status,
            }
          : { packing_status: "picked_up", picked_up_at: sqlDateTime(), status: "shipped" };

      await saveWorkspaceRow({ data: { table: "omnix_orders", workspaceId, id: order.id, data: patch } });
      return order;
    },
    onSuccess: (order, scanned) => {
      beep(true);
      setLog((rows) =>
        [
          {
            code: scanned,
            ok: true,
            msg: `${omnixChannelName(order.channel)} · ${order.order_no} → ${packLabel(mode, lang)}`,
            at: new Date().toLocaleTimeString("id-ID"),
          },
          ...rows,
        ].slice(0, 50),
      );
      void qc.invalidateQueries({ queryKey: ["omnix-orders", workspaceId] });
    },
    onError: (error: Error, scanned) => {
      beep(false);
      setLog((rows) =>
        [{ code: scanned, ok: false, msg: error.message, at: new Date().toLocaleTimeString("id-ID") }, ...rows].slice(0, 50),
      );
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (code.trim()) scan.mutate(code.trim());
    setCode("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-5">
      <Header
        title={t("Shipping & Pickup", "Pengiriman & Pickup")}
        desc={t(
          "Scan the waybill/resi barcode with a scanner (or type then Enter). All stores in one queue.",
          "Scan barcode resi dengan scanner (atau ketik lalu Enter). Semua toko dalam satu antrean.",
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {OMNIX_PACK_STATUS.map((status) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{packLabel(status, lang)}</p>
              <p className="text-2xl font-semibold">{count(status)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "packed" ? "navy" : "outline"} onClick={() => setMode("packed")}>
              <PackageCheck /> {t("Scan pack", "Scan kemas")}
            </Button>
            <Button variant={mode === "picked_up" ? "navy" : "outline"} onClick={() => setMode("picked_up")}>
              <Truck /> {t("Scan courier pickup", "Scan serah kurir")}
            </Button>
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gold" />
              <Input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-12 pl-11 font-mono text-lg"
                placeholder={t("Scan resi / order no.", "Scan resi / no. pesanan")}
              />
            </div>
            <Button type="submit" variant="navy" className="h-12">
              OK
            </Button>
          </form>
          {log.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {log.map((row, index) => (
                <div
                  key={index}
                  className={`flex justify-between rounded px-2 py-1 ${
                    row.ok ? "bg-emerald-500/10" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <span className="font-mono">{row.code}</span>
                  <span>{row.msg}</span>
                  <span className="text-muted-foreground">{row.at}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <AdminSelect className="w-44" value={channel} onChange={setChannel}>
          <option value="all">{t("All stores", "Semua toko")}</option>
          {OMNIX_CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect className="w-44" value={courier} onChange={setCourier}>
          <option value="all">{t("All couriers", "Semua kurir")}</option>
          {couriers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </AdminSelect>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>{t("Order No.", "No. Pesanan")}</TableHead>
                <TableHead>{t("Courier", "Kurir")}</TableHead>
                <TableHead>Resi</TableHead>
                <TableHead>{t("Buyer", "Pembeli")}</TableHead>
                <TableHead>{t("Packing", "Kemas")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("Queue empty.", "Antrean kosong.")}
                  </TableCell>
                </TableRow>
              )}
              {queue.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{omnixChannelName(order.channel)}</TableCell>
                  <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                  <TableCell>{order.courier ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{order.tracking_no ?? "—"}</TableCell>
                  <TableCell>{order.buyer_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={order.packing_status === "unpacked" ? "outline" : "secondary"}>
                      {packLabel(order.packing_status, lang)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------- Laporan --------------------------------- */

export function OmnixReportView({ workspaceId }: { workspaceId: string }) {
  const { lang, t } = useT();
  const { data: orders = [] } = useAllOrders(workspaceId);
  const { data: stores = [] } = useQuery({
    queryKey: ["omnix-stores", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "omnix_stores", workspaceId, orderBy: "created_at", orderDir: "asc", limit: 500 },
      });
      return (data?.rows ?? []) as unknown as OmnixStoreRow[];
    },
  });

  const today = sqlDateTime().slice(0, 10);
  const [filters, setFilters] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
    status: "all",
    channel: "all",
    store: "all",
    pack: "all",
    courier: "all",
    q: "",
  });

  const couriers = Array.from(new Set(orders.map((o) => o.courier).filter(Boolean))) as string[];
  const rows = useMemo(
    () =>
      orders.filter((o) => {
        const date = String(o.order_date).slice(0, 10);
        return (
          date >= filters.from &&
          date <= filters.to &&
          (filters.status === "all" || o.status === filters.status) &&
          (filters.channel === "all" || o.channel === filters.channel) &&
          (filters.store === "all" || o.store_id === filters.store) &&
          (filters.pack === "all" || o.packing_status === filters.pack) &&
          (filters.courier === "all" || o.courier === filters.courier) &&
          `${o.order_no} ${o.buyer_name ?? ""} ${o.tracking_no ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())
        );
      }),
    [orders, filters],
  );

  const sum = (key: keyof OmnixOrderRow) => rows.reduce((total, order) => total + Number(order[key] ?? 0), 0);
  const storeName = (id: string | null) => stores.find((store) => store.id === id)?.store_name ?? "—";
  const byStore = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; net: number }>();
    rows.forEach((order) => {
      const key = order.store_id ?? "-";
      const current = map.get(key) ?? { count: 0, gross: 0, net: 0 };
      current.count += 1;
      current.gross += Number(order.gross_amount);
      current.net += Number(order.net_amount);
      map.set(key, current);
    });
    return [...map.entries()];
  }, [rows]);

  const exportCsv = () => {
    const head = [
      "Tanggal",
      "Channel",
      "Toko",
      "No Pesanan",
      "Pembeli",
      "Status",
      "Kemas",
      "Kurir",
      "Resi",
      "Gross",
      "Fee Marketplace",
      "Net",
      "Fee Omnix",
    ];
    const lines = rows.map((order) => [
      String(order.order_date).slice(0, 10),
      omnixChannelName(order.channel),
      storeName(order.store_id),
      order.order_no,
      order.buyer_name ?? "",
      order.status,
      order.packing_status,
      order.courier ?? "",
      order.tracking_no ?? "",
      order.gross_amount,
      order.marketplace_fee,
      order.net_amount,
      order.omnix_fee,
    ]);
    const csv = [head, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    anchor.download = `omnix-report-${filters.from}_${filters.to}.csv`;
    anchor.click();
  };

  const set = (key: keyof typeof filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5">
      <Header
        title={t("Omnix Reports", "Laporan Omnix")}
        action={
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Export CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminField label={t("From", "Dari")}>
            <Input type="date" value={filters.from} onChange={(e) => set("from")(e.target.value)} />
          </AdminField>
          <AdminField label={t("To", "Sampai")}>
            <Input type="date" value={filters.to} onChange={(e) => set("to")(e.target.value)} />
          </AdminField>
          <AdminField label="Status">
            <AdminSelect value={filters.status} onChange={set("status")}>
              <option value="all">{t("All", "Semua")}</option>
              {OMNIX_ORDER_STATUS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t("Packing status", "Status kemas")}>
            <AdminSelect value={filters.pack} onChange={set("pack")}>
              <option value="all">{t("All", "Semua")}</option>
              {OMNIX_PACK_STATUS.map((status) => (
                <option key={status} value={status}>
                  {packLabel(status, lang)}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Channel">
            <AdminSelect value={filters.channel} onChange={set("channel")}>
              <option value="all">{t("All", "Semua")}</option>
              {OMNIX_CHANNELS.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t("Store", "Toko")}>
            <AdminSelect value={filters.store} onChange={set("store")}>
              <option value="all">{t("All", "Semua")}</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.store_name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t("Courier", "Kurir")}>
            <AdminSelect value={filters.courier} onChange={set("courier")}>
              <option value="all">{t("All", "Semua")}</option>
              {couriers.map((courier) => (
                <option key={courier} value={courier}>
                  {courier}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label={t("Search", "Cari")}>
            <Input
              value={filters.q}
              onChange={(e) => set("q")(e.target.value)}
              placeholder={t("Order / buyer / resi", "Pesanan / pembeli / resi")}
            />
          </AdminField>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          [t("Orders", "Pesanan"), rows.length.toLocaleString("id-ID")],
          ["Gross", fmtIDR(sum("gross_amount"))],
          [t("Marketplace fees", "Fee marketplace"), fmtIDR(sum("marketplace_fee"))],
          ["Net", fmtIDR(sum("net_amount"))],
          [t("Omnix fees", "Fee Omnix"), fmtIDR(sum("omnix_fee"))],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Per store", "Per toko")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Store", "Toko")}</TableHead>
                <TableHead className="text-right">{t("Orders", "Pesanan")}</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byStore.map(([id, value]) => (
                <TableRow key={id}>
                  <TableCell>{storeName(id === "-" ? null : id)}</TableCell>
                  <TableCell className="text-right">{value.count}</TableCell>
                  <TableCell className="text-right">{fmtIDR(value.gross)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(value.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>{t("Store", "Toko")}</TableHead>
                <TableHead>{t("Order No.", "No. Pesanan")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{t("Packing", "Kemas")}</TableHead>
                <TableHead>{t("Courier", "Kurir")}</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {t("No data for this filter.", "Tidak ada data untuk filter ini.")}
                  </TableCell>
                </TableRow>
              )}
              {rows.slice(0, 500).map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-xs">{String(order.order_date).slice(0, 10)}</TableCell>
                  <TableCell>
                    {storeName(order.store_id)}{" "}
                    <span className="text-xs text-muted-foreground">({omnixChannelName(order.channel)})</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                  <TableCell>{order.status}</TableCell>
                  <TableCell>{packLabel(order.packing_status, lang)}</TableCell>
                  <TableCell>{order.courier ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(order.gross_amount))}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(order.net_amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
