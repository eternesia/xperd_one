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
import { CheckCircle2, Link2, Loader2, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { PaginationBar, SearchInput, usePagination, useSearchFilter } from "@/components/app/ui-states";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import {
  OMNIX_BUNDLE,
  OMNIX_CHANNELS,
  OMNIX_FEE_PER_ORDER,
  OMNIX_MIN_TOPUP,
  OMNIX_ORDER_STATUS,
  omnixChannelName,
  packLabel,
} from "@/lib/omnix";
import {
  getOmnixWallet,
  listOmnixChannelSettings,
  listOmnixLedger,
  omnixBuyBundle,
  omnixRequestTopup,
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

function useStores(workspaceId: string) {
  return useQuery({
    queryKey: ["omnix-stores", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "omnix_stores", workspaceId, orderBy: "created_at", orderDir: "asc", limit: 500 },
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
        data: { table: "omnix_orders", workspaceId, orderBy: "order_date", orderDir: "desc", limit: 2000 },
      });
      return (data?.rows ?? []) as unknown as OmnixOrder[];
    },
  });
}

/* ------------------------------- Koneksi toko ------------------------------- */

function StoresView({ workspaceId }: { workspaceId: string }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: stores = [] } = useStores(workspaceId);
  const settingsFn = useServerFn(listOmnixChannelSettings);
  const { data: settings = [] } = useQuery({
    queryKey: ["omnix-settings", workspaceId],
    queryFn: async () => settingsFn({ data: { workspaceId } }),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", channel: "shopee", store_name: "", shop_ref: "" });

  const validated = useMemo(
    () => new Set(settings.filter((s) => s.status === "validated").map((s) => s.channel)),
    [settings],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!validated.has(form.channel)) {
        throw new Error(
          t(
            "Channel keys are not validated yet — set them under API Settings first.",
            "Kunci kanal belum tervalidasi — isi dulu di Pengaturan API.",
          ),
        );
      }
      const payload = {
        channel: form.channel,
        store_name: form.store_name.trim(),
        shop_ref: form.shop_ref.trim() || null,
        status: "connected",
        last_sync_at: sqlDateTime(),
      };
      if (form.id) {
        await saveWorkspaceRow({ data: { table: "omnix_stores", workspaceId, id: form.id, data: payload } });
      } else {
        await upsertWorkspaceRows({
          data: { table: "omnix_stores", workspaceId, rows: [{ id: crypto.randomUUID(), ...payload }] },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["omnix-stores", workspaceId] });
      setOpen(false);
      toast.success(t("Store saved", "Toko disimpan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "omnix_stores", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["omnix-stores", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        title={t("Store Connections", "Koneksi Toko")}
        desc={t(
          "Connect each marketplace store. A store can only be added once the channel keys are validated under API Settings.",
          "Hubungkan tiap toko marketplace. Toko hanya bisa ditambahkan setelah kunci kanal tervalidasi di Pengaturan API.",
        )}
        action={
          <Button
            variant="navy"
            onClick={() => {
              setForm({ id: "", channel: "shopee", store_name: "", shop_ref: "" });
              setOpen(true);
            }}
          >
            <Plus /> {t("Add store", "Tambah toko")}
          </Button>
        }
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>{t("Store", "Toko")}</TableHead>
                <TableHead>{t("Shop ref", "Ref toko")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{t("Last sync", "Sinkron terakhir")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <Link2 className="mx-auto mb-2 h-6 w-6 text-gold" />
                    {t("No store connected yet.", "Belum ada toko terhubung.")}
                  </TableCell>
                </TableRow>
              )}
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>{omnixChannelName(store.channel)}</TableCell>
                  <TableCell className="font-medium">{store.store_name}</TableCell>
                  <TableCell className="font-mono text-xs">{store.shop_ref ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={store.status === "connected" ? "secondary" : "outline"}>{store.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {store.last_sync_at ? new Date(store.last_sync_at).toLocaleString("id-ID") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: store.id,
                          channel: store.channel,
                          store_name: store.store_name,
                          shop_ref: store.shop_ref ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(store.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            <DialogTitle>{form.id ? t("Edit store", "Ubah toko") : t("Add store", "Tambah toko")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <AdminField label="Channel">
              <AdminSelect value={form.channel} onChange={(v) => setForm({ ...form, channel: v })}>
                {OMNIX_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {validated.has(c.id) ? " ✓" : ""}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Store name", "Nama toko")}>
              <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
            </AdminField>
            <AdminField label={t("Shop reference", "Ref toko (opsional)")}>
              <Input value={form.shop_ref} onChange={(e) => setForm({ ...form, shop_ref: e.target.value })} />
            </AdminField>
          </div>
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!form.store_name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------- Transaksi -------------------------------- */

function OrdersView({ workspaceId }: { workspaceId: string }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: orders = [] } = useOrders(workspaceId);
  const { data: stores = [] } = useStores(workspaceId);
  const setStatusFn = useServerFn(omnixSetOrderStatus);
  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    channel: "shopee",
    order_no: "",
    buyer_name: "",
    order_date: sqlDateTime().slice(0, 10),
    gross_amount: 0,
    marketplace_fee: 0,
    courier: "",
    tracking_no: "",
  });

  const filtered = useSearchFilter(
    orders.filter((o) => statusFilter === "all" || o.status === statusFilter),
    term,
    (o) => [o.order_no, o.buyer_name, o.tracking_no, o.channel],
  );
  const pager = usePagination(filtered);

  const save = useMutation({
    mutationFn: async () => {
      const gross = Number(form.gross_amount) || 0;
      const marketFee = Number(form.marketplace_fee) || 0;
      const payload = {
        channel: form.channel,
        order_no: form.order_no.trim(),
        buyer_name: form.buyer_name.trim() || null,
        order_date: form.order_date ? `${form.order_date} 00:00:00` : sqlDateTime(),
        gross_amount: gross,
        marketplace_fee: marketFee,
        net_amount: gross - marketFee,
        courier: form.courier.trim() || null,
        tracking_no: form.tracking_no.trim() || null,
        store_id: stores.find((s) => s.channel === form.channel)?.id ?? null,
      };
      if (form.id) {
        await saveWorkspaceRow({ data: { table: "omnix_orders", workspaceId, id: form.id, data: payload } });
      } else {
        await upsertWorkspaceRows({
          data: {
            table: "omnix_orders",
            workspaceId,
            rows: [{ id: crypto.randomUUID(), status: "pending", ...payload }],
          },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["omnix-orders", workspaceId] });
      setOpen(false);
      toast.success(t("Order saved", "Pesanan disimpan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      setStatusFn({ data: { workspaceId, orderId: id, status } }),
    onSuccess: (result, variables) => {
      void qc.invalidateQueries({ queryKey: ["omnix-orders", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["omnix-wallet", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["omnix-ledger", workspaceId] });
      if (variables.status === "completed") {
        toast.success(
          result.fee > 0
            ? t(
                `Completed · Rp${result.fee.toLocaleString("id-ID")} charged — balance Rp${result.balance.toLocaleString("id-ID")}`,
                `Selesai · biaya Rp${result.fee.toLocaleString("id-ID")} dipotong — saldo Rp${result.balance.toLocaleString("id-ID")}`,
              )
            : t("Completed · charged to the bundle quota", "Selesai · memakai kuota paket"),
        );
      } else {
        toast.success(t("Order updated", "Pesanan diperbarui"));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "omnix_orders", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["omnix-orders", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        title={t("Transactions", "Transaksi")}
        desc={t(
          `Manually record marketplace orders. Completing an order charges Rp${OMNIX_FEE_PER_ORDER.toLocaleString("id-ID")} from the Omnix wallet (or uses the active bundle quota).`,
          `Catat pesanan marketplace secara manual. Menyelesaikan pesanan akan memotong Rp${OMNIX_FEE_PER_ORDER.toLocaleString("id-ID")} dari saldo Omnix (atau memakai kuota paket aktif).`,
        )}
        action={
          <Button
            variant="navy"
            onClick={() => {
              setForm({
                id: "",
                channel: "shopee",
                order_no: "",
                buyer_name: "",
                order_date: sqlDateTime().slice(0, 10),
                gross_amount: 0,
                marketplace_fee: 0,
                courier: "",
                tracking_no: "",
              });
              setOpen(true);
            }}
          >
            <Plus /> {t("New order", "Pesanan baru")}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={t("Search order / buyer / resi…", "Cari pesanan / pembeli / resi…")}
        />
        <AdminSelect className="w-40" value={statusFilter} onChange={setStatusFilter}>
          <option value="all">{t("All statuses", "Semua status")}</option>
          {OMNIX_ORDER_STATUS.map((status) => (
            <option key={status} value={status}>
              {status}
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
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    {t("No orders yet.", "Belum ada pesanan.")}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-xs">{String(order.order_date).slice(0, 10)}</TableCell>
                  <TableCell>{omnixChannelName(order.channel)}</TableCell>
                  <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                  <TableCell>{order.buyer_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(order.gross_amount))}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(order.net_amount))}</TableCell>
                  <TableCell>
                    {order.fee_charged || order.status === "cancelled" ? (
                      <Badge variant={order.status === "completed" ? "secondary" : "outline"}>
                        {order.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {order.status}
                      </Badge>
                    ) : (
                      <AdminSelect
                        className="h-8 w-32 text-xs"
                        value={order.status}
                        onChange={(value) => setStatus.mutate({ id: order.id, status: value })}
                      >
                        {OMNIX_ORDER_STATUS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </AdminSelect>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{order.fee_charged ? fmtIDR(Number(order.omnix_fee)) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: order.id,
                          channel: order.channel,
                          order_no: order.order_no,
                          buyer_name: order.buyer_name ?? "",
                          order_date: String(order.order_date).slice(0, 10),
                          gross_amount: Number(order.gross_amount),
                          marketplace_fee: Number(order.marketplace_fee),
                          courier: order.courier ?? "",
                          tracking_no: order.tracking_no ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={Boolean(order.fee_charged)}
                      title={
                        order.fee_charged
                          ? t("Already charged — cannot delete", "Sudah tertagih — tidak bisa dihapus")
                          : t("Delete", "Hapus")
                      }
                      onClick={() => remove.mutate(order.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? t("Edit order", "Ubah pesanan") : t("Add order", "Tambah pesanan")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Channel">
              <AdminSelect value={form.channel} onChange={(v) => setForm({ ...form, channel: v })}>
                {OMNIX_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
            <AdminField label={t("Date", "Tanggal")}>
              <Input
                type="date"
                value={form.order_date}
                onChange={(e) => setForm({ ...form, order_date: e.target.value })}
              />
            </AdminField>
            <AdminField label="Gross">
              <Input
                data-testid="omnix-order-gross"
                type="number"
                value={form.gross_amount}
                onChange={(e) => setForm({ ...form, gross_amount: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label={t("Marketplace fee", "Fee marketplace")}>
              <Input
                data-testid="omnix-order-fee"
                type="number"
                value={form.marketplace_fee}
                onChange={(e) => setForm({ ...form, marketplace_fee: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label={t("Courier", "Kurir")}>
              <Input value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })} />
            </AdminField>
            <AdminField label="Resi">
              <Input value={form.tracking_no} onChange={(e) => setForm({ ...form, tracking_no: e.target.value })} />
            </AdminField>
          </div>
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!form.order_no.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
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
  const { lang, t } = useT();
  const qc = useQueryClient();
  const walletFn = useServerFn(getOmnixWallet);
  const ledgerFn = useServerFn(listOmnixLedger);
  const topupFn = useServerFn(omnixRequestTopup);
  const bundleFn = useServerFn(omnixBuyBundle);
  const [amount, setAmount] = useState(String(OMNIX_MIN_TOPUP));
  const [note, setNote] = useState("Transfer manual");

  const { data: wallet } = useQuery<OmnixWalletView | null>({
    queryKey: ["omnix-wallet", workspaceId],
    queryFn: async () => walletFn({ data: { workspaceId } }),
  });
  const { data: ledger = [] } = useQuery<OmnixLedgerRow[]>({
    queryKey: ["omnix-ledger", workspaceId],
    queryFn: async () => ledgerFn({ data: { workspaceId, limit: 100 } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["omnix-wallet", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["omnix-ledger", workspaceId] });
  };

  const topup = useMutation({
    mutationFn: async () => topupFn({ data: { workspaceId, amount: Number(amount), note } }),
    onSuccess: () => {
      refresh();
      toast.success(t("Top up requested — waiting for Super Admin", "Top up diajukan — menunggu Super Admin"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bundle = useMutation({
    mutationFn: async () => bundleFn({ data: { workspaceId } }),
    onSuccess: () => {
      refresh();
      toast.success(t("Bundle activated", "Paket diaktifkan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endsAt = wallet?.bundle_ends_at ? new Date(wallet.bundle_ends_at) : null;
  const bundleActive = Boolean(endsAt && endsAt.getTime() > Date.now() && Number(wallet?.bundle_used) < Number(wallet?.bundle_quota));
  const remaining = Math.max(0, Number(wallet?.bundle_quota ?? 0) - Number(wallet?.bundle_used ?? 0));

  return (
    <div className="space-y-5">
      <Header
        title={t("Balance & Billing", "Saldo & Tagihan")}
        desc={t(
          `Omnix charges Rp${OMNIX_FEE_PER_ORDER.toLocaleString("id-ID")} per completed order. The monthly bundle (Rp${OMNIX_BUNDLE.price.toLocaleString("id-ID")}) covers ${OMNIX_BUNDLE.quota.toLocaleString("id-ID")} orders for ${OMNIX_BUNDLE.days} days.`,
          `Omnix menagih Rp${OMNIX_FEE_PER_ORDER.toLocaleString("id-ID")} per pesanan selesai. Paket bulanan (Rp${OMNIX_BUNDLE.price.toLocaleString("id-ID")}) mencakup ${OMNIX_BUNDLE.quota.toLocaleString("id-ID")} pesanan selama ${OMNIX_BUNDLE.days} hari.`,
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Balance", "Saldo")}</p>
            <p
              data-testid="omnix-balance"
              className="mt-1 text-2xl font-semibold text-navy dark:text-primary-foreground"
            >
              {fmtIDR(Number(wallet?.balance ?? 0))}
            </p>
          </CardContent>
        </Card>
        <Card className={bundleActive ? "border-emerald-500/50" : ""}>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Package", "Paket")}</p>
            <p className="mt-1 text-lg font-semibold">{bundleActive ? t("Active", "Aktif") : t("Not active", "Tidak aktif")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {bundleActive && endsAt
                ? `${remaining.toLocaleString("id-ID")} ${t("orders left", "pesanan tersisa")} · ${endsAt.toLocaleDateString("id-ID")}`
                : `${t("Quota", "Kuota")} ${Number(wallet?.bundle_quota ?? 0).toLocaleString("id-ID")}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Charged orders", "Pesanan tertagih")}</p>
            <p className="mt-1 text-2xl font-semibold">
              {ledger.filter((row) => row.kind === "charge").length.toLocaleString("id-ID")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-gold" /> {t("Request top up", "Ajukan top up")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AdminField label={t("Amount (Rp)", "Nominal (Rp)")}>
              <Input
                data-testid="omnix-topup-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </AdminField>
            <AdminField label={t("Note", "Catatan")}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </AdminField>
            <div className="flex flex-wrap gap-1">
              {[50000, 100000, 350000, 1000000].map((v) => (
                <Button key={v} size="sm" variant="outline" onClick={() => setAmount(String(v))}>
                  {fmtIDR(v)}
                </Button>
              ))}
            </div>
            <Button variant="navy" disabled={topup.isPending} onClick={() => topup.mutate()}>
              {topup.isPending && <Loader2 className="animate-spin" />} {t("Top up", "Top up")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t(
                `Minimum Rp${OMNIX_MIN_TOPUP.toLocaleString("id-ID")}. Super Admin verifies the transfer before the balance increases.`,
                `Minimal Rp${OMNIX_MIN_TOPUP.toLocaleString("id-ID")}. Super Admin memverifikasi transfer sebelum saldo bertambah.`,
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-gold" /> {t("Monthly bundle", "Paket bulanan")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t(
                `${OMNIX_BUNDLE.quota.toLocaleString("id-ID")} orders for Rp${OMNIX_BUNDLE.price.toLocaleString("id-ID")}, valid ${OMNIX_BUNDLE.days} days. Cheaper than ${Math.round(OMNIX_BUNDLE.price / OMNIX_BUNDLE.quota / 25 * 100) / 100}x the per-order fee.`,
                `${OMNIX_BUNDLE.quota.toLocaleString("id-ID")} pesanan seharga Rp${OMNIX_BUNDLE.price.toLocaleString("id-ID")}, berlaku ${OMNIX_BUNDLE.days} hari. Lebih murah dari tarif per pesanan.`,
              )}
            </p>
            <Button
              variant={bundleActive ? "outline" : "navy"}
              disabled={bundle.isPending}
              onClick={() => bundle.mutate()}
            >
              {bundle.isPending && <Loader2 className="animate-spin" />}
              {bundleActive ? t("Extend after expiry", "Perpanjang setelah habis") : t("Buy from balance", "Beli dari saldo")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Wallet history", "Riwayat saldo")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>{t("Type", "Jenis")}</TableHead>
                <TableHead>{t("Note", "Catatan")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
                <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("No wallet activity yet.", "Belum ada aktivitas saldo.")}
                  </TableCell>
                </TableRow>
              )}
              {ledger.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{new Date(row.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell className="capitalize">{row.kind}</TableCell>
                  <TableCell className="text-xs">{row.note ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "posted" ? "secondary" : "outline"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right ${Number(row.amount) < 0 ? "text-destructive" : ""}`}
                  >
                    {fmtIDR(Number(row.amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.balance_after === null ? "—" : fmtIDR(Number(row.balance_after))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {lang === "id"
          ? "Biaya Omnix dipotong di level aplikasi saat pesanan diselesaikan (tanpa trigger database)."
          : "Omnix fees are charged at application level when an order is completed (no database triggers)."}
      </p>
    </div>
  );
}

/* ------------------------------- dasbor ------------------------------- */

/** Ringkasan saldo Omnix (dipakai dasbor; parity BS New 10). */
function WalletStrip({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const walletFn = useServerFn(getOmnixWallet);
  const { data: wallet } = useQuery<OmnixWalletView | null>({
    queryKey: ["omnix-wallet", workspaceId],
    queryFn: async () => walletFn({ data: { workspaceId } }),
  });
  const endsAt = wallet?.bundle_ends_at ? new Date(wallet.bundle_ends_at) : null;
  const active = Boolean(
    endsAt && endsAt.getTime() > Date.now() && Number(wallet?.bundle_used) < Number(wallet?.bundle_quota),
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
        {t("Balance", "Saldo")}: <b data-testid="omnix-balance">{fmtIDR(Number(wallet?.balance ?? 0))}</b>
      </span>
      {active ? (
        <Badge variant="secondary">
          {t("Bundle", "Paket")}: {Number(wallet?.bundle_used ?? 0).toLocaleString("id-ID")}/
          {Number(wallet?.bundle_quota ?? 0).toLocaleString("id-ID")}
        </Badge>
      ) : (
        <span className="text-muted-foreground">
          {t(`Pay per transaction Rp${OMNIX_FEE_PER_ORDER}`, `Bayar per transaksi Rp${OMNIX_FEE_PER_ORDER}`)}
        </span>
      )}
      {low && (
        <span className="font-medium text-destructive">{t("Low balance — top up now", "Saldo menipis — segera top up")}</span>
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
              <p className="mt-1 text-xl font-semibold text-navy dark:text-primary-foreground">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Sales per channel", "Penjualan per channel")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(stats.byCh).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("No completed orders yet.", "Belum ada pesanan selesai.")}</p>
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
                <div className="h-2 rounded bg-gold" style={{ width: `${(v.gross / maxG) * 100}%` }} />
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

export function OmnixView({ submoduleId, workspaceId }: { submoduleId: string; workspaceId: string }) {
  const { lang } = useI18n();
  if (submoduleId === "dashboard" || submoduleId === "") return <OmnixDashboard workspaceId={workspaceId} />;
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
