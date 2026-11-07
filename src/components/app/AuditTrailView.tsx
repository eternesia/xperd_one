import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLogs, type AuditLogRow } from "@/lib/audit.functions";
import { useI18n } from "@/lib/i18n";

/**
 * Ronde 31 (parity BS New 8/10): **Audit Trail** — siapa mengubah apa, kapan.
 *
 * New 8/10 mengisi tabel ini lewat trigger Postgres; di repo ini jejaknya ditulis
 * lapisan aplikasi (`src/lib/data.functions.ts`) sehingga tetap tanpa trigger.
 * Hanya owner/admin yang bisa membacanya (dijaga server fn `listAuditLogs`).
 */
const TABLES: Record<string, [string, string]> = {
  sls_documents: ["Sales document", "Dokumen penjualan"],
  prc_documents: ["Purchase document", "Dokumen pembelian"],
  acc_journal_entries: ["Journal entry", "Jurnal"],
  cb_transactions: ["Cash & bank transaction", "Transaksi kas & bank"],
  cb_accounts: ["Cash & bank account", "Akun kas & bank"],
  acc_period_locks: ["Period lock", "Kunci periode"],
  inv_movements: ["Stock movement", "Mutasi stok"],
  fa_assets: ["Fixed asset", "Aset tetap"],
  md_items: ["Item", "Item"],
  md_customers: ["Customer", "Pelanggan"],
  md_suppliers: ["Supplier", "Pemasok"],
  md_accounts: ["Chart of account", "Bagan akun"],
  md_taxes: ["Tax", "Pajak"],
  md_currencies: ["Currency", "Mata uang"],
  md_exchange_rates: ["Exchange rate", "Kurs"],
  hr_payroll_runs: ["Payroll run", "Payroll"],
  workspace_members: ["Team member", "Anggota tim"],
  workspace_role_access: ["Role access", "Akses role"],
  crm_scheduled_posts: ["Social post", "Postingan sosial"],
  crm_leads: ["Lead", "Prospek"],
  crm_post_approvals: ["Client approval", "Persetujuan klien"],
  crm_report_links: ["Client report link", "Link laporan klien"],
  crm_client_groups: ["Client / brand", "Klien / brand"],
};

const ACTIONS: Record<string, [string, string, "default" | "secondary" | "destructive"]> = {
  INSERT: ["Created", "Dibuat", "default"],
  UPDATE: ["Changed", "Diubah", "secondary"],
  DELETE: ["Deleted", "Dihapus", "destructive"],
};

const ALL = "__all";
const PAGE = 25;

export function AuditTrailView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [table, setTable] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<AuditLogRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", workspaceId, table, action, search, from, to, page],
    queryFn: () =>
      listAuditLogs({
        data: {
          workspaceId,
          table: table === ALL ? undefined : table,
          action: action === ALL ? undefined : action,
          search: search.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: PAGE,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));
  const reset = () => setPage(0);

  return (
    <div className="space-y-5" data-testid="audit-trail-view">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">
          {t("ACCOUNTING", "AKUNTANSI")}
        </p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-navy dark:text-primary-foreground">
          <ShieldCheck className="h-6 w-6 text-gold" /> Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Every create, change and delete on financial and master data — who, when and what changed. Visible to Owner/Admin.",
            "Setiap pembuatan, perubahan, dan penghapusan data keuangan & master — siapa, kapan, dan apa yang berubah. Hanya Owner/Admin.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="h-9 w-56"
          placeholder={t("Search doc no. / user", "Cari no. dokumen / user")}
          value={search}
          data-testid="audit-search"
          onChange={(e) => {
            setSearch(e.target.value);
            reset();
          }}
        />
        <Select
          value={table}
          onValueChange={(v) => {
            setTable(v);
            reset();
          }}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("All data", "Semua data")}</SelectItem>
            {Object.entries(TABLES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {t(v[0], v[1])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v);
            reset();
          }}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("All actions", "Semua aksi")}</SelectItem>
            {Object.entries(ACTIONS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {t(v[0], v[1])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="h-9 w-40"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            reset();
          }}
        />
        <Input
          type="date"
          className="h-9 w-40"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            reset();
          }}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Time", "Waktu")}</TableHead>
              <TableHead>{t("User", "Pengguna")}</TableHead>
              <TableHead>{t("Action", "Aksi")}</TableHead>
              <TableHead>{t("Data", "Data")}</TableHead>
              <TableHead>{t("Reference", "Referensi")}</TableHead>
              <TableHead>{t("Changed fields", "Kolom berubah")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !error && !rows.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {t("No activity recorded yet.", "Belum ada aktivitas tercatat.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => {
              const a = ACTIONS[r.action] ?? [r.action, r.action, "secondary" as const];
              const tb = TABLES[r.table_name];
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="text-muted-foreground">{page * PAGE + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.created_at.replace(" ", "T")).toLocaleString(
                      lang === "id" ? "id-ID" : "en-US",
                    )}
                  </TableCell>
                  <TableCell>{r.actor_email ?? t("System", "Sistem")}</TableCell>
                  <TableCell>
                    <Badge variant={a[2]}>{t(a[0], a[1])}</Badge>
                  </TableCell>
                  <TableCell>{tb ? t(tb[0], tb[1]) : r.table_name}</TableCell>
                  <TableCell className="font-medium">{r.doc_ref ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                    {r.changed_fields?.join(", ") ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("Page", "Halaman")} {page + 1} / {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          ‹
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          ›
        </Button>
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.doc_ref ?? open?.record_id}</DialogTitle>
          </DialogHeader>
          {open && <Diff log={open} t={t} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Diff({ log, t }: { log: AuditLogRow; t: (en: string, id: string) => string }) {
  const keys =
    log.action === "UPDATE" && log.changed_fields?.length
      ? log.changed_fields
      : Object.keys(log.new_data ?? log.old_data ?? {});
  const show = (v: unknown) =>
    v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Field", "Kolom")}</TableHead>
          <TableHead>{t("Before", "Sebelum")}</TableHead>
          <TableHead>{t("After", "Sesudah")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((k) => (
          <TableRow key={k}>
            <TableCell className="font-mono text-xs">{k}</TableCell>
            <TableCell className="break-all text-xs text-muted-foreground">
              {show(log.old_data?.[k])}
            </TableCell>
            <TableCell className="break-all text-xs">{show(log.new_data?.[k])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
