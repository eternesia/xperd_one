import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { useI18n } from "@/lib/i18n";
import { formatMoney, nextDocNumber } from "@/lib/procurement";
import {
  ACCOUNT_TYPE_LABEL,
  buildCashFlow,
  buildEquityStatement,
  buildTrialBalance,
  CASH_FLOW_GROUP_LABEL,
  cashBalanceOf,
  fetchCashAccountCodes,
  fetchAccounts,
  fetchEntries,
  fetchOpeningBalances,
  fetchLines,
  isDebitNormal,
  OPENING_BALANCE_SOURCE,
  postManualEntry,
  RETAINED_EARNINGS,
  rollbackOpeningBalance,
  verifyOpeningBalance,
  type OpeningBalanceCheck,
  type AccAccount,
  type AccAccountType,
  type AccEntity,
  type AccEntry,
  type AccLine,
  type ManualLineInput,
  type CashFlowGroup,
} from "@/lib/accounting";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
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

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold text-navy dark:text-primary-foreground", tone)}>{value}</p>
    </div>
  );
}

function DateRange({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  return (
    <>
      <div>
        <Label className="text-xs text-muted-foreground">{t("From", "Dari")}</Label>
        <Input type="date" className="mt-1 h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">{t("To", "Sampai")}</Label>
        <Input type="date" className="mt-1 h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
    </>
  );
}

function PrintButton() {
  const { lang } = useI18n();
  return (
    <Button variant="outline" className="no-print" onClick={() => window.print()}>
      <Printer /> {lang === "id" ? "Cetak" : "Print"}
    </Button>
  );
}

/* ------------------------------- data hooks ------------------------------- */

function useAccounts(workspaceId: string) {
  return useQuery({
    queryKey: ["acc-accounts", workspaceId],
    queryFn: () => fetchAccounts(workspaceId),
  });
}

function useLedger(workspaceId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["acc-ledger", workspaceId, from, to],
    queryFn: async () => {
      const entries = await fetchEntries(workspaceId, from, to);
      const lines = await fetchLines(workspaceId, entries.map((e) => e.id));
      return { entries, lines };
    },
  });
}

/* -------------------------------- journals -------------------------------- */

function JournalsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useLedger(workspaceId, from, to);
  const { data: accounts = [] } = useAccounts(workspaceId);
  const entries = data?.entries ?? [];
  const lines = data?.lines ?? [];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return entries;
    return entries.filter(
      (e) =>
        e.entry_no.toLowerCase().includes(s) ||
        (e.memo ?? "").toLowerCase().includes(s) ||
        (e.source_doc_number ?? "").toLowerCase().includes(s),
    );
  }, [entries, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalDebit = filtered.reduce((s, e) => s + Number(e.total_debit || 0), 0);

  /* manual entry form */
  const emptyLine = (): ManualLineInput => ({ account_code: "", account_name: "", description: "", debit: 0, credit: 0 });
  const [form, setForm] = useState({ entry_date: today(), memo: "", lines: [emptyLine(), emptyLine()] });

  const formDebit = form.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const formCredit = form.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(formDebit - formCredit) < 0.5 && formDebit > 0;

  const save = useMutation({
    mutationFn: async () => {
      const seq = entries.length + 1;
      await postManualEntry(workspaceId, {
        entry_no: nextDocNumber("JV", seq, new Date(form.entry_date)),
        entry_date: form.entry_date,
        memo: form.memo,
        lines: form.lines,
      });
    },
    onSuccess: () => {
      toast.success(t("Journal entry posted", "Jurnal berhasil dicatat"));
      setOpen(false);
      setForm({ entry_date: today(), memo: "", lines: [emptyLine(), emptyLine()] });
      qc.invalidateQueries({ queryKey: ["acc-ledger", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLine = (i: number, patch: Partial<ManualLineInput>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Accounting", "Akuntansi")}
        title={t("Journal Entries", "Jurnal Umum")}
        action={
          <div className="flex gap-2">
            <PrintButton />
            <Button variant="navy" className="no-print" onClick={() => setOpen(true)}>
              <Plus /> {t("Create New", "Buat Baru")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Entries", "Jurnal")} value={String(filtered.length)} />
        <StatCard label={t("Total posted", "Total dicatat")} value={formatMoney(totalDebit, lang)} />
        <StatCard
          label={t("Automatic entries", "Jurnal otomatis")}
          value={String(filtered.filter((e) => e.is_auto).length)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 no-print">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("Search entry…", "Cari jurnal…")}
          />
        </div>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Entry no.", "No. Jurnal")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Memo", "Keterangan")}</TableHead>
              <TableHead>{t("Source", "Sumber")}</TableHead>
              <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
              <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            )}
            {!isLoading && !paged.length && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t("No journal entries in this period.", "Belum ada jurnal pada periode ini.")}</TableCell></TableRow>
            )}
            {paged.map((e, i) => (
              <Fragment key={e.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="font-medium text-navy dark:text-primary-foreground">{e.entry_no}</TableCell>
                  <TableCell>{e.entry_date}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{e.memo}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={e.is_auto ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : ""}>
                      {e.is_auto ? t("Auto", "Otomatis") : t("Manual", "Manual")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(Number(e.total_debit), lang)}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(e.total_credit), lang)}</TableCell>
                </TableRow>
                {expanded === e.id && (
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={7} className="p-0">
                      <div className="px-6 py-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("Account", "Akun")}</TableHead>
                              <TableHead>{t("Description", "Keterangan")}</TableHead>
                              <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
                              <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lines.filter((l) => l.entry_id === e.id).map((l) => (
                              <TableRow key={l.id}>
                                <TableCell>{l.account_code} · {l.account_name}</TableCell>
                                <TableCell className="text-muted-foreground">{l.description}</TableCell>
                                <TableCell className="text-right">{Number(l.debit) ? formatMoney(Number(l.debit), lang) : "—"}</TableCell>
                                <TableCell className="text-right">{Number(l.credit) ? formatMoney(Number(l.credit), lang) : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("New journal entry", "Jurnal baru")}</DialogTitle>
            <DialogDescription>
              {t("Debit and credit totals must balance before posting.", "Total debit dan kredit harus seimbang sebelum dicatat.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("Date", "Tanggal")}</Label>
              <Input type="date" className="mt-1" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("Memo", "Keterangan")}</Label>
              <Textarea className="mt-1 min-h-[38px]" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            {form.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-4">
                  {i === 0 && <Label className="text-xs text-muted-foreground">{t("Account", "Akun")}</Label>}
                  <Select
                    value={l.account_code}
                    onValueChange={(v) => {
                      const a = accounts.find((x) => x.code === v);
                      setLine(i, { account_code: v, account_name: a?.name ?? "" });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={t("Select account", "Pilih akun")} /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  {i === 0 && <Label className="text-xs text-muted-foreground">{t("Description", "Keterangan")}</Label>}
                  <Input className="mt-1 h-9" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  {i === 0 && <Label className="text-xs text-muted-foreground">{t("Debit", "Debit")}</Label>}
                  <Input type="number" className="mt-1 h-9 text-right" value={l.debit || ""} onChange={(e) => setLine(i, { debit: Number(e.target.value), credit: 0 })} />
                </div>
                <div className="col-span-2">
                  {i === 0 && <Label className="text-xs text-muted-foreground">{t("Credit", "Kredit")}</Label>}
                  <Input type="number" className="mt-1 h-9 text-right" value={l.credit || ""} onChange={(e) => setLine(i, { credit: Number(e.target.value), debit: 0 })} />
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={form.lines.length <= 2}
                    onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}>
              <Plus /> {t("Add line", "Tambah baris")}
            </Button>
          </div>

          <div className="flex justify-end gap-6 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span>{t("Debit", "Debit")}: <strong>{formatMoney(formDebit, lang)}</strong></span>
            <span>{t("Credit", "Kredit")}: <strong>{formatMoney(formCredit, lang)}</strong></span>
            <span className={balanced ? "text-emerald-600" : "text-destructive"}>
              {balanced ? t("Balanced", "Seimbang") : t("Out of balance", "Tidak seimbang")}
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel", "Batal")}</Button>
            <Button variant="navy" disabled={!balanced || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="animate-spin" />} {t("Post entry", "Catat jurnal")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pager({
  page, setPage, pageSize, setPageSize, total,
}: { page: number; setPage: (n: number) => void; pageSize: number; setPageSize: (n: number) => void; total: number }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm no-print">
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

/* --------------------------------- ledger --------------------------------- */

function LedgerView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [account, setAccount] = useState<string>("");

  const { data: accounts = [] } = useAccounts(workspaceId);
  const { data, isLoading } = useLedger(workspaceId, from, to);
  const entries = data?.entries ?? [];
  const lines = data?.lines ?? [];

  const activeAccount = account || accounts[0]?.code || "";
  const meta = accounts.find((a) => a.code === activeAccount);
  const debitNormal = isDebitNormal(meta?.account_type ?? "asset");

  const rows = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const scoped = lines
      .filter((l) => l.account_code === activeAccount)
      .map((l) => ({ line: l, entry: byId.get(l.entry_id) }))
      .filter((r) => r.entry)
      .sort((a, b) => (a.entry!.entry_date < b.entry!.entry_date ? -1 : 1));
    let running = 0;
    return scoped.map((r) => {
      const d = Number(r.line.debit) || 0;
      const c = Number(r.line.credit) || 0;
      running += debitNormal ? d - c : c - d;
      return { ...r, debit: d, credit: c, running };
    });
  }, [lines, entries, activeAccount, debitNormal]);

  return (
    <div className="space-y-5">
      <Header kicker={t("Accounting", "Akuntansi")} title={t("General Ledger", "Buku Besar")} action={<PrintButton />} />

      <div className="flex flex-wrap items-end gap-2 no-print">
        <div>
          <Label className="text-xs text-muted-foreground">{t("Account", "Akun")}</Label>
          <Select value={activeAccount} onValueChange={setAccount}>
            <SelectTrigger className="mt-1 h-9 w-72"><SelectValue placeholder={t("Select account", "Pilih akun")} /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Total debit", "Total debit")} value={formatMoney(rows.reduce((s, r) => s + r.debit, 0), lang)} />
        <StatCard label={t("Total credit", "Total kredit")} value={formatMoney(rows.reduce((s, r) => s + r.credit, 0), lang)} />
        <StatCard label={t("Closing balance", "Saldo akhir")} value={formatMoney(rows.at(-1)?.running ?? 0, lang)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Entry no.", "No. Jurnal")}</TableHead>
              <TableHead>{t("Description", "Keterangan")}</TableHead>
              <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
              <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
              <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
            {!isLoading && !rows.length && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t("No movements for this account.", "Belum ada mutasi untuk akun ini.")}</TableCell></TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.line.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{r.entry!.entry_date}</TableCell>
                <TableCell className="font-medium text-navy dark:text-primary-foreground">{r.entry!.entry_no}</TableCell>
                <TableCell className="max-w-[320px] truncate">{r.line.description ?? r.entry!.memo}</TableCell>
                <TableCell className="text-right">{r.debit ? formatMoney(r.debit, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.credit ? formatMoney(r.credit, lang) : "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(r.running, lang)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------ trial balance ----------------------------- */

function useBalances(workspaceId: string, from: string, to: string) {
  const { data, isLoading } = useLedger(workspaceId, from, to);
  const { data: accounts = [] } = useAccounts(workspaceId);
  const balances = useMemo(
    () => buildTrialBalance(data?.lines ?? [], accounts as AccAccount[]),
    [data?.lines, accounts],
  );
  return { balances, isLoading };
}

function TrialBalanceView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { balances, isLoading } = useBalances(workspaceId, from, to);

  const totalDebit = balances.reduce((s, r) => s + r.debit, 0);
  const totalCredit = balances.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-5">
      <Header kicker={t("Accounting", "Akuntansi")} title={t("Trial Balance", "Neraca Saldo")} action={<PrintButton />} />
      <div className="flex flex-wrap items-end gap-2 no-print">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Total debit", "Total debit")} value={formatMoney(totalDebit, lang)} />
        <StatCard label={t("Total credit", "Total kredit")} value={formatMoney(totalCredit, lang)} />
        <StatCard
          label={t("Difference", "Selisih")}
          value={formatMoney(totalDebit - totalCredit, lang)}
          tone={Math.abs(totalDebit - totalCredit) < 0.5 ? "text-emerald-600" : "text-destructive"}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Account", "Akun")}</TableHead>
              <TableHead>{t("Type", "Tipe")}</TableHead>
              <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
              <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
              <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
            {!isLoading && !balances.length && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t("No postings in this period.", "Belum ada pencatatan pada periode ini.")}</TableCell></TableRow>
            )}
            {balances.map((r, i) => (
              <TableRow key={r.code}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium text-navy dark:text-primary-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{lang === "id" ? ACCOUNT_TYPE_LABEL[r.type].id_ : ACCOUNT_TYPE_LABEL[r.type].en}</TableCell>
                <TableCell className="text-right">{r.debit ? formatMoney(r.debit, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.credit ? formatMoney(r.credit, lang) : "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(r.balance, lang)}</TableCell>
              </TableRow>
            ))}
            {!!balances.length && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4}>{t("Total", "Total")}</TableCell>
                <TableCell className="text-right">{formatMoney(totalDebit, lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(totalCredit, lang)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------ profit & loss ----------------------------- */

function StatementSection({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { code: string; name: string; balance: number }[];
  total: number;
}) {
  const { lang } = useI18n();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-navy dark:text-primary-foreground">
        {title}
      </div>
      <Table>
        <TableBody>
          {!rows.length && (
            <TableRow><TableCell className="py-6 text-center text-muted-foreground">—</TableCell></TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.code}>
              <TableCell className="w-24 text-muted-foreground">{r.code}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-right">{formatMoney(r.balance, lang)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell colSpan={2}>{lang === "id" ? "Total" : "Total"}</TableCell>
            <TableCell className="text-right">{formatMoney(total, lang)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function sumType(balances: { type: AccAccountType; balance: number }[], type: AccAccountType) {
  return balances.filter((b) => b.type === type).reduce((s, b) => s + b.balance, 0);
}

function ProfitLossView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { balances } = useBalances(workspaceId, from, to);

  const revenue = balances.filter((b) => b.type === "revenue");
  const expense = balances.filter((b) => b.type === "expense");
  const totalRevenue = sumType(balances, "revenue");
  const totalExpense = sumType(balances, "expense");
  const net = totalRevenue - totalExpense;

  return (
    <div className="space-y-5">
      <Header kicker={t("Accounting", "Akuntansi")} title={t("Profit & Loss", "Laba Rugi")} action={<PrintButton />} />
      <div className="flex flex-wrap items-end gap-2 no-print">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Revenue", "Pendapatan")} value={formatMoney(totalRevenue, lang)} />
        <StatCard label={t("Expenses", "Beban")} value={formatMoney(totalExpense, lang)} />
        <StatCard
          label={t("Net profit", "Laba bersih")}
          value={formatMoney(net, lang)}
          tone={net >= 0 ? "text-emerald-600" : "text-destructive"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSection title={t("Revenue", "Pendapatan")} rows={revenue} total={totalRevenue} />
        <StatementSection title={t("Expenses", "Beban")} rows={expense} total={totalExpense} />
      </div>
    </div>
  );
}

/* ------------------------------ balance sheet ----------------------------- */

function BalanceSheetView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [to, setTo] = useState(today());
  const { balances } = useBalances(workspaceId, "", to);

  const assets = balances.filter((b) => b.type === "asset");
  const liabilities = balances.filter((b) => b.type === "liability");
  const equity = balances.filter((b) => b.type === "equity");
  const totalAssets = sumType(balances, "asset");
  const totalLiabilities = sumType(balances, "liability");
  const netIncome = sumType(balances, "revenue") - sumType(balances, "expense");
  const totalEquity = sumType(balances, "equity") + netIncome;
  const diff = totalAssets - (totalLiabilities + totalEquity);

  return (
    <div className="space-y-5">
      <Header kicker={t("Accounting", "Akuntansi")} title={t("Balance Sheet", "Neraca")} action={<PrintButton />} />
      <div className="flex flex-wrap items-end gap-2 no-print">
        <div>
          <Label className="text-xs text-muted-foreground">{t("As of", "Per tanggal")}</Label>
          <Input type="date" className="mt-1 h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Total assets", "Total aset")} value={formatMoney(totalAssets, lang)} />
        <StatCard label={t("Liabilities + equity", "Kewajiban + ekuitas")} value={formatMoney(totalLiabilities + totalEquity, lang)} />
        <StatCard
          label={t("Difference", "Selisih")}
          value={formatMoney(diff, lang)}
          tone={Math.abs(diff) < 0.5 ? "text-emerald-600" : "text-destructive"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSection title={t("Assets", "Aset")} rows={assets} total={totalAssets} />
        <div className="space-y-4">
          <StatementSection title={t("Liabilities", "Kewajiban")} rows={liabilities} total={totalLiabilities} />
          <StatementSection
            title={t("Equity", "Ekuitas")}
            rows={[...equity, { code: "—", name: t("Current period result", "Laba periode berjalan"), balance: netIncome }]}
            total={totalEquity}
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- period closing ----------------------------- */

function previousDay(date: string) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function CashFlowView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const { data: accounts = [] } = useAccounts(workspaceId);
  const { data: cashCodes = [] } = useQuery({
    queryKey: ["acc-cash-codes", workspaceId],
    queryFn: () => fetchCashAccountCodes(workspaceId),
  });
  const { data, isLoading } = useLedger(workspaceId, from, to);
  const { data: before } = useLedger(workspaceId, "", previousDay(from));

  const result = useMemo(
    () =>
      buildCashFlow(
        data?.entries ?? [],
        data?.lines ?? [],
        accounts as AccAccount[],
        cashCodes,
        cashBalanceOf(before?.lines ?? [], cashCodes),
      ),
    [data?.entries, data?.lines, before?.lines, accounts, cashCodes],
  );

  const groups: CashFlowGroup[] = ["operating", "investing", "financing"];

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Accounting", "Akuntansi")}
        title={t("Cash Flow Statement", "Laporan Arus Kas")}
        action={<PrintButton />}
      />
      <div className="flex flex-wrap items-end gap-2 no-print">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Opening cash", "Kas awal")} value={formatMoney(result.opening, lang)} />
        <StatCard
          label={t("Net change", "Perubahan bersih")}
          value={formatMoney(result.netChange, lang)}
          tone={result.netChange >= 0 ? "text-emerald-600" : "text-destructive"}
        />
        <StatCard label={t("Closing cash", "Kas akhir")} value={formatMoney(result.closing, lang)} />
      </div>

      {isLoading && (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading &&
        groups.map((g) => {
          const rows = result.rows.filter((r) => r.group === g);
          return (
            <div key={g} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-navy dark:text-primary-foreground">
                <span>{lang === "id" ? CASH_FLOW_GROUP_LABEL[g].id_ : CASH_FLOW_GROUP_LABEL[g].en}</span>
                <span className={cn(result.totals[g] >= 0 ? "text-emerald-600" : "text-destructive")}>
                  {formatMoney(result.totals[g], lang)}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t("Code", "Kode")}</TableHead>
                    <TableHead>{t("Account", "Akun")}</TableHead>
                    <TableHead className="text-right">{t("Cash in", "Kas masuk")}</TableHead>
                    <TableHead className="text-right">{t("Cash out", "Kas keluar")}</TableHead>
                    <TableHead className="text-right">{t("Net", "Bersih")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        {t("No cash movement.", "Tidak ada mutasi kas.")}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={`${r.group}-${r.code}`}>
                      <TableCell className="text-muted-foreground">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right">{r.inflow ? formatMoney(r.inflow, lang) : "—"}</TableCell>
                      <TableCell className="text-right">{r.outflow ? formatMoney(r.outflow, lang) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(r.net, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
    </div>
  );
}

function EquityChangesView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const { data: accounts = [] } = useAccounts(workspaceId);
  const { data, isLoading } = useLedger(workspaceId, from, to);
  const { data: before } = useLedger(workspaceId, "", previousDay(from));

  const statement = useMemo(
    () => buildEquityStatement(before?.lines ?? [], data?.lines ?? [], accounts as AccAccount[]),
    [before?.lines, data?.lines, accounts],
  );

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Accounting", "Akuntansi")}
        title={t("Changes in Equity", "Perubahan Ekuitas")}
        action={<PrintButton />}
      />
      <div className="flex flex-wrap items-end gap-2 no-print">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Opening equity", "Ekuitas awal")} value={formatMoney(statement.openingTotal, lang)} />
        <StatCard
          label={t("Result for the period", "Laba periode berjalan")}
          value={formatMoney(statement.netIncome, lang)}
          tone={statement.netIncome >= 0 ? "text-emerald-600" : "text-destructive"}
        />
        <StatCard label={t("Closing equity", "Ekuitas akhir")} value={formatMoney(statement.closingTotal, lang)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Equity account", "Akun ekuitas")}</TableHead>
              <TableHead className="text-right">{t("Opening", "Saldo awal")}</TableHead>
              <TableHead className="text-right">{t("Movement", "Mutasi")}</TableHead>
              <TableHead className="text-right">{t("Closing", "Saldo akhir")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !statement.rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t("No equity accounts posted yet.", "Belum ada pencatatan pada akun ekuitas.")}
                </TableCell>
              </TableRow>
            )}
            {statement.rows.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{formatMoney(r.opening, lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.movement, lang)}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(r.closing, lang)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2}>{t("Result for the period", "Laba periode berjalan")}</TableCell>
              <TableCell className="text-right">—</TableCell>
              <TableCell className="text-right">{formatMoney(statement.netIncome, lang)}</TableCell>
              <TableCell className="text-right font-medium">{formatMoney(statement.netIncome, lang)}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell colSpan={2}>{t("Total equity", "Total ekuitas")}</TableCell>
              <TableCell className="text-right">{formatMoney(statement.openingTotal, lang)}</TableCell>
              <TableCell className="text-right">{formatMoney(statement.movementTotal + statement.netIncome, lang)}</TableCell>
              <TableCell className="text-right">{formatMoney(statement.closingTotal, lang)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ----------------------------- period closing ----------------------------- */

function PeriodClosingView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { balances } = useBalances(workspaceId, from, to);
  const { data } = useLedger(workspaceId, from, to);

  const revenue = balances.filter((b) => b.type === "revenue" && Math.abs(b.balance) > 0.5);
  const expense = balances.filter((b) => b.type === "expense" && Math.abs(b.balance) > 0.5);
  const totalRevenue = revenue.reduce((s, b) => s + b.balance, 0);
  const totalExpense = expense.reduce((s, b) => s + b.balance, 0);
  const net = totalRevenue - totalExpense;

  const alreadyClosed = (data?.entries ?? []).some((e) => e.source_type === "period_closing");

  const close = useMutation({
    mutationFn: async () => {
      const lines: ManualLineInput[] = [
        ...revenue.map((r) => ({ account_code: r.code, account_name: r.name, description: t("Closing revenue", "Tutup pendapatan"), debit: r.balance, credit: 0 })),
        ...expense.map((r) => ({ account_code: r.code, account_name: r.name, description: t("Closing expense", "Tutup beban"), debit: 0, credit: r.balance })),
        {
          account_code: RETAINED_EARNINGS.code,
          account_name: RETAINED_EARNINGS.name,
          description: t("Period result", "Hasil periode"),
          debit: net < 0 ? -net : 0,
          credit: net > 0 ? net : 0,
        },
      ];
      await postManualEntry(workspaceId, {
        entry_no: `CLS/${to}`,
        entry_date: to,
        memo: `${t("Period closing", "Tutup periode")} ${from} — ${to}`,
        lines,
      });
    },
    onSuccess: () => {
      toast.success(t("Period closed and posted to retained earnings", "Periode ditutup dan dipindahkan ke laba ditahan"));
      qc.invalidateQueries({ queryKey: ["acc-ledger", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header kicker={t("Accounting", "Akuntansi")} title={t("Period Closing", "Tutup Periode")} />
      <div className="flex flex-wrap items-end gap-2">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Button
          variant="navy"
          className="h-9"
          disabled={close.isPending || (!revenue.length && !expense.length)}
          onClick={() => close.mutate()}
        >
          {close.isPending && <Loader2 className="animate-spin" />} {t("Post closing entry", "Catat jurnal penutup")}
        </Button>
      </div>

      {alreadyClosed && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {t("A closing entry already exists in this range.", "Sudah ada jurnal penutup pada rentang ini.")}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Revenue", "Pendapatan")} value={formatMoney(totalRevenue, lang)} />
        <StatCard label={t("Expenses", "Beban")} value={formatMoney(totalExpense, lang)} />
        <StatCard
          label={t("Result to retained earnings", "Hasil ke laba ditahan")}
          value={formatMoney(net, lang)}
          tone={net >= 0 ? "text-emerald-600" : "text-destructive"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSection title={t("Revenue accounts to close", "Akun pendapatan yang ditutup")} rows={revenue} total={totalRevenue} />
        <StatementSection title={t("Expense accounts to close", "Akun beban yang ditutup")} rows={expense} total={totalExpense} />
      </div>
    </div>
  );
}

/* --------------------------------- router --------------------------------- */

function OpeningBalanceView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [term, setTerm] = useState("");
  const [values, setValues] = useState<Record<string, { debit: string; credit: string }>>({});
  const [autoBalance, setAutoBalance] = useState(true);
  const [check, setCheck] = useState<OpeningBalanceCheck | null>(null);

  const { data: accounts = [], isLoading } = useAccounts(workspaceId);
  const { data: existing = [] } = useQuery({
    queryKey: ["acc-opening", workspaceId],
    queryFn: () => fetchOpeningBalances(workspaceId),
  });

  const filtered = accounts.filter((a) => {
    if (!term.trim()) return true;
    const s = term.trim().toLowerCase();
    return a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s);
  });

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    Object.values(values).forEach((v) => {
      debit += Number(v.debit) || 0;
      credit += Number(v.credit) || 0;
    });
    return { debit, credit, diff: debit - credit };
  }, [values]);

  const patch = (code: string, p: Partial<{ debit: string; credit: string }>) =>
    setValues((prev) => ({ ...prev, [code]: { ...{ debit: "", credit: "" }, ...prev[code], ...p } }));

  const post = useMutation({
    mutationFn: async () => {
      const lines: ManualLineInput[] = accounts
        .map((a) => {
          const v = values[a.code];
          const debit = Number(v?.debit) || 0;
          const credit = Number(v?.credit) || 0;
          return {
            account_code: a.code,
            account_name: a.name,
            description: t("Opening balance", "Saldo awal"),
            debit,
            credit,
          };
        })
        .filter((l) => l.debit > 0.0001 || l.credit > 0.0001);

      if (!lines.length) throw new Error(t("Enter at least one balance.", "Isi minimal satu saldo."));
      if (!date) throw new Error(t("Choose the opening balance date.", "Pilih tanggal saldo awal."));

      const diff = lines.reduce((s, l) => s + l.debit - l.credit, 0);
      if (Math.abs(diff) > 0.5) {
        if (!autoBalance) throw new Error(t("Debit and credit must balance.", "Debit dan kredit harus seimbang."));
        lines.push({
          account_code: RETAINED_EARNINGS.code,
          account_name: RETAINED_EARNINGS.name,
          description: t("Opening balance difference", "Selisih saldo awal"),
          debit: diff < 0 ? -diff : 0,
          credit: diff > 0 ? diff : 0,
        });
      }

      const entryId = await postManualEntry(workspaceId, {
        entry_no: `OB/${date}`,
        entry_date: date,
        memo: `${t("Opening balance", "Saldo awal")} ${date}`,
        lines,
        source_type: OPENING_BALANCE_SOURCE,
      });

      // automatic assurance: prove the entry reached the general ledger for this period
      return verifyOpeningBalance(workspaceId, entryId, lines);
    },
    onSuccess: (result) => {
      setCheck(result);
      if (result.ok) {
        toast.success(
          t("Opening balance posted and verified in the ledger", "Saldo awal tercatat dan terverifikasi di buku besar"),
        );
      } else {
        toast.error(
          t("Opening balance posted but verification failed", "Saldo awal tercatat tetapi verifikasi gagal"),
        );
      }
      setValues({});
      void qc.invalidateQueries({ queryKey: ["acc-opening", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["acc-ledger", workspaceId] });
      // opening balance is a real journal entry — refresh every GL-derived view
      void qc.invalidateQueries({ queryKey: ["acc-accounts", workspaceId] });
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("acc-") });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (entryId: string) => verifyOpeningBalance(workspaceId, entryId),
    onSuccess: (result) => {
      setCheck(result);
      if (result.ok) toast.success(t("Ledger matches the opening balance", "Buku besar sesuai saldo awal"));
      else toast.error(t("Verification found differences", "Verifikasi menemukan selisih"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (entryId: string) => rollbackOpeningBalance(workspaceId, entryId),
    onSuccess: () => {
      setCheck(null);
      toast.success(t("Opening balance rolled back", "Saldo awal dibatalkan"));
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("acc-") });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Header
        kicker={t("Accounting", "Akuntansi")}
        title={t("Opening Balance", "Saldo Awal")}
        action={
          <Button variant="navy" disabled={post.isPending} onClick={() => post.mutate()}>
            {post.isPending && <Loader2 className="animate-spin" />} {t("Post opening balance", "Catat saldo awal")}
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        {t(
          "Enter the starting balance of each account when you go live. It is posted as a single journal entry.",
          "Isi saldo awal tiap akun saat mulai memakai sistem. Tercatat sebagai satu jurnal.",
        )}
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
        <div>
          <Label className="text-xs text-muted-foreground">{t("As of date", "Per tanggal")}</Label>
          <Input type="date" className="mt-1 h-9 w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-60 pl-9"
            placeholder={t("Search account…", "Cari akun…")}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-current"
            checked={autoBalance}
            onChange={(e) => setAutoBalance(e.target.checked)}
          />
          {t("Balance difference to retained earnings", "Selisih dibawa ke laba ditahan")}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("Total debit", "Total debit")} value={formatMoney(totals.debit, lang)} />
        <StatCard label={t("Total credit", "Total kredit")} value={formatMoney(totals.credit, lang)} />
        <StatCard
          label={t("Difference", "Selisih")}
          value={formatMoney(totals.diff, lang)}
          tone={Math.abs(totals.diff) < 0.5 ? "text-emerald-600" : "text-amber-600"}
        />
      </div>

      {existing.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-navy dark:text-primary-foreground">
            {t("Posted opening balances", "Saldo awal tercatat")}
          </p>
          {existing.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
              <span className="text-sm">
                <span className="font-mono text-xs">{e.entry_no}</span> · {e.entry_date} ·{" "}
                {formatMoney(Number(e.total_debit), lang)}
              </span>
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate(e.id)}
                >
                  {t("Verify in ledger", "Verifikasi buku besar")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={rollback.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          `Roll back ${e.entry_no}? The journal entry and its ledger impact are removed.`,
                          `Batalkan ${e.entry_no}? Jurnal dan dampaknya di buku besar akan dihapus.`,
                        ),
                      )
                    )
                      rollback.mutate(e.id);
                  }}
                >
                  <Trash2 /> {t("Roll back", "Batalkan")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {check && (
        <div
          className={cn(
            "space-y-3 rounded-2xl border p-4",
            check.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/10",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-navy dark:text-primary-foreground">
              {check.ok
                ? t(
                    `Verified — ${check.entryNo} is reflected in the general ledger as of ${check.entryDate}.`,
                    `Terverifikasi — ${check.entryNo} sudah tercermin di buku besar per ${check.entryDate}.`,
                  )
                : t(
                    `Verification failed for ${check.entryNo}.`,
                    `Verifikasi gagal untuk ${check.entryNo}.`,
                  )}
            </p>
            {!check.ok && (
              <Button
                size="sm"
                variant="destructive"
                disabled={rollback.isPending}
                onClick={() => rollback.mutate(check.entryId)}
              >
                {rollback.isPending && <Loader2 className="animate-spin" />} {t("Roll back", "Batalkan")}
              </Button>
            )}
          </div>
          {check.issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
              {check.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">{t("Code", "Kode")}</TableHead>
                  <TableHead>{t("Account", "Akun")}</TableHead>
                  <TableHead className="text-right">{t("Entered", "Diinput")}</TableHead>
                  <TableHead className="text-right">{t("Posted", "Tercatat")}</TableHead>
                  <TableHead className="text-right">{t("Ledger impact", "Dampak buku besar")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {check.rows.map((r) => (
                  <TableRow key={r.code} className={cn(!r.ok && "bg-amber-500/10")}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{formatMoney(r.expected, lang)}</TableCell>
                    <TableCell className="text-right">{formatMoney(r.posted, lang)}</TableCell>
                    <TableCell className="text-right">{formatMoney(r.ledgerDelta, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t("Code", "Kode")}</TableHead>
              <TableHead>{t("Account", "Akun")}</TableHead>
              <TableHead className="w-32">{t("Type", "Tipe")}</TableHead>
              <TableHead className="w-40 text-right">{t("Debit", "Debit")}</TableHead>
              <TableHead className="w-40 text-right">{t("Credit", "Kredit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-sm text-muted-foreground">
                  {t("Loading…", "Memuat…")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-sm text-muted-foreground">
                  {t("No accounts in the chart of accounts yet.", "Belum ada akun di bagan akun.")}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((a) => (
              <TableRow key={a.code}>
                <TableCell className="font-mono text-xs">{a.code}</TableCell>
                <TableCell>{a.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {lang === "id"
                    ? ACCOUNT_TYPE_LABEL[a.account_type].id_
                    : ACCOUNT_TYPE_LABEL[a.account_type].en}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="any"
                    className="h-9 text-right"
                    value={values[a.code]?.debit ?? ""}
                    onChange={(e) => patch(a.code, { debit: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="any"
                    className="h-9 text-right"
                    value={values[a.code]?.credit ?? ""}
                    onChange={(e) => patch(a.code, { credit: e.target.value })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AccountingView({ entity, workspaceId }: { entity: AccEntity; workspaceId: string }) {
  switch (entity.submoduleId) {
    case "opening-balance":
      return <OpeningBalanceView workspaceId={workspaceId} />;
    case "journals":
      return <JournalsView workspaceId={workspaceId} />;
    case "ledger":
      return <LedgerView workspaceId={workspaceId} />;
    case "trial-balance":
      return <TrialBalanceView workspaceId={workspaceId} />;
    case "balance-sheet":
      return <BalanceSheetView workspaceId={workspaceId} />;
    case "profit-loss":
      return <ProfitLossView workspaceId={workspaceId} />;
    case "cash-flow":
      return <CashFlowView workspaceId={workspaceId} />;
    case "equity-changes":
      return <EquityChangesView workspaceId={workspaceId} />;
    case "period-closing":
      return <PeriodClosingView workspaceId={workspaceId} />;
    default:
      return null;
  }
}
