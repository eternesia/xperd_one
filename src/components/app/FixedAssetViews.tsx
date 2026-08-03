import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fetchAccounts } from "@/lib/accounting";
import { fetchCbAccounts } from "@/lib/cashbank";
import {
  bookValue,
  disposeAsset,
  FA_DEFAULTS,
  FA_METHOD_LABEL,
  FA_STATUS_LABEL,
  FA_STATUS_TONE,
  fetchAssets,
  fetchDepreciations,
  monthlyCharge,
  nextAssetCode,
  runDepreciation,
  type FaAsset,
  type FaEntity,
  type FaMethod,
} from "@/lib/fixedasset";
import { formatMoney as fmtMoney } from "@/lib/procurement";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];
const NONE = "__none__";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
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

export function FixedAssetView({ entity, workspaceId }: { entity: FaEntity; workspaceId: string }) {
  if (entity.submoduleId === "depreciation") return <DepreciationView workspaceId={workspaceId} />;
  if (entity.submoduleId === "disposal") return <DisposalView workspaceId={workspaceId} />;
  return <AssetRegisterView workspaceId={workspaceId} />;
}

/* --------------------------------- register --------------------------------- */

const emptyAsset = {
  code: "",
  name: "",
  category: "",
  acquisition_date: today(),
  acquisition_cost: "0",
  salvage_value: "0",
  useful_life_months: "60",
  method: "straight_line" as FaMethod,
  asset_account_code: "",
  accum_account_code: "",
  expense_account_code: "",
  location: "",
  notes: "",
};

function AssetRegisterView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);

  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAsset);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["fa-assets", workspaceId],
    queryFn: () => fetchAssets(workspaceId),
  });
  const { data: glAccounts = [] } = useQuery({
    queryKey: ["fa-gl", workspaceId],
    queryFn: () => fetchAccounts(workspaceId),
  });

  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!s) return true;
      return [a.code, a.name, a.category, a.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [assets, term, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const totalCost = filtered.reduce((s, a) => s + Number(a.acquisition_cost || 0), 0);
  const totalAccum = filtered.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error(t("Asset name is required.", "Nama aset wajib diisi."));
      const payload = {
        workspace_id: workspaceId,
        code: form.code.trim() || nextAssetCode(assets.length + 1),
        name: form.name.trim(),
        category: form.category || null,
        acquisition_date: form.acquisition_date,
        acquisition_cost: Number(form.acquisition_cost) || 0,
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_months: Number(form.useful_life_months) || 60,
        method: form.method,
        asset_account_code: form.asset_account_code || FA_DEFAULTS.asset.code,
        accum_account_code: form.accum_account_code || FA_DEFAULTS.accum.code,
        expense_account_code: form.expense_account_code || FA_DEFAULTS.expense.code,
        location: form.location || null,
        notes: form.notes || null,
      };
      if (editId) {
        const { error } = await supabase.from("fa_assets").update(payload as never).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fa_assets").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("Asset saved.", "Aset tersimpan."));
      setOpen(false);
      setEditId(null);
      setForm(emptyAsset);
      qc.invalidateQueries({ queryKey: ["fa-assets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fa_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Asset removed.", "Aset dihapus."));
      qc.invalidateQueries({ queryKey: ["fa-assets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (a: FaAsset) => {
    setEditId(a.id);
    setForm({
      code: a.code,
      name: a.name,
      category: a.category ?? "",
      acquisition_date: a.acquisition_date,
      acquisition_cost: String(a.acquisition_cost ?? 0),
      salvage_value: String(a.salvage_value ?? 0),
      useful_life_months: String(a.useful_life_months ?? 60),
      method: a.method,
      asset_account_code: a.asset_account_code ?? "",
      accum_account_code: a.accum_account_code ?? "",
      expense_account_code: a.expense_account_code ?? "",
      location: a.location ?? "",
      notes: a.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Fixed Assets", "Aset Tetap")}
        title={t("Asset Register", "Daftar Aset")}
        action={
          <Button
            variant="navy"
            onClick={() => {
              setEditId(null);
              setForm({ ...emptyAsset, code: nextAssetCode(assets.length + 1) });
              setOpen(true);
            }}
          >
            <Plus /> {t("Create New", "Buat Baru")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("Assets", "Jumlah aset")} value={String(filtered.length)} />
        <StatCard label={t("Acquisition cost", "Harga perolehan")} value={money(totalCost)} />
        <StatCard label={t("Accumulated depr.", "Akumulasi penyusutan")} value={money(totalAccum)} />
        <StatCard label={t("Book value", "Nilai buku")} value={money(totalCost - totalAccum)} highlight />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder={t("Search asset…", "Cari aset…")}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All status", "Semua status")}</SelectItem>
            <SelectItem value="active">{t("Active", "Aktif")}</SelectItem>
            <SelectItem value="disposed">{t("Disposed", "Dilepas")}</SelectItem>
            <SelectItem value="written_off">{t("Written off", "Dihapusbukukan")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Asset", "Aset")}</TableHead>
              <TableHead>{t("Acquired", "Perolehan")}</TableHead>
              <TableHead className="text-right">{t("Cost", "Harga")}</TableHead>
              <TableHead className="text-right">{t("Monthly", "Per bulan")}</TableHead>
              <TableHead className="text-right">{t("Book value", "Nilai buku")}</TableHead>
              <TableHead>{t("Status", "Status")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No asset registered yet.", "Belum ada aset terdaftar.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a, i) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground">{(current - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>
                    <p>{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.category ?? "—"} · {lang === "id" ? FA_METHOD_LABEL[a.method].id_ : FA_METHOD_LABEL[a.method].en}
                    </p>
                  </TableCell>
                  <TableCell>{a.acquisition_date}</TableCell>
                  <TableCell className="text-right">{money(Number(a.acquisition_cost))}</TableCell>
                  <TableCell className="text-right">{money(monthlyCharge(a))}</TableCell>
                  <TableCell className="text-right font-semibold">{money(bookValue(a))}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-md px-2 py-1 text-xs", FA_STATUS_TONE[a.status])}>
                      {lang === "id" ? FA_STATUS_LABEL[a.status].id_ : FA_STATUS_LABEL[a.status].en}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(a.id)}>
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

      <Pagination
        page={current}
        totalPages={totalPages}
        pageSize={pageSize}
        total={filtered.length}
        onPage={setPage}
        onPageSize={(v) => {
          setPageSize(v);
          setPage(1);
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? t("Edit asset", "Ubah aset") : t("New asset", "Aset baru")}</DialogTitle>
            <DialogDescription>
              {t(
                "Depreciation posts automatically to the mapped ledger accounts.",
                "Penyusutan otomatis terjurnal ke akun buku besar terkait.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("Code", "Kode")}>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label={t("Name", "Nama")}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("Category", "Kategori")}>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label={t("Location", "Lokasi")}>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label={t("Acquisition date", "Tanggal perolehan")}>
              <Input
                type="date"
                value={form.acquisition_date}
                onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })}
              />
            </Field>
            <Field label={t("Acquisition cost", "Harga perolehan")}>
              <Input
                type="number"
                value={form.acquisition_cost}
                onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })}
              />
            </Field>
            <Field label={t("Salvage value", "Nilai residu")}>
              <Input
                type="number"
                value={form.salvage_value}
                onChange={(e) => setForm({ ...form, salvage_value: e.target.value })}
              />
            </Field>
            <Field label={t("Useful life (months)", "Masa manfaat (bulan)")}>
              <Input
                type="number"
                value={form.useful_life_months}
                onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })}
              />
            </Field>
            <Field label={t("Method", "Metode")}>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as FaMethod })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">{t("Straight line", "Garis lurus")}</SelectItem>
                  <SelectItem value="declining">{t("Declining balance", "Saldo menurun")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Asset account", "Akun aset")}>
              <AccountSelect
                accounts={glAccounts}
                value={form.asset_account_code}
                onChange={(v) => setForm({ ...form, asset_account_code: v })}
                placeholder={FA_DEFAULTS.asset.code}
              />
            </Field>
            <Field label={t("Accumulated depreciation account", "Akun akumulasi penyusutan")}>
              <AccountSelect
                accounts={glAccounts}
                value={form.accum_account_code}
                onChange={(v) => setForm({ ...form, accum_account_code: v })}
                placeholder={FA_DEFAULTS.accum.code}
              />
            </Field>
            <Field label={t("Depreciation expense account", "Akun beban penyusutan")}>
              <AccountSelect
                accounts={glAccounts}
                value={form.expense_account_code}
                onChange={(v) => setForm({ ...form, expense_account_code: v })}
                placeholder={FA_DEFAULTS.expense.code}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("Notes", "Catatan")}>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: { code: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder ?? "—"}</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.code} value={a.code}>
            {a.code} · {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (v: number) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {total} {t("records", "data")}
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
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
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t("Prev", "Sebelumnya")}
        </Button>
        <span>
          {page}/{totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {t("Next", "Berikutnya")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- depreciation ------------------------------- */

function DepreciationView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);

  const [period, setPeriod] = useState(currentPeriod());
  const [term, setTerm] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fa-dep", workspaceId],
    queryFn: () => fetchDepreciations(workspaceId),
  });
  const { data: assets = [] } = useQuery({
    queryKey: ["fa-assets", workspaceId],
    queryFn: () => fetchAssets(workspaceId),
  });

  const run = useMutation({
    mutationFn: () => runDepreciation(workspaceId, period),
    onSuccess: (res) => {
      if (!res.posted) {
        toast.info(t("Nothing to depreciate for this period.", "Tidak ada penyusutan untuk periode ini."));
        return;
      }
      toast.success(
        t(
          `Posted ${res.posted} asset(s) · ${money(res.total)}`,
          `${res.posted} aset tersusut · ${money(res.total)}`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["fa-dep", workspaceId] });
      qc.invalidateQueries({ queryKey: ["fa-assets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.asset_code, r.asset_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, term]);

  const plannedThisPeriod = assets
    .filter((a) => a.status === "active")
    .reduce((s, a) => s + monthlyCharge(a), 0);

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Fixed Assets", "Aset Tetap")}
        title={t("Depreciation", "Penyusutan")}
        action={
          <div className="flex items-center gap-2">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
            <Button variant="navy" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play />}{" "}
              {t("Run depreciation", "Jalankan penyusutan")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Active assets", "Aset aktif")} value={String(assets.filter((a) => a.status === "active").length)} />
        <StatCard label={t("Planned this month", "Rencana bulan ini")} value={money(plannedThisPeriod)} highlight />
        <StatCard
          label={t("Posted to date", "Total tercatat")}
          value={money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
          placeholder={t("Search asset…", "Cari aset…")}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Period", "Periode")}</TableHead>
              <TableHead>{t("Asset", "Aset")}</TableHead>
              <TableHead className="text-right">{t("Amount", "Jumlah")}</TableHead>
              <TableHead className="text-right">{t("Book value after", "Nilai buku setelah")}</TableHead>
              <TableHead>{t("Journal", "Jurnal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No depreciation posted yet.", "Belum ada penyusutan tercatat.")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{r.period_date}</TableCell>
                  <TableCell>
                    <p className="font-medium">{r.asset_code}</p>
                    <p className="text-xs text-muted-foreground">{r.asset_name}</p>
                  </TableCell>
                  <TableCell className="text-right">{money(Number(r.amount))}</TableCell>
                  <TableCell className="text-right">{money(Number(r.book_value_after))}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.journal_entry_id ? t("Posted", "Terjurnal") : "—"}</Badge>
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

/* ---------------------------------- disposal --------------------------------- */

function DisposalView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);

  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("0");
  const [cashAccount, setCashAccount] = useState("");
  const [writeOff, setWriteOff] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["fa-assets", workspaceId],
    queryFn: () => fetchAssets(workspaceId),
  });
  const { data: cbAccounts = [] } = useQuery({
    queryKey: ["cb-accounts", workspaceId],
    queryFn: () => fetchCbAccounts(workspaceId),
  });

  const active = assets.filter((a) => a.status === "active");
  const disposed = assets.filter((a) => a.status !== "active");
  const selected = active.find((a) => a.id === assetId) ?? null;
  const preview = selected ? (writeOff ? 0 : Number(amount) || 0) - bookValue(selected) : 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error(t("Select an asset.", "Pilih aset."));
      return disposeAsset(workspaceId, {
        asset: selected,
        disposal_date: date,
        disposal_amount: Number(amount) || 0,
        cash_account_code: cbAccounts.find((c) => c.code === cashAccount)?.gl_account_code ?? null,
        write_off: writeOff,
        notes,
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.gainLoss >= 0
          ? t(`Disposed · gain ${money(res.gainLoss)}`, `Aset dilepas · laba ${money(res.gainLoss)}`)
          : t(`Disposed · loss ${money(Math.abs(res.gainLoss))}`, `Aset dilepas · rugi ${money(Math.abs(res.gainLoss))}`),
      );
      setOpen(false);
      setAssetId("");
      setAmount("0");
      setWriteOff(false);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["fa-assets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Fixed Assets", "Aset Tetap")}
        title={t("Disposal", "Pelepasan Aset")}
        action={
          <Button variant="navy" onClick={() => setOpen(true)}>
            <Plus /> {t("Create New", "Buat Baru")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Active assets", "Aset aktif")} value={String(active.length)} />
        <StatCard label={t("Disposed", "Sudah dilepas")} value={String(disposed.length)} />
        <StatCard
          label={t("Disposal proceeds", "Hasil pelepasan")}
          value={money(disposed.reduce((s, a) => s + Number(a.disposal_amount || 0), 0))}
          highlight
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Asset", "Aset")}</TableHead>
              <TableHead>{t("Disposal date", "Tanggal pelepasan")}</TableHead>
              <TableHead className="text-right">{t("Proceeds", "Nilai jual")}</TableHead>
              <TableHead>{t("Status", "Status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : disposed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No disposal recorded yet.", "Belum ada pelepasan aset.")}
                </TableCell>
              </TableRow>
            ) : (
              disposed.map((a, i) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.disposal_date ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(Number(a.disposal_amount || 0))}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-md px-2 py-1 text-xs", FA_STATUS_TONE[a.status])}>
                      {lang === "id" ? FA_STATUS_LABEL[a.status].id_ : FA_STATUS_LABEL[a.status].en}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Dispose asset", "Lepas aset")}</DialogTitle>
            <DialogDescription>
              {t(
                "The gain or loss is posted automatically against the book value.",
                "Laba atau rugi otomatis dijurnal terhadap nilai buku.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label={t("Asset", "Aset")}>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select asset", "Pilih aset")} />
                </SelectTrigger>
                <SelectContent>
                  {active.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Disposal date", "Tanggal pelepasan")}>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t("Proceeds", "Nilai jual")}>
                <Input
                  type="number"
                  value={amount}
                  disabled={writeOff}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t("Received into", "Diterima di")}>
              <Select value={cashAccount || NONE} onValueChange={(v) => setCashAccount(v === NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Cash / bank account", "Akun kas / bank")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("Default cash", "Kas default")}</SelectItem>
                  {cbAccounts.map((c) => (
                    <SelectItem key={c.id} value={c.code}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={writeOff} onCheckedChange={(v) => setWriteOff(Boolean(v))} />
              {t("Write off (no proceeds)", "Hapus buku (tanpa hasil jual)")}
            </label>
            <Field label={t("Notes", "Catatan")}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {selected && (
              <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">{t("Book value", "Nilai buku")}</span>
                  <span className="font-medium">{money(bookValue(selected))}</span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">{t("Gain / loss", "Laba / rugi")}</span>
                  <span className={cn("font-semibold", preview >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {money(preview)}
                  </span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("Dispose", "Lepas aset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}