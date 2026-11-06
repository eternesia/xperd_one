import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ItemPicker } from "@/components/app/ItemPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteWorkspaceRow, listWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import {
  buildBalances,
  insertMovements,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  type InvEntity,
  type InvMovement,
  type InvMovementType,
} from "@/lib/inventory";
import { formatMoney } from "@/lib/procurement";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];
const ALL = "__all__";

function useWarehouses(workspaceId: string) {
  return useQuery({
    queryKey: ["inv-warehouses", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "md_warehouses", workspaceId, orderBy: "code", orderDir: "asc", limit: 100, filters: { is_active: 1 } },
      });
      return (data?.rows ?? []) as { code: string; name: string }[];
    },
  });
}

function useMovements(workspaceId: string, filters: { from: string; to: string; type?: InvMovementType }) {
  return useQuery({
    queryKey: ["inv-movements", workspaceId, filters.from, filters.to, filters.type ?? "all"],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "inv_movements",
          workspaceId,
          orderBy: "movement_date",
          orderDir: "desc",
          limit: 2000,
          filters: filters.type ? { movement_type: filters.type } : undefined,
          ranges: { movement_date: { gte: filters.from || undefined, lte: filters.to || undefined } },
        },
      });
      return (data?.rows ?? []) as unknown as InvMovement[];
    },
  });
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

function Header({ title, kicker, action }: { title: string; kicker: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{kicker.toUpperCase()}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function Pager({
  page,
  setPage,
  pageSize,
  setPageSize,
  total,
}: {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{t("Rows", "Baris")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span>{t(`${total} records`, `${total} data`)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-muted-foreground">{page} / {pages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- balances -------------------------------- */

export function StockBalanceView({ entity, workspaceId }: { entity: InvEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const valuation = entity.kind === "valuation";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouse, setWarehouse] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: warehouses = [] } = useWarehouses(workspaceId);
  const { data: movements = [], isLoading } = useMovements(workspaceId, { from, to });

  const rows = useMemo(() => {
    const scoped = movements.filter((m) => warehouse === ALL || m.warehouse_code === warehouse);
    const balances = buildBalances(scoped, warehouse === ALL);
    const s = search.trim().toLowerCase();
    return s
      ? balances.filter((b) => b.item_code.toLowerCase().includes(s) || (b.item_name ?? "").toLowerCase().includes(s))
      : balances;
  }, [movements, warehouse, search]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Inventory", "Persediaan")}
        title={lang === "id" ? entity.id_ : entity.en}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label={t("Items tracked", "Item terpantau")} value={String(rows.length)} />
        <Card label={t("Total quantity", "Total kuantitas")} value={totalQty.toLocaleString(lang === "id" ? "id-ID" : "en-US")} />
        <Card label={t("Inventory value", "Nilai persediaan")} value={formatMoney(totalValue, lang)} />
      </div>

      <Toolbar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("Search item…", "Cari item…")}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("Warehouse", "Gudang")}</Label>
          <Select value={warehouse} onValueChange={(v) => { setWarehouse(v); setPage(1); }}>
            <SelectTrigger className="mt-1 h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("All warehouses", "Semua gudang")}</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.code} value={w.code}>{w.code} · {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("From", "Dari")}</Label>
          <Input type="date" className="mt-1 h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("To", "Sampai")}</Label>
          <Input type="date" className="mt-1 h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to || warehouse !== ALL || search) && (
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setWarehouse(ALL); setSearch(""); }}>
            {t("Reset", "Atur ulang")}
          </Button>
        )}
      </Toolbar>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Item", "Item")}</TableHead>
              {warehouse === ALL && <TableHead>{t("Warehouse", "Gudang")}</TableHead>}
              <TableHead className="text-right">{t("In", "Masuk")}</TableHead>
              <TableHead className="text-right">{t("Out", "Keluar")}</TableHead>
              <TableHead className="text-right">{t("On hand", "Sisa stok")}</TableHead>
              {valuation && <TableHead className="text-right">{t("Avg cost", "HPP rata-rata")}</TableHead>}
              <TableHead className="text-right">{t("Value", "Nilai")}</TableHead>
              <TableHead>{t("Last movement", "Mutasi terakhir")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell></TableRow>
            )}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                {t("No stock movement yet.", "Belum ada mutasi stok.")}
              </TableCell></TableRow>
            )}
            {paged.map((b, i) => (
              <TableRow key={`${b.item_code}-${b.warehouse_code}`}>
                <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium text-navy dark:text-primary-foreground">{b.item_name || b.item_code}</p>
                  <p className="text-xs text-muted-foreground">{b.item_code} · {b.uom_code ?? "—"}</p>
                </TableCell>
                {warehouse === ALL && <TableCell>{b.warehouse_code ?? "—"}</TableCell>}
                <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{b.qtyIn}</TableCell>
                <TableCell className="text-right text-rose-600 dark:text-rose-400">{b.qtyOut}</TableCell>
                <TableCell className={cn("text-right font-semibold", b.qty < 0 && "text-destructive")}>{b.qty}</TableCell>
                {valuation && <TableCell className="text-right">{formatMoney(b.avgCost, lang)}</TableCell>}
                <TableCell className="text-right">{formatMoney(b.value, lang)}</TableCell>
                <TableCell className="text-muted-foreground">{b.lastDate ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={rows.length} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-navy dark:text-primary-foreground">{value}</p>
    </div>
  );
}

/* -------------------------------- ledger --------------------------------- */

interface FormLine {
  item_code: string;
  item_name: string;
  uom_code: string;
  qty: string;
  unit_cost: string;
}

const emptyLine = (): FormLine => ({ item_code: "", item_name: "", uom_code: "", qty: "1", unit_cost: "0" });

export function StockMovementView({ entity, workspaceId }: { entity: InvEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouse, setWarehouse] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [srcWarehouse, setSrcWarehouse] = useState("");
  const [dstWarehouse, setDstWarehouse] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const { data: warehouses = [] } = useWarehouses(workspaceId);
  const { data: movements = [], isLoading } = useMovements(workspaceId, {
    from,
    to,
    type: entity.movementType,
  });
  const { data: allMovements = [] } = useMovements(workspaceId, { from: "", to: "" });

  const onHand = (itemCode: string, wh: string) =>
    allMovements
      .filter((m) => m.item_code === itemCode && (!wh || m.warehouse_code === wh))
      .reduce((s, m) => s + Number(m.qty), 0);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (warehouse !== ALL && m.warehouse_code !== warehouse && m.counterpart_warehouse_code !== warehouse) return false;
      if (!s) return true;
      return [m.item_code, m.item_name, m.ref_number, m.notes].some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [movements, warehouse, search]);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const reset = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setSrcWarehouse("");
    setDstWarehouse("");
    setReference("");
    setNotes("");
    setLines([emptyLine()]);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (entity.needsCounterpart && (!srcWarehouse || !dstWarehouse || srcWarehouse === dstWarehouse)) {
        throw new Error(t("Pick two different warehouses.", "Pilih dua gudang yang berbeda."));
      }
      const usable = lines.filter((l) => l.item_code && Number(l.qty));
      if (!usable.length) throw new Error(t("Add at least one item.", "Tambahkan minimal satu item."));

      const payload = usable.flatMap((l) => {
        const qtyInput = Number(l.qty) || 0;
        const cost = Number(l.unit_cost) || 0;
        const base = {
          movement_date: date,
          item_code: l.item_code,
          item_name: l.item_name || null,
          uom_code: l.uom_code || null,
          unit_cost: cost,
          ref_type: entity.submoduleId,
          ref_number: reference || null,
          notes: notes || null,
        };
        if (entity.isOpname) {
          const diff = qtyInput - onHand(l.item_code, srcWarehouse);
          return [{ ...base, movement_type: "adjustment" as InvMovementType, warehouse_code: srcWarehouse || null, qty: diff }];
        }
        if (entity.needsCounterpart) {
          return [
            {
              ...base,
              movement_type: "transfer" as InvMovementType,
              warehouse_code: srcWarehouse,
              counterpart_warehouse_code: dstWarehouse,
              qty: -Math.abs(qtyInput),
            },
            {
              ...base,
              movement_type: "transfer" as InvMovementType,
              warehouse_code: dstWarehouse,
              counterpart_warehouse_code: srcWarehouse,
              qty: Math.abs(qtyInput),
            },
          ];
        }
        return [
          {
            ...base,
            movement_type: entity.movementType as InvMovementType,
            warehouse_code: srcWarehouse || null,
            qty: (entity.direction ?? 1) * Math.abs(qtyInput),
          },
        ];
      });

      await insertMovements(workspaceId, payload);
    },
    onSuccess: () => {
      toast.success(t("Stock movement recorded", "Mutasi stok tercatat"));
      setOpen(false);
      reset();
      void qc.invalidateQueries({ queryKey: ["inv-movements"] });
      void qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "inv_movements", workspaceId, id } });
    },
    onSuccess: () => {
      toast.success(t("Deleted", "Terhapus"));
      void qc.invalidateQueries({ queryKey: ["inv-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Inventory", "Persediaan")}
        title={lang === "id" ? entity.id_ : entity.en}
        action={
          <Button variant="navy" onClick={() => setOpen(true)}>
            <Plus /> {t("Create New", "Buat Baru")}
          </Button>
        }
      />

      <Toolbar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("Search item or reference…", "Cari item atau referensi…")}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("Warehouse", "Gudang")}</Label>
          <Select value={warehouse} onValueChange={(v) => { setWarehouse(v); setPage(1); }}>
            <SelectTrigger className="mt-1 h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("All warehouses", "Semua gudang")}</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.code} value={w.code}>{w.code} · {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("From", "Dari")}</Label>
          <Input type="date" className="mt-1 h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("To", "Sampai")}</Label>
          <Input type="date" className="mt-1 h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to || warehouse !== ALL || search) && (
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setWarehouse(ALL); setSearch(""); }}>
            {t("Reset", "Atur ulang")}
          </Button>
        )}
      </Toolbar>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Item", "Item")}</TableHead>
              <TableHead>{t("Warehouse", "Gudang")}</TableHead>
              <TableHead>{t("Type", "Jenis")}</TableHead>
              <TableHead className="text-right">{t("Qty", "Qty")}</TableHead>
              <TableHead className="text-right">{t("Value", "Nilai")}</TableHead>
              <TableHead>{t("Reference", "Referensi")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell></TableRow>
            )}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                {t("No records yet.", "Belum ada data.")}
              </TableCell></TableRow>
            )}
            {paged.map((m, i) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell>{m.movement_date}</TableCell>
                <TableCell>
                  <p className="font-medium text-navy dark:text-primary-foreground">{m.item_name || m.item_code}</p>
                  <p className="text-xs text-muted-foreground">{m.item_code}</p>
                </TableCell>
                <TableCell>
                  {m.warehouse_code ?? "—"}
                  {m.counterpart_warehouse_code && (
                    <span className="text-xs text-muted-foreground"> → {m.counterpart_warehouse_code}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("border-0", MOVEMENT_TONE[m.movement_type])}>
                    {lang === "id" ? MOVEMENT_LABEL[m.movement_type].id_ : MOVEMENT_LABEL[m.movement_type].en}
                  </Badge>
                </TableCell>
                <TableCell className={cn("text-right font-medium", Number(m.qty) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {Number(m.qty) > 0 ? "+" : ""}{Number(m.qty)}
                </TableCell>
                <TableCell className="text-right">{formatMoney(Math.abs(Number(m.value)), lang)}</TableCell>
                <TableCell className="text-muted-foreground">{m.ref_number ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={rows.length} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{lang === "id" ? entity.id_ : entity.en}</DialogTitle>
            <DialogDescription>
              {entity.isOpname
                ? t("Enter the counted quantity — the difference is posted as an adjustment.", "Masukkan hasil hitung fisik — selisihnya dicatat sebagai penyesuaian.")
                : t("Record a stock movement for this workspace.", "Catat mutasi stok untuk workspace ini.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("Date", "Tanggal")}</Label>
              <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>{entity.needsCounterpart ? t("From warehouse", "Gudang asal") : t("Warehouse", "Gudang")}</Label>
              <Select value={srcWarehouse} onValueChange={setSrcWarehouse}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("Select warehouse", "Pilih gudang")} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.code} value={w.code}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {entity.needsCounterpart && (
              <div>
                <Label>{t("To warehouse", "Gudang tujuan")}</Label>
                <Select value={dstWarehouse} onValueChange={setDstWarehouse}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t("Select warehouse", "Pilih gudang")} /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.code} value={w.code}>{w.code} · {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t("Reference", "Referensi")}</Label>
              <Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="mt-2 space-y-3">
            <p className="text-sm font-semibold text-navy dark:text-primary-foreground">{t("Lines", "Rincian")}</p>
            {lines.map((l, idx) => (
              <div key={idx} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_7rem_8rem_2rem]">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Item", "Item")}</Label>
                  <ItemPicker
                    workspaceId={workspaceId}
                    value={l.item_code}
                    onPick={(item) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                item_code: item.code,
                                item_name: item.name,
                                uom_code: item.uom_code ?? "",
                                unit_cost: String(item.cost_price ?? 0),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  {entity.isOpname && l.item_code && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("System stock", "Stok sistem")}: {onHand(l.item_code, srcWarehouse)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {entity.isOpname ? t("Counted", "Hasil hitung") : t("Qty", "Qty")}
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9"
                    value={l.qty}
                    onChange={(e) => setLines((p) => p.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Unit cost", "Harga pokok")}</Label>
                  <Input
                    type="number"
                    className="mt-1 h-9"
                    value={l.unit_cost}
                    disabled={entity.movementType === "out"}
                    title={
                      entity.movementType === "out"
                        ? t("Uses moving-average cost", "Memakai harga rata-rata bergerak")
                        : undefined
                    }
                    onChange={(e) => setLines((p) => p.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r)))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-6 h-9 w-9"
                  onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
              <Plus /> {t("Add line", "Tambah baris")}
            </Button>
          </div>

          <div>
            <Label>{t("Notes", "Catatan")}</Label>
            <Textarea className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Batal")}</Button>
            <Button variant="navy" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InventoryView({ entity, workspaceId }: { entity: InvEntity; workspaceId: string }) {
  if (entity.kind === "ledger") return <StockMovementView entity={entity} workspaceId={workspaceId} />;
  return <StockBalanceView entity={entity} workspaceId={workspaceId} />;
}
