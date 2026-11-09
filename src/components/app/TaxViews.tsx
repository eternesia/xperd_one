import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { deleteWorkspaceRow, saveWorkspaceRow } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { formatMoney as fmtMoney } from "@/lib/procurement";
import {
  buildPeriodSummary,
  computeTax,
  fetchTaxRecords,
  importTaxFromDocuments,
  nextTaxNumber,
  saveTaxRecord,
  TAX_STATUS_LABEL,
  TAX_STATUS_TONE,
  TAX_TYPE_LABEL,
  toCsv,
  VAT_RATE,
  WITHHOLDING_RATES,
  type TaxEntity,
  type TaxRecord,
  type TaxStatus,
  type TaxType,
} from "@/lib/tax";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];

function today() {
  return new Date().toISOString().slice(0, 10);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold text-navy dark:text-primary-foreground",
          highlight && "text-gold dark:text-gold",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function TaxView({ entity, workspaceId }: { entity: TaxEntity; workspaceId: string }) {
  if (entity.kind === "efaktur") return <EFakturView workspaceId={workspaceId} />;
  return <TaxLedgerView key={entity.submoduleId} entity={entity} workspaceId={workspaceId} />;
}

/* ---------------------------------- ledger ---------------------------------- */

function TaxLedgerView({ entity, workspaceId }: { entity: TaxEntity; workspaceId: string }) {
  const type = (entity.taxType ?? "vat_in") as TaxType;
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);

  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tax_no: "",
    tax_date: today(),
    partner_name: "",
    partner_tax_id: "",
    doc_number: "",
    faktur_number: "",
    description: "",
    base_amount: "0",
    rate: String(type === "withholding" ? 2 : VAT_RATE),
    status: "draft" as TaxStatus,
    notes: "",
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["tax", workspaceId, type, from, to],
    queryFn: () => fetchTaxRecords(workspaceId, { type, from: from || undefined, to: to || undefined }),
  });

  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return records;
    return records.filter((r) =>
      [r.tax_no, r.partner_name, r.doc_number, r.faktur_number, r.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [records, term]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const totalBase = filtered.reduce((s, r) => s + Number(r.base_amount || 0), 0);
  const totalTax = filtered.reduce((s, r) => s + Number(r.tax_amount || 0), 0);

  const save = useMutation({
    mutationFn: () =>
      saveTaxRecord(
        workspaceId,
        {
          tax_no: form.tax_no || nextTaxNumber(type, records.length + 1),
          tax_type: type,
          tax_date: form.tax_date,
          partner_name: form.partner_name,
          partner_tax_id: form.partner_tax_id,
          doc_number: form.doc_number,
          faktur_number: form.faktur_number,
          description: form.description,
          base_amount: Number(form.base_amount) || 0,
          rate: Number(form.rate) || 0,
          status: form.status,
          notes: form.notes,
        },
        editId,
      ),
    onSuccess: () => {
      toast.success(t("Tax record saved.", "Data pajak tersimpan."));
      setOpen(false);
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["tax", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pull = useMutation({
    mutationFn: () => importTaxFromDocuments(workspaceId, type),
    onSuccess: (n) => {
      toast.success(
        n ? t(`${n} record(s) imported.`, `${n} data diimpor.`) : t("Nothing new to import.", "Tidak ada data baru."),
      );
      qc.invalidateQueries({ queryKey: ["tax", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "tax_records", workspaceId, id } });
    },
    onSuccess: () => {
      toast.success(t("Record removed.", "Data dihapus."));
      qc.invalidateQueries({ queryKey: ["tax", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaxStatus }) => {
      await saveWorkspaceRow({ data: { table: "tax_records", workspaceId, id, data: { status } } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: TaxRecord) => {
    setEditId(r.id);
    setForm({
      tax_no: r.tax_no,
      tax_date: r.tax_date,
      partner_name: r.partner_name ?? "",
      partner_tax_id: r.partner_tax_id ?? "",
      doc_number: r.doc_number ?? "",
      faktur_number: r.faktur_number ?? "",
      description: r.description ?? "",
      base_amount: String(r.base_amount ?? 0),
      rate: String(r.rate ?? VAT_RATE),
      status: r.status,
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const title = lang === "id" ? entity.id_ : entity.en;

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Tax", "Perpajakan")}
        title={title}
        action={
          <div className="flex items-center gap-2">
            {type !== "withholding" && (
              <Button variant="outline" onClick={() => pull.mutate()} disabled={pull.isPending}>
                {pull.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw />}{" "}
                {t("Pull from invoices", "Tarik dari faktur")}
              </Button>
            )}
            <Button
              variant="navy"
              onClick={() => {
                setEditId(null);
                setForm({
                  tax_no: nextTaxNumber(type, records.length + 1),
                  tax_date: today(),
                  partner_name: "",
                  partner_tax_id: "",
                  doc_number: "",
                  faktur_number: "",
                  description: "",
                  base_amount: "0",
                  rate: String(type === "withholding" ? 2 : VAT_RATE),
                  status: "draft",
                  notes: "",
                });
                setOpen(true);
              }}
            >
              <Plus /> {t("Create New", "Buat Baru")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Records", "Jumlah data")} value={String(filtered.length)} />
        <StatCard label={t("Tax base", "Dasar pengenaan")} value={money(totalBase)} />
        <StatCard label={lang === "id" ? TAX_TYPE_LABEL[type].id_ : TAX_TYPE_LABEL[type].en} value={money(totalTax)} highlight />
      </div>

      <div className="q-filters flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder={t("Search…", "Cari…")}
          />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <Button variant="outline" onClick={() => downloadCsv(`${type}.csv`, toCsv(filtered))}>
          <Download /> {t("Export", "Ekspor")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Number", "Nomor")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Partner", "Mitra")}</TableHead>
              <TableHead>{t("Document", "Dokumen")}</TableHead>
              <TableHead className="text-right">{t("Base", "DPP")}</TableHead>
              <TableHead className="text-right">{t("Rate", "Tarif")}</TableHead>
              <TableHead className="text-right">{t("Tax", "Pajak")}</TableHead>
              <TableHead>{t("Status", "Status")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No tax record yet.", "Belum ada data pajak.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{(current - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.tax_no}</TableCell>
                  <TableCell>{r.tax_date}</TableCell>
                  <TableCell>
                    <p>{r.partner_name ?? "—"}</p>
                    {r.partner_tax_id && <p className="text-xs text-muted-foreground">{r.partner_tax_id}</p>}
                  </TableCell>
                  <TableCell>
                    <p>{r.doc_number ?? "—"}</p>
                    {r.faktur_number && <p className="text-xs text-muted-foreground">{r.faktur_number}</p>}
                  </TableCell>
                  <TableCell className="text-right">{money(Number(r.base_amount))}</TableCell>
                  <TableCell className="text-right">{Number(r.rate)}%</TableCell>
                  <TableCell className="text-right font-semibold">{money(Number(r.tax_amount))}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(v) => setStatus.mutate({ id: r.id, status: v as TaxStatus })}
                    >
                      <SelectTrigger className={cn("h-8 w-32 border-0 text-xs", TAX_STATUS_TONE[r.status])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["draft", "reported", "paid"] as TaxStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {lang === "id" ? TAX_STATUS_LABEL[s].id_ : TAX_STATUS_LABEL[s].en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {filtered.length} {t("records", "data")}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            {t("Prev", "Sebelumnya")}
          </Button>
          <span>
            {current}/{totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
            {t("Next", "Berikutnya")}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? t("Edit tax record", "Ubah data pajak") : `${t("New", "Baru")} · ${title}`}</DialogTitle>
            <DialogDescription>
              {t("Tax amount is calculated from base × rate.", "Nilai pajak dihitung dari DPP × tarif.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("Number", "Nomor")}>
              <Input value={form.tax_no} onChange={(e) => setForm({ ...form, tax_no: e.target.value })} />
            </Field>
            <Field label={t("Date", "Tanggal")}>
              <Input type="date" value={form.tax_date} onChange={(e) => setForm({ ...form, tax_date: e.target.value })} />
            </Field>
            <Field label={t("Partner", "Mitra")}>
              <Input value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} />
            </Field>
            <Field label={t("Tax ID (NPWP)", "NPWP")}>
              <Input
                value={form.partner_tax_id}
                onChange={(e) => setForm({ ...form, partner_tax_id: e.target.value })}
              />
            </Field>
            <Field label={t("Document number", "Nomor dokumen")}>
              <Input value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} />
            </Field>
            <Field label={type === "withholding" ? t("Bupot number", "Nomor bupot") : t("Faktur number", "Nomor faktur")}>
              <Input value={form.faktur_number} onChange={(e) => setForm({ ...form, faktur_number: e.target.value })} />
            </Field>
            <Field label={t("Tax base (DPP)", "Dasar pengenaan (DPP)")}>
              <Input
                type="number"
                value={form.base_amount}
                onChange={(e) => setForm({ ...form, base_amount: e.target.value })}
              />
            </Field>
            {type === "withholding" ? (
              <Field label={t("Scheme", "Jenis PPh")}>
                <Select value={form.rate} onValueChange={(v) => setForm({ ...form, rate: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WITHHOLDING_RATES.map((w) => (
                      <SelectItem key={w.code} value={String(w.rate)}>
                        {w.label} · {w.rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label={t("Rate (%)", "Tarif (%)")}>
                <Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </Field>
            )}
            <Field label={t("Status", "Status")}>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaxStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["draft", "reported", "paid"] as TaxStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {lang === "id" ? TAX_STATUS_LABEL[s].id_ : TAX_STATUS_LABEL[s].en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Tax amount", "Nilai pajak")}>
              <Input value={money(computeTax(Number(form.base_amount), Number(form.rate)))} readOnly />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("Description", "Keterangan")}>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------- efaktur --------------------------------- */

function EFakturView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["tax", workspaceId, "all"],
    queryFn: () => fetchTaxRecords(workspaceId),
  });

  const summary = useMemo(() => buildPeriodSummary(records), [records]);
  const totalPayable = summary.reduce((s, r) => s + r.payable, 0);

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Tax", "Perpajakan")}
        title={t("e-Faktur & e-Bupot", "e-Faktur & e-Bupot")}
        action={
          <Button variant="navy" onClick={() => downloadCsv("efaktur.csv", toCsv(records))}>
            <Download /> {t("Export CSV", "Ekspor CSV")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Periods", "Periode")} value={String(summary.length)} />
        <StatCard label={t("Records", "Data pajak")} value={String(records.length)} />
        <StatCard label={t("Net VAT payable", "PPN kurang bayar")} value={money(totalPayable)} highlight />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Period", "Periode")}</TableHead>
              <TableHead className="text-right">{t("Input VAT", "PPN Masukan")}</TableHead>
              <TableHead className="text-right">{t("Output VAT", "PPN Keluaran")}</TableHead>
              <TableHead className="text-right">{t("Withholding", "PPh")}</TableHead>
              <TableHead className="text-right">{t("Payable / (refund)", "Kurang / (lebih) bayar")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : summary.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No tax data yet.", "Belum ada data pajak.")}
                </TableCell>
              </TableRow>
            ) : (
              summary.map((r, i) => (
                <TableRow key={r.period}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell className="text-right">{money(r.vatIn)}</TableCell>
                  <TableCell className="text-right">{money(r.vatOut)}</TableCell>
                  <TableCell className="text-right">{money(r.withholding)}</TableCell>
                  <TableCell
                    className={cn("text-right font-semibold", r.payable >= 0 ? "text-rose-600" : "text-emerald-600")}
                  >
                    {money(r.payable)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}