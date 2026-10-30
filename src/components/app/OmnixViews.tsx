/**
 * #63 (BS New 3): modul Omnix — Koneksi Toko, Transaksi, Saldo & Tagihan.
 *
 * Catatan porting ke Old:
 * - Supabase (tabel + `rpc`) → server fn MySQL. Perubahan status pesanan lewat
 *   `omnixSetOrderStatus` karena biaya Omnix ditagihkan **di level aplikasi**
 *   dalam satu transaksi (bukan trigger database).
 * - Store & order memakai lapisan data generik (`listWorkspaceRows`,
 *   `saveWorkspaceRow`, `deleteWorkspaceRow`); wallet/ledger/kunci kanal lewat
 *   server fn karena bersifat per tenant atau memuat rahasia.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Package, Plus, RefreshCw, Store, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { WalletPanel } from "@/components/app/WalletPanel";
import {
  PaginationBar,
  SearchInput,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import {
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
  upsertWorkspaceRows,
} from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import {
  OMNIX_BUNDLE,
  OMNIX_CHANNELS,
  OMNIX_FEE_PER_ORDER,
  OMNIX_ORDER_STATUS,
  omnixChannelName,
  packLabel,
} from "@/lib/omnix";
import {
  getOmnixWallet,
  listOmnixChannelSettings,
  listOmnixLedger,
  omnixBuyBundle,
  omnixSetOrderStatus,
  type OmnixLedgerRow,
  type OmnixWalletView,
} from "@/lib/omnix.functions";
import { OmnixReportView, OmnixSettingsView, OmnixShippingView } from "@/components/app/OmnixOps";

interface OmnixStore {
  id: string;
  channel: string;
  store_name: string;
  shop_ref: string | null;
  status: string;
  last_sync_at: string | null;
}
interface OmnixOrder {
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
  fee_charged: boolean;
  courier: string | null;
  tracking_no: string | null;
  packing_status: string;
}

const STATUS_TONE: Record<string, "secondary" | "outline" | "destructive" | "default"> = {
  pending: "outline",
  processing: "secondary",
  shipped: "secondary",
  completed: "default",
  cancelled: "destructive",
};

function useT() {
  const { lang } = useI18n();
  return { lang, t: (en: string, id: string) => (lang === "id" ? id : en) };
}

function Header({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
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

function useStores(workspaceId: string) {
  return useQuery({
    queryKey: ["omnix-stores", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "omnix_stores",
          workspaceId,
          orderBy: "created_at",
          orderDir: "asc",
          limit: 500,
        },
      });
      return (data?.rows ?? []) as unknown as OmnixStore[];
    },
  });
}

function useOrders(workspaceId: string) {
  return useQuery({
    queryKey: ["omnix-orders", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "omnix_orders",
          workspaceId,
          orderBy: "order_date",
          orderDir: "desc",
          limit: 2000,
        },
      });
      return (data?.rows ?? []) as unknown as OmnixOrder[];
    },
  });
}

/* ------------------------------- Koneksi toko ------------------------------- */
// Padanan New 11 (xperd-new.lovable.app): kartu toko, tanpa ubah — hanya tambah & hapus.

function StoresView({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: stores = [] } = useStores(workspaceId);
  const settingsFn = useServerFn(listOmnixChannelSettings);
  const { data: keys = [] } = useQuery({
    queryKey: ["omnix-settings", workspaceId],
    queryFn: async () => settingsFn({ data: { workspaceId } }),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ channel: "shopee", store_name: "", shop_ref: "" });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.store_name.trim())
        throw new Error(t("Store name is required", "Nama toko wajib diisi"));
      const cfg = keys.find((k) => k.channel === form.channel);
      if (cfg?.status !== "validated")
        throw new Error(
          t(
            "Set & validate this channel's API keys in Settings first",
            "Isi & validasi kunci API channel ini di menu Pengaturan terlebih dulu",
          ),
        );
      await saveWorkspaceRow({
        data: {
          table: "omnix_stores",
          workspaceId,
          data: { ...form, status: "connected", last_sync_at: sqlDateTime() },
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Store added", "Toko ditambahkan"));
      setOpen(false);
      setForm({ channel: "shopee", store_name: "", shop_ref: "" });
      void qc.invalidateQueries({ queryKey: ["omnix-stores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "omnix_stores", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["omnix-stores"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-5">
      <Header
        title={t("Store Connections", "Koneksi Toko")}
        desc={t(
          "Register each store. Live login to marketplaces requires official partner API approval per channel; until then orders can be entered or imported manually.",
          "Daftarkan setiap toko. Login langsung ke marketplace membutuhkan persetujuan API partner resmi per channel; sampai saat itu pesanan dapat diinput atau diimpor manual.",
        )}
        action={
          <Button variant="navy" onClick={() => setOpen(true)}>
            <Plus /> {t("Add store", "Tambah toko")}
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stores.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("No stores yet.", "Belum ada toko.")}</p>
        )}
        {stores.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/20 text-gold-foreground">
                  <Store className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{s.store_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {omnixChannelName(s.channel)}
                    {s.shop_ref ? ` · ${s.shop_ref}` : ""}
                  </p>
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {s.status === "connected"
                      ? t("Connected", "Terhubung")
                      : t("Awaiting API", "Menunggu API")}
                  </Badge>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("Delete store", "Hapus toko")}
                onClick={() => confirm(t("Delete store?", "Hapus toko?")) && del.mutate(s.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Add store", "Tambah toko")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <AdminField label="Channel">
              <AdminSelect value={form.channel} onChange={(v) => setForm({ ...form, channel: v })}>
                {OMNIX_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Store name", "Nama toko")}>
              <Input
                data-testid="omnix-store-name"
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Shop ID / username", "Shop ID / username")}>
              <Input
                data-testid="omnix-store-ref"
                value={form.shop_ref}
                onChange={(e) => setForm({ ...form, shop_ref: e.target.value })}
              />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------- Pesanan ---------------------------------- */

function OrdersView({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: orders = [] } = useOrders(workspaceId);
  const { data: stores = [] } = useStores(workspaceId);
  const setStatusFn = useServerFn(omnixSetOrderStatus);
  const [q, setQ] = useState("");
  const [fs, setFs] = useState("all");
  const [open, setOpen] = useState(false);
  const empty = {
    store_id: "",
    order_no: "",
    buyer_name: "",
    item: "",
    qty: "1",
    gross: "",
    fee: "",
    courier: "",
    tracking_no: "",
  };
  const [form, setForm] = useState(empty);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["omnix-orders"] });
    void qc.invalidateQueries({ queryKey: ["omnix-wallet"] });
    void qc.invalidateQueries({ queryKey: ["omnix-ledger"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const store = stores.find((s) => s.id === form.store_id);
      if (!store) throw new Error(t("Pick a store", "Pilih toko"));
      if (!form.order_no.trim())
        throw new Error(t("Order number is required", "No. pesanan wajib diisi"));
      const gross = Number(form.gross) || 0;
      const fee = Number(form.fee) || 0;
      await saveWorkspaceRow({
        data: {
          table: "omnix_orders",
          workspaceId,
          data: {
            store_id: store.id,
            channel: store.channel,
            order_no: form.order_no.trim(),
            buyer_name: form.buyer_name || null,
            items: JSON.stringify([{ name: form.item, qty: Number(form.qty) || 1 }]),
            gross_amount: gross,
            marketplace_fee: fee,
            net_amount: gross - fee,
            status: "pending",
            courier: form.courier || null,
            tracking_no: form.tracking_no.trim() || null,
            order_date: sqlDateTime(),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Order added", "Pesanan ditambahkan"));
      setOpen(false);
      setForm(empty);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      setStatusFn({ data: { workspaceId, orderId: id, status } }),
    onSuccess: (_d, v) => {
      if (v.status === "completed")
        toast.success(
          t("Completed — fee charged from balance", "Selesai — biaya dipotong dari saldo"),
        );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = orders.filter(
    (o) =>
      (fs === "all" || o.status === fs) &&
      `${o.order_no} ${o.buyer_name ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <Header
        title={t("Transactions", "Transaksi")}
        desc={t(
          "Orders from every channel. Each order marked Completed deducts Rp25 (or 1 bundle quota) automatically.",
          "Pesanan dari semua channel. Setiap pesanan berstatus Selesai otomatis memotong Rp25 (atau 1 kuota paket).",
        )}
        action={
          <Button variant="navy" onClick={() => setOpen(true)} disabled={!stores.length}>
            <Plus /> {t("New order", "Pesanan baru")}
          </Button>
        }
      />
      <WalletStrip workspaceId={workspaceId} />
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder={t("Search order / buyer", "Cari pesanan / pembeli")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <AdminSelect value={fs} onChange={setFs} className="w-44">
          <option value="all">{t("All status", "Semua status")}</option>
          {OMNIX_ORDER_STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </AdminSelect>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>{t("Order No.", "No. Pesanan")}</TableHead>
                <TableHead>{t("Buyer", "Pembeli")}</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Omnix fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    {t("No orders.", "Belum ada pesanan.")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(`${String(o.order_date).replace(" ", "T")}Z`).toLocaleDateString(
                      "id-ID",
                    )}
                  </TableCell>
                  <TableCell>{omnixChannelName(o.channel)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.order_no}</TableCell>
                  <TableCell>{o.buyer_name}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(o.gross_amount))}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(o.net_amount))}</TableCell>
                  <TableCell>
                    {o.fee_charged || o.status === "cancelled" ? (
                      <Badge variant={o.status === "completed" ? "secondary" : "outline"}>
                        {o.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {o.status}
                      </Badge>
                    ) : (
                      <AdminSelect
                        value={o.status}
                        onChange={(v) => setStatus.mutate({ id: o.id, status: v })}
                        className="h-8 w-36"
                      >
                        {OMNIX_ORDER_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </AdminSelect>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.fee_charged ? fmtIDR(Number(o.omnix_fee)) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("New order", "Pesanan baru")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label={t("Store", "Toko")}>
              <AdminSelect
                value={form.store_id}
                onChange={(v) => setForm({ ...form, store_id: v })}
              >
                <option value="">—</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name} ({omnixChannelName(s.channel)})
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Order No.", "No. Pesanan")}>
              <Input
                data-testid="omnix-order-no"
                value={form.order_no}
                onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Buyer", "Pembeli")}>
              <Input
                data-testid="omnix-order-buyer"
                value={form.buyer_name}
                onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Item", "Produk")}>
              <Input
                value={form.item}
                onChange={(e) => setForm({ ...form, item: e.target.value })}
              />
            </AdminField>
            <AdminField label="Qty">
              <Input
                type="number"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Gross amount", "Total kotor")}>
              <Input
                data-testid="omnix-order-gross"
                type="number"
                value={form.gross}
                onChange={(e) => setForm({ ...form, gross: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Marketplace fee", "Potongan marketplace")}>
              <Input
                data-testid="omnix-order-fee"
                type="number"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Courier", "Kurir")}>
              <Input
                value={form.courier}
                onChange={(e) => setForm({ ...form, courier: e.target.value })}
                placeholder="J&T, SPX, JNE…"
              />
            </AdminField>
            <AdminField label={t("Waybill / resi", "No. resi")}>
              <Input
                value={form.tracking_no}
                onChange={(e) => setForm({ ...form, tracking_no: e.target.value })}
              />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------- Saldo & Tagihan ----------------------------- */

function WalletView({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const walletFn = useServerFn(getOmnixWallet);
  const ledgerFn = useServerFn(listOmnixLedger);
  const bundleFn = useServerFn(omnixBuyBundle);
  const { data: wallet } = useQuery<OmnixWalletView | null>({
    queryKey: ["omnix-wallet", workspaceId],
    queryFn: async () => walletFn({ data: { workspaceId } }),
  });
  const { data: ledger = [] } = useQuery<OmnixLedgerRow[]>({
    queryKey: ["omnix-ledger", workspaceId],
    queryFn: async () => ledgerFn({ data: { workspaceId, limit: 100 } }),
  });
  const tenantId = wallet?.tenant_id;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["omnix-wallet"] });
    void qc.invalidateQueries({ queryKey: ["omnix-ledger"] });
    void qc.invalidateQueries({ queryKey: ["wallet"] });
  };
  const bundle = useMutation({
    mutationFn: async () => bundleFn({ data: { workspaceId } }),
    onSuccess: () => {
      toast.success(t("Bundle activated", "Paket bulanan aktif"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const endsAt = wallet?.bundle_ends_at ? new Date(wallet.bundle_ends_at) : null;
  const active = Boolean(
    endsAt &&
    endsAt.getTime() > Date.now() &&
    Number(wallet?.bundle_used) < Number(wallet?.bundle_quota),
  );
  return (
    <div className="space-y-5">
      <Header
        title={t("Balance & Billing", "Saldo & Tagihan")}
        desc={t(
          "Deposit balance; every completed transaction is deducted automatically.",
          "Deposit saldo; setiap transaksi selesai dipotong otomatis.",
        )}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-xs text-muted-foreground">
              {t("Current balance", "Saldo saat ini")}
            </p>
            <p
              data-testid="omnix-balance"
              className="text-3xl font-semibold text-navy dark:text-primary-foreground"
            >
              {fmtIDR(Number(wallet?.balance ?? 0))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 font-semibold">
              <RefreshCw className="h-4 w-4 text-gold" />{" "}
              {t("Pay as you go", "Bayar per transaksi")}
            </p>
            <p className="text-2xl font-semibold">
              Rp25{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {t("completed transaction", "transaksi selesai")}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("Default. No monthly fee.", "Default. Tanpa biaya bulanan.")}
            </p>
          </CardContent>
        </Card>
        <Card className={active ? "border-gold" : ""}>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-gold" /> {t("Monthly bundle", "Paket bulanan")}
            </p>
            <p className="text-2xl font-semibold">
              {fmtIDR(OMNIX_BUNDLE.price)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / 20.000 {t("trx", "trx")} / 30 {t("days", "hari")}
              </span>
            </p>
            {active ? (
              <p className="text-sm">
                {t("Active until", "Aktif s.d.")} {endsAt?.toLocaleDateString("id-ID")} ·{" "}
                {t("used", "terpakai")} {Number(wallet?.bundle_used ?? 0).toLocaleString("id-ID")}/
                {Number(wallet?.bundle_quota ?? 0).toLocaleString("id-ID")}
              </p>
            ) : (
              <Button
                variant="gold"
                onClick={() => bundle.mutate()}
                disabled={bundle.isPending || !tenantId}
              >
                {t("Buy from balance", "Beli dari saldo")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                "After quota runs out, Rp25/trx applies again.",
                "Setelah kuota habis, kembali Rp25/trx.",
              )}
            </p>
          </CardContent>
        </Card>
      </div>
      {tenantId && <WalletPanel tenantId={tenantId} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("Legacy Omnix history", "Riwayat lama Omnix")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>{t("Type", "Jenis")}</TableHead>
                <TableHead>{t("Note", "Keterangan")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t("Amount", "Nominal")}</TableHead>
                <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
              )}
              {ledger.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell>{l.kind}</TableCell>
                  <TableCell>{l.note}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "posted" ? "secondary" : "outline"}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right ${Number(l.amount) < 0 ? "text-destructive" : ""}`}
                  >
                    {fmtIDR(Number(l.amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.balance_after != null ? fmtIDR(Number(l.balance_after)) : "-"}
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

function WalletStrip({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const walletFn = useServerFn(getOmnixWallet);
  const { data: wallet } = useQuery<OmnixWalletView | null>({
    queryKey: ["omnix-wallet", workspaceId],
    queryFn: async () => walletFn({ data: { workspaceId } }),
  });
  const endsAt = wallet?.bundle_ends_at ? new Date(wallet.bundle_ends_at) : null;
  const active = Boolean(
    endsAt &&
    endsAt.getTime() > Date.now() &&
    Number(wallet?.bundle_used) < Number(wallet?.bundle_quota),
  );
  const low = !active && Number(wallet?.balance ?? 0) < OMNIX_FEE_PER_ORDER * 100;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${
        low ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <Wallet className="h-4 w-4 text-gold" />
      <span>
        {t("Balance", "Saldo")}:{" "}
        <b data-testid="omnix-balance">{fmtIDR(Number(wallet?.balance ?? 0))}</b>
      </span>
      {active ? (
        <Badge variant="secondary">
          {t("Bundle", "Paket")}: {Number(wallet?.bundle_used ?? 0).toLocaleString("id-ID")}/
          {Number(wallet?.bundle_quota ?? 0).toLocaleString("id-ID")}
        </Badge>
      ) : (
        <span className="text-muted-foreground">
          {t(
            `Pay per transaction Rp${OMNIX_FEE_PER_ORDER}`,
            `Bayar per transaksi Rp${OMNIX_FEE_PER_ORDER}`,
          )}
        </span>
      )}
      {low && (
        <span className="font-medium text-destructive">
          {t("Low balance — top up now", "Saldo menipis — segera top up")}
        </span>
      )}
    </div>
  );
}

/**
 * Dasbor Omni-channel (parity BS New 10): toko terhubung, pesanan berjalan &
 * selesai, penjualan kotor, bersih setelah fee, penjualan per channel, dan
 * total biaya Omnix yang sudah terpotong.
 */
export function OmnixDashboard({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const { data: orders = [] } = useOrders(workspaceId);
  const { data: stores = [] } = useStores(workspaceId);
  const stats = useMemo(() => {
    const done = orders.filter((o) => o.status === "completed");
    const byCh: Record<string, { n: number; gross: number }> = {};
    done.forEach((o) => {
      byCh[o.channel] ??= { n: 0, gross: 0 };
      byCh[o.channel].n++;
      byCh[o.channel].gross += Number(o.gross_amount);
    });
    return {
      gross: done.reduce((s, o) => s + Number(o.gross_amount), 0),
      net: done.reduce((s, o) => s + Number(o.net_amount), 0),
      fee: done.reduce((s, o) => s + Number(o.omnix_fee), 0),
      done: done.length,
      open: orders.filter((o) => ["pending", "processing", "shipped"].includes(o.status)).length,
      byCh,
    };
  }, [orders]);
  const maxG = Math.max(1, ...Object.values(stats.byCh).map((v) => v.gross));
  return (
    <div className="space-y-5">
      <Header
        title={t("Omni-channel Dashboard", "Dasbor Omni-channel")}
        desc={t(
          "All your marketplace and food-delivery stores in one place.",
          "Semua toko marketplace dan food delivery dalam satu dasbor.",
        )}
      />
      <WalletStrip workspaceId={workspaceId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            [t("Connected stores", "Toko terhubung"), String(stores.length)],
            [t("Open orders", "Pesanan berjalan"), String(stats.open)],
            [t("Completed orders", "Pesanan selesai"), String(stats.done)],
            [t("Gross sales", "Penjualan kotor"), fmtIDR(stats.gross)],
            [t("Net after fees", "Bersih setelah fee"), fmtIDR(stats.net)],
          ] as const
        ).map(([l, v]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 text-xl font-semibold text-navy dark:text-primary-foreground">
                {v}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("Sales per channel", "Penjualan per channel")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(stats.byCh).length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("No completed orders yet.", "Belum ada pesanan selesai.")}
            </p>
          )}
          {Object.entries(stats.byCh).map(([ch, v]) => (
            <div key={ch} className="text-sm">
              <div className="flex justify-between">
                <span>
                  {omnixChannelName(ch)} · {v.n}
                </span>
                <span>{fmtIDR(v.gross)}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-gold"
                  style={{ width: `${(v.gross / maxG) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            {t("Omnix fees charged", "Biaya Omnix terpotong")}: {fmtIDR(stats.fee)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- dispatcher -------------------------------- */

export function OmnixView({
  submoduleId,
  workspaceId,
}: {
  submoduleId: string;
  workspaceId: string;
}) {
  const { lang } = useI18n();
  if (submoduleId === "dashboard" || submoduleId === "")
    return <OmnixDashboard workspaceId={workspaceId} />;
  if (submoduleId === "stores") return <StoresView workspaceId={workspaceId} />;
  if (submoduleId === "orders") return <OrdersView workspaceId={workspaceId} />;
  if (submoduleId === "shipping") return <OmnixShippingView workspaceId={workspaceId} />;
  if (submoduleId === "reports") return <OmnixReportView workspaceId={workspaceId} />;
  if (submoduleId === "wallet") return <WalletView workspaceId={workspaceId} />;
  if (submoduleId === "settings") return <OmnixSettingsView workspaceId={workspaceId} />;
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      {lang === "id" ? "Submodul Omnix tidak ditemukan." : "Omnix submodule not found."}
    </div>
  );
}
