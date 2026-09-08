import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countWorkspaceRows, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { postSalesMovements } from "@/lib/inventory";
import { postArInvoiceJournal, postDeliveryJournal, postReceiptJournal } from "@/lib/journal";
import { formatMoney as fmtMoney, nextDocNumber } from "@/lib/procurement";
import type { PrcStatus } from "@/lib/procurement";
import type { SlsDocType } from "@/lib/sales";
import { cn } from "@/lib/utils";

interface PosItem {
  code: string;
  name: string;
  uom_code: string | null;
  sell_price: number;
  cost_price: number;
}

interface CartLine extends PosItem {
  qty: number;
  discount: number;
}

export function PosRegister({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const formatMoney = (v: number) => fmtMoney(v, lang);

  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [taxRate, setTaxRate] = useState("11");
  const [customerCode, setCustomerCode] = useState("walk-in");
  const [warehouse, setWarehouse] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pos-items", workspaceId, term],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "md_items",
          workspaceId,
          search: term.trim() || undefined,
          filters: { is_active: 1 },
          orderBy: "name",
          orderDir: "asc",
          limit: 48,
        },
      });
      return (data?.rows ?? []) as unknown as PosItem[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "md_customers", workspaceId, filters: { is_active: 1 }, orderBy: "name", orderDir: "asc", limit: 100 },
      });
      return (data?.rows ?? []) as unknown as { code: string; name: string }[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["pos-warehouses", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "md_warehouses", workspaceId, filters: { is_active: 1 }, orderBy: "code", orderDir: "asc", limit: 100 },
      });
      return (data?.rows ?? []) as unknown as { code: string; name: string }[];
    },
  });

  const addItem = (it: PosItem) =>
    setCart((c) => {
      const found = c.find((l) => l.code === it.code);
      if (found) return c.map((l) => (l.code === it.code ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { ...it, qty: 1, discount: 0 }];
    });

  const setQty = (code: string, qty: number) =>
    setCart((c) => c.flatMap((l) => (l.code !== code ? [l] : qty <= 0 ? [] : [{ ...l, qty }])));

  const totals = useMemo(() => {
    const rate = Number(taxRate) || 0;
    let gross = 0;
    let discount = 0;
    cart.forEach((l) => {
      gross += l.qty * Number(l.sell_price || 0);
      discount += Number(l.discount || 0);
    });
    const net = gross - discount;
    const tax = (net * rate) / 100;
    return { gross, discount, net, tax, total: net + tax };
  }, [cart, taxRate]);

  const change = Math.max(0, (Number(paid) || 0) - totals.total);

  const customerName =
    customerCode === "walk-in"
      ? t("Walk-in customer", "Pelanggan umum")
      : (customers.find((c) => c.code === customerCode)?.name ?? customerCode);

  const checkout = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error(t("Cart is empty.", "Keranjang masih kosong."));
      if ((Number(paid) || 0) + 0.0001 < totals.total)
        throw new Error(t("Payment is less than the total.", "Pembayaran kurang dari total."));

      const rate = Number(taxRate) || 0;
      const today = new Date().toISOString().slice(0, 10);
      const code = customerCode === "walk-in" ? null : customerCode;

      const seqFor = async (docType: SlsDocType) => {
        const data = await countWorkspaceRows({
          data: { table: "sls_documents", workspaceId, filters: { doc_type: docType } },
        });
        return (data?.count ?? 0) + 1;
      };

      const createDoc = async (
        docType: SlsDocType,
        prefix: string,
        status: PrcStatus,
        source?: { id: string; doc_number: string },
      ) => {
        const doc_number = nextDocNumber(prefix, await seqFor(docType));
        const created = await saveWorkspaceRow({
          data: {
            table: "sls_documents",
            workspaceId,
            data: {
              doc_type: docType,
              doc_number,
              doc_date: today,
              due_date: docType === "ar_invoice" ? today : null,
              customer_code: code,
              customer_name: customerName,
              warehouse_code: docType === "delivery_order" ? warehouse || null : null,
              reference: source?.doc_number ?? `POS ${method}`,
              status,
              subtotal: totals.gross,
              discount_amount: totals.discount,
              tax_amount: totals.tax,
              total: totals.total,
              notes: `POS · ${method}`,
              source_document_id: source?.id ?? null,
              source_doc_number: source?.doc_number ?? null,
            },
          },
        });
        const id = created.id;

        const payload = cart.map((l, i) => {
          const grossLine = l.qty * Number(l.sell_price || 0);
          const netLine = grossLine - Number(l.discount || 0);
          return {
            document_id: id,
            workspace_id: workspaceId,
            line_no: i + 1,
            item_code: l.code,
            description: l.name,
            qty: l.qty,
            uom_code: l.uom_code,
            unit_price: Number(l.sell_price || 0),
            discount: Number(l.discount || 0),
            tax_rate: rate,
            line_total: netLine + (netLine * rate) / 100,
            qty_fulfilled: l.qty,
          };
        });
        await upsertWorkspaceRows({ data: { table: "sls_document_lines", workspaceId, rows: payload } });

        return { id, doc_number, doc_date: today, doc_type: docType };
      };

      const movementLines = cart.map((l) => ({
        item_code: l.code,
        description: l.name,
        uom_code: l.uom_code,
        qty: l.qty,
        unit_price: Number(l.cost_price || 0),
      }));

      // 1. Delivery order — stock out + COGS journal
      const doDoc = await createDoc("delivery_order", "DO", "closed");
      await postSalesMovements(
        workspaceId,
        { ...doDoc, doc_type: "delivery_order", warehouse_code: warehouse || null, customer_name: customerName },
        movementLines,
      );
      await postDeliveryJournal(
        workspaceId,
        { ...doDoc, customer_name: customerName },
        cart.map((l) => ({ item_code: l.code, qty: l.qty })),
      );

      // 2. AR invoice from the delivery order
      const arDoc = await createDoc("ar_invoice", "ARI", "paid", doDoc);
      await postArInvoiceJournal(workspaceId, {
        ...arDoc,
        customer_name: customerName,
        subtotal: totals.gross,
        discount_amount: totals.discount,
        tax_amount: totals.tax,
        total: totals.total,
      });

      // 3. Receipt from the invoice
      const rcpDoc = await createDoc("sales_receipt", "RCP", "paid", arDoc);
      await postReceiptJournal(workspaceId, { ...rcpDoc, customer_name: customerName, total: totals.total });

      return { doDoc, arDoc, rcpDoc };
    },
    onSuccess: (res) => {
      toast.success(
        t(
          `Checkout complete · ${res.doDoc.doc_number} · ${res.arDoc.doc_number} · ${res.rcpDoc.doc_number}`,
          `Transaksi selesai · ${res.doDoc.doc_number} · ${res.arDoc.doc_number} · ${res.rcpDoc.doc_number}`,
        ),
      );
      setCart([]);
      setPaid("");
      qc.invalidateQueries({ queryKey: ["sls"] });
      qc.invalidateQueries({ queryKey: ["inv"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{t("SALES & POS", "PENJUALAN & POS")}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
          {t("POS Register", "Kasir POS")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Fast checkout — automatically creates a delivery order, AR invoice and receipt.",
            "Checkout cepat — otomatis membuat surat jalan, faktur piutang, dan penerimaan pembayaran.",
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* catalogue */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pl-9"
              placeholder={t("Search item, code or barcode…", "Cari item, kode, atau barcode…")}
            />
          </div>

          {isLoading ? (
            <div className="grid place-items-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {t("No item found.", "Item tidak ditemukan.")}
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  onClick={() => addItem(it)}
                  className="group rounded-xl border border-border bg-background p-3 text-left transition hover:border-gold hover:shadow-md"
                >
                  <p className="line-clamp-2 text-sm font-medium text-navy dark:text-primary-foreground">{it.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {it.code} · {it.uom_code ?? "—"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gold">{formatMoney(Number(it.sell_price))}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* cart */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-navy dark:text-primary-foreground">
              <ShoppingCart className="h-4 w-4 text-gold" /> {t("Cart", "Keranjang")}
            </div>
            <Badge variant="secondary">{cart.length}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("Customer", "Pelanggan")}</Label>
              <Select value={customerCode} onValueChange={setCustomerCode}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">{t("Walk-in customer", "Pelanggan umum")}</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Warehouse", "Gudang")}</Label>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("Select", "Pilih")} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.code} value={w.code}>
                      {w.code} — {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn("space-y-2", cart.length > 5 && "max-h-72 overflow-y-auto pr-1")}>
            {cart.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                {t("Tap an item to add it.", "Klik item untuk menambahkan.")}
              </p>
            ) : (
              cart.map((l) => (
                <div key={l.code} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{formatMoney(Number(l.sell_price))}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setQty(l.code, 0)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.code, l.qty - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      value={l.qty}
                      onChange={(e) => setQty(l.code, Number(e.target.value) || 0)}
                      className="h-7 w-16 text-center"
                    />
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.code, l.qty + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      value={l.discount}
                      onChange={(e) =>
                        setCart((c) =>
                          c.map((x) => (x.code === l.code ? { ...x, discount: Number(e.target.value) || 0 } : x)),
                        )
                      }
                      className="h-7 w-24"
                      placeholder={t("Disc", "Disk")}
                    />
                    <span className="ml-auto text-sm font-semibold">
                      {formatMoney(l.qty * Number(l.sell_price) - Number(l.discount || 0))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            <Row label={t("Subtotal", "Subtotal")} value={formatMoney(totals.gross)} />
            <Row label={t("Discount", "Diskon")} value={`- ${formatMoney(totals.discount)}`} />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                {t("VAT", "PPN")}
                <Input
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="h-7 w-16"
                  inputMode="decimal"
                />
                %
              </span>
              <span>{formatMoney(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-navy dark:text-primary-foreground">
              <span>{t("Total", "Total")}</span>
              <span>{formatMoney(totals.total)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("Payment method", "Metode bayar")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("Cash", "Tunai")}</SelectItem>
                  <SelectItem value="transfer">{t("Transfer", "Transfer")}</SelectItem>
                  <SelectItem value="card">{t("Card", "Kartu")}</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Amount paid", "Uang diterima")}</Label>
              <Input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" className="h-9" />
            </div>
          </div>

          <Row label={t("Change", "Kembalian")} value={formatMoney(change)} />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCart([])} disabled={!cart.length}>
              {t("Clear", "Kosongkan")}
            </Button>
            <Button
              variant="navy"
              className="flex-[2]"
              disabled={!cart.length || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
              {t("Checkout", "Bayar")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}