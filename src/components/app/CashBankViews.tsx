import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { countWorkspaceRows, deleteWorkspaceRow, saveWorkspaceRow } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { fetchAccounts } from "@/lib/accounting";
import {
  buildCbBalances,
  createCbTransaction,
  fetchCbAccounts,
  fetchCbTransactions,
  nextTrxNumber,
  PAYMENT_METHODS,
  TRX_LABEL,
  TRX_TONE,
  type CbAccount,
  type CbEntity,
  type CbTrxType,
} from "@/lib/cashbank";
import { formatMoney as fmtMoney } from "@/lib/procurement";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];
const ALL = "__all__";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
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

export function CashBankView({ entity, workspaceId }: { entity: CbEntity; workspaceId: string }) {
  if (entity.kind === "accounts") return <AccountsView workspaceId={workspaceId} />;
  if (entity.kind === "reconciliation") return <ReconciliationView workspaceId={workspaceId} />;
  return <LedgerView entity={entity} workspaceId={workspaceId} />;
}

/* ---------------------------------- accounts --------------------------------- */

const emptyAccount = {
  code: "",
  name: "",
  account_kind: "bank" as "bank" | "cash",
  gl_account_code: "",
  bank_name: "",
  account_number: "",
  currency: "IDR",
  opening_balance: "0",
  is_active: true,
};

function AccountsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const formatMoney = (v: number) => fmtMoney(v, lang);

  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAccount);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["cb-accounts", workspaceId],
    queryFn: () => fetchCbAccounts(workspaceId),
  });
  const { data: glAccounts = [] } = useQuery({
    queryKey: ["cb-gl-accounts", workspaceId],
    queryFn: () => fetchAccounts(workspaceId),
  });
  const { data: trx = [] } = useQuery({
    queryKey: ["cb-trx", workspaceId, "all"],
    queryFn: () => fetchCbTransactions(workspaceId),
  });

  const balances = useMemo(() => buildCbBalances(accounts, trx), [accounts, trx]);
  const rows = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return balances;
    return balances.filter((b) =>
      [b.account.code, b.account.name, b.account.bank_name, b.account.account_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [balances, term]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim())
        throw new Error(t("Code and name are required.", "Kode dan nama wajib diisi."));
      const payload = {
        workspace_id: workspaceId,
        code: form.code.trim(),
        name: form.name.trim(),
        account_kind: form.account_kind,
        gl_account_code: form.gl_account_code || null,
        bank_name: form.bank_name || null,
        account_number: form.account_number || null,
        currency: form.currency || "IDR",
        opening_balance: Number(form.opening_balance) || 0,
        is_active: form.is_active,
      };
      if (editId) {
        await saveWorkspaceRow({ data: { table: "cb_accounts", workspaceId, id: editId, data: payload } });
      } else {
        await saveWorkspaceRow({ data: { table: "cb_accounts", workspaceId, data: payload } });
      }
    },
    onSuccess: () => {
      toast.success(t("Account saved.", "Akun tersimpan."));
      setOpen(false);
      setEditId(null);
      setForm(emptyAccount);
      qc.invalidateQueries({ queryKey: ["cb-accounts", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "cb_accounts", workspaceId, id } });
    },
    onSuccess: () => {
      toast.success(t("Account removed.", "Akun dihapus."));
      qc.invalidateQueries({ queryKey: ["cb-accounts", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (a: CbAccount) => {
    setEditId(a.id);
    setForm({
      code: a.code,
      name: a.name,
      account_kind: a.account_kind,
      gl_account_code: a.gl_account_code ?? "",
      bank_name: a.bank_name ?? "",
      account_number: a.account_number ?? "",
      currency: a.currency,
      opening_balance: String(a.opening_balance ?? 0),
      is_active: a.is_active,
    });
    setOpen(true);
  };

  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Cash & Bank", "Kas & Bank")}
        title={t("Cash & Bank Accounts", "Akun Kas & Bank")}
        action={
          <Button
            variant="navy"
            onClick={() => {
              setEditId(null);
              setForm(emptyAccount);
              setOpen(true);
            }}
          >
            <Plus /> {t("Create New", "Buat Baru")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Accounts", "Jumlah Akun")} value={String(rows.length)} />
        <StatCard label={t("Total balance", "Total saldo")} value={formatMoney(totalBalance)} highlight />
        <StatCard
          label={t("Bank accounts", "Akun bank")}
          value={String(rows.filter((r) => r.account.account_kind === "bank").length)}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
          placeholder={t("Search account…", "Cari akun…")}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Name", "Nama")}</TableHead>
              <TableHead>{t("Type", "Tipe")}</TableHead>
              <TableHead>{t("GL account", "Akun GL")}</TableHead>
              <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No cash or bank account yet.", "Belum ada akun kas atau bank.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={r.account.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.account.code}</TableCell>
                  <TableCell>
                    <p>{r.account.name}</p>
                    {r.account.bank_name && (
                      <p className="text-xs text-muted-foreground">
                        {r.account.bank_name} · {r.account.account_number ?? "—"}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {r.account.account_kind === "bank" ? t("Bank", "Bank") : t("Cash", "Kas")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.account.gl_account_code ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(r.balance)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r.account)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => remove.mutate(r.account.id)}
                      >
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editId ? t("Edit account", "Ubah akun") : t("New cash / bank account", "Akun kas / bank baru")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Link the account to a ledger account so transactions post automatically.",
                "Hubungkan ke akun buku besar agar transaksi terjurnal otomatis.",
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
            <Field label={t("Type", "Tipe")}>
              <Select
                value={form.account_kind}
                onValueChange={(v) => setForm({ ...form, account_kind: v as "bank" | "cash" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("Cash", "Kas")}</SelectItem>
                  <SelectItem value="bank">{t("Bank", "Bank")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("GL account", "Akun GL")}>
              <Select
                value={form.gl_account_code || ALL}
                onValueChange={(v) => setForm({ ...form, gl_account_code: v === ALL ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Select", "Pilih")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("Not linked", "Belum terhubung")}</SelectItem>
                  {glAccounts.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Bank name", "Nama bank")}>
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </Field>
            <Field label={t("Account number", "Nomor rekening")}>
              <Input
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              />
            </Field>
            <Field label={t("Currency", "Mata uang")}>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </Field>
            <Field label={t("Opening balance", "Saldo awal")}>
              <Input
                value={form.opening_balance}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: Boolean(v) })}
            />
            {t("Active", "Aktif")}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------- ledger ---------------------------------- */

function LedgerView({ entity, workspaceId }: { entity: CbEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const formatMoney = (v: number) => fmtMoney(v, lang);
  const type = entity.trxType as CbTrxType;

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [term, setTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    trx_date: today(),
    account_code: "",
    counterpart_code: "",
    category_code: "",
    contact_name: "",
    method: "cash",
    reference: "",
    memo: "",
    amount: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["cb-accounts", workspaceId],
    queryFn: () => fetchCbAccounts(workspaceId),
  });
  const { data: glAccounts = [] } = useQuery({
    queryKey: ["cb-gl-accounts", workspaceId],
    queryFn: () => fetchAccounts(workspaceId),
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cb-trx", workspaceId, type, from, to],
    queryFn: () => fetchCbTransactions(workspaceId, { from, to, type }),
  });

  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    return rows.filter((r) => {
      if (accountFilter !== ALL && r.account_code !== accountFilter && r.counterpart_account_code !== accountFilter)
        return false;
      if (!s) return true;
      return [r.trx_no, r.account_name, r.contact_name, r.reference, r.memo, r.category_account_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [rows, term, accountFilter]);

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);

  const create = useMutation({
    mutationFn: async () => {
      const account = accounts.find((a) => a.code === form.account_code);
      if (!account) throw new Error(t("Select a cash / bank account.", "Pilih akun kas / bank."));
      const counterpart = accounts.find((a) => a.code === form.counterpart_code) ?? null;
      const gl = glAccounts.find((a) => a.code === form.category_code);
      const seq =
        (
          await countWorkspaceRows({
            data: { table: "cb_transactions", workspaceId, filters: { trx_type: type } },
          })
        ).data?.count ?? 0;
      const prefix = type === "in" ? "CI" : type === "out" ? "CO" : "CTR";
      await createCbTransaction(workspaceId, {
        trx_no: nextTrxNumber(prefix, seq + 1),
        trx_date: form.trx_date,
        trx_type: type,
        account,
        counterpart,
        category_account_code: gl?.code ?? null,
        category_account_name: gl?.name ?? null,
        contact_name: form.contact_name,
        method: form.method,
        reference: form.reference,
        memo: form.memo,
        amount: Number(form.amount) || 0,
      });
    },
    onSuccess: () => {
      toast.success(t("Transaction posted.", "Transaksi tercatat."));
      setOpen(false);
      setForm({ ...form, amount: "", memo: "", reference: "", contact_name: "" });
      qc.invalidateQueries({ queryKey: ["cb-trx"] });
      qc.invalidateQueries({ queryKey: ["acc"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Cash & Bank", "Kas & Bank")}
        title={lang === "id" ? entity.id_ : entity.en}
        action={
          <Button variant="navy" onClick={() => setOpen(true)}>
            <Plus /> {t("Create New", "Buat Baru")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Transactions", "Transaksi")} value={String(filtered.length)} />
        <StatCard label={t("Total value", "Total nilai")} value={formatMoney(total)} highlight />
        <StatCard
          label={t("Unreconciled", "Belum rekonsiliasi")}
          value={String(filtered.filter((r) => !r.is_reconciled).length)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
            }}
            className="w-56 pl-9"
            placeholder={t("Search…", "Cari…")}
          />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("All accounts", "Semua akun")}</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.code} value={a.code}>
                {a.code} — {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Number", "Nomor")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Account", "Akun")}</TableHead>
              <TableHead>{type === "transfer" ? t("Destination", "Tujuan") : t("Category", "Kategori")}</TableHead>
              <TableHead>{t("Contact / Reference", "Kontak / Referensi")}</TableHead>
              <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : current.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  {t("No transaction in this period.", "Belum ada transaksi pada periode ini.")}
                </TableCell>
              </TableRow>
            ) : (
              current.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.trx_no}</TableCell>
                  <TableCell>{r.trx_date}</TableCell>
                  <TableCell>{r.account_name ?? r.account_code}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {type === "transfer"
                      ? (r.counterpart_account_name ?? r.counterpart_account_code ?? "—")
                      : (r.category_account_name ?? r.category_account_code ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[r.contact_name, r.reference].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <span className={cn("rounded-md px-2 py-1", TRX_TONE[r.trx_type])}>
                      {formatMoney(Number(r.amount))}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t("Page", "Halaman")} {page} / {pageCount}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("Previous", "Sebelumnya")}
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            {t("Next", "Berikutnya")}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t("New", "Baru")} {lang === "id" ? TRX_LABEL[type].id_ : TRX_LABEL[type].en}
            </DialogTitle>
            <DialogDescription>
              {t(
                "The journal entry is posted automatically when you save.",
                "Jurnal otomatis dibuat saat transaksi disimpan.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("Date", "Tanggal")}>
              <Input type="date" value={form.trx_date} onChange={(e) => setForm({ ...form, trx_date: e.target.value })} />
            </Field>
            <Field label={type === "transfer" ? t("From account", "Dari akun") : t("Cash / bank account", "Akun kas / bank")}>
              <Select value={form.account_code} onValueChange={(v) => setForm({ ...form, account_code: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select", "Pilih")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {type === "transfer" ? (
              <Field label={t("To account", "Ke akun")}>
                <Select value={form.counterpart_code} onValueChange={(v) => setForm({ ...form, counterpart_code: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select", "Pilih")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.code !== form.account_code)
                      .map((a) => (
                        <SelectItem key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field
                label={
                  type === "in"
                    ? t("Source account (revenue / receivable)", "Akun sumber (pendapatan / piutang)")
                    : t("Expense / payable account", "Akun beban / hutang")
                }
              >
                <Select value={form.category_code} onValueChange={(v) => setForm({ ...form, category_code: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select", "Pilih")} />
                  </SelectTrigger>
                  <SelectContent>
                    {glAccounts.map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label={t("Amount", "Nilai")}>
              <Input
                value={form.amount}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label={t("Method", "Metode")}>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Contact", "Kontak")}>
              <Input
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </Field>
            <Field label={t("Reference", "Referensi")}>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
          </div>
          <Field label={t("Memo", "Catatan")}>
            <Textarea rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------- reconciliation ------------------------------ */

function ReconciliationView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const formatMoney = (v: number) => fmtMoney(v, lang);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [accountCode, setAccountCode] = useState(ALL);
  const [statementBalance, setStatementBalance] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["cb-accounts", workspaceId],
    queryFn: () => fetchCbAccounts(workspaceId),
  });
  const { data: all = [] } = useQuery({
    queryKey: ["cb-trx", workspaceId, "all"],
    queryFn: () => fetchCbTransactions(workspaceId),
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cb-trx-recon", workspaceId, from, to],
    queryFn: () => fetchCbTransactions(workspaceId, { from, to }),
  });

  const scoped = useMemo(
    () =>
      rows.filter(
        (r) => accountCode === ALL || r.account_code === accountCode || r.counterpart_account_code === accountCode,
      ),
    [rows, accountCode],
  );

  const bookBalance = useMemo(() => {
    const balances = buildCbBalances(accounts, all);
    if (accountCode === ALL) return balances.reduce((s, b) => s + b.balance, 0);
    return balances.find((b) => b.account.code === accountCode)?.balance ?? 0;
  }, [accounts, all, accountCode]);

  const reconciledValue = scoped
    .filter((r) => r.is_reconciled)
    .reduce((s, r) => s + (r.trx_type === "in" ? Number(r.amount) : -Number(r.amount)), 0);
  const difference = (Number(statementBalance) || 0) - bookBalance;

  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      await saveWorkspaceRow({
        data: {
          table: "cb_transactions",
          workspaceId,
          id,
          data: { is_reconciled: value ? 1 : 0, reconciled_at: value ? new Date().toISOString() : null },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cb-trx"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header kicker={t("Cash & Bank", "Kas & Bank")} title={t("Bank Reconciliation", "Rekonsiliasi Bank")} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("Book balance", "Saldo buku")} value={formatMoney(bookBalance)} highlight />
        <StatCard label={t("Reconciled movement", "Mutasi terekonsiliasi")} value={formatMoney(reconciledValue)} />
        <StatCard
          label={t("Open items", "Item terbuka")}
          value={String(scoped.filter((r) => !r.is_reconciled).length)}
        />
        <StatCard label={t("Difference", "Selisih")} value={formatMoney(difference)} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select value={accountCode} onValueChange={setAccountCode}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("All accounts", "Semua akun")}</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.code} value={a.code}>
                {a.code} — {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <div className="w-52">
          <Label className="text-xs">{t("Statement balance", "Saldo rekening koran")}</Label>
          <Input
            value={statementBalance}
            inputMode="decimal"
            onChange={(e) => setStatementBalance(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t("OK", "OK")}</TableHead>
              <TableHead>{t("Number", "Nomor")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Account", "Akun")}</TableHead>
              <TableHead>{t("Type", "Tipe")}</TableHead>
              <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : scoped.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {t("Nothing to reconcile.", "Tidak ada data untuk direkonsiliasi.")}
                </TableCell>
              </TableRow>
            ) : (
              scoped.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={r.is_reconciled}
                      onCheckedChange={(v) => toggle.mutate({ id: r.id, value: Boolean(v) })}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.trx_no}</TableCell>
                  <TableCell>{r.trx_date}</TableCell>
                  <TableCell>{r.account_name ?? r.account_code}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-md px-2 py-1 text-xs", TRX_TONE[r.trx_type])}>
                      {lang === "id" ? TRX_LABEL[r.trx_type].id_ : TRX_LABEL[r.trx_type].en}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(Number(r.amount))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ----------------------------------- shared ---------------------------------- */

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
