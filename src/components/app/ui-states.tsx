/**
 * Helper presentasi bersama: tombol ekspor laporan, skeleton pemuatan, dan
 * kontrol paginasi. Diporting dari `components/app/ui-states.tsx` BS New 3 (#47)
 * agar layar daftar/laporan lintas modul punya perilaku yang sama.
 *
 * Catatan porting: berkas ini tidak menyentuh lapisan data (tidak ada Supabase),
 * jadi bisa disalin utuh. Tabel/ekspor memakai helper Old (`lib/report-export.ts`).
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Search, Sheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { exportTablePdf, exportTableXlsx, type TableExport } from "@/lib/report-export";
import { cn } from "@/lib/utils";

/* ------------------------------ export buttons ----------------------------- */

export function ReportExportButtons({
  build,
  size = "sm",
}: {
  build: () => TableExport;
  size?: "sm" | "default";
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const run = async (kind: "xlsx" | "pdf") => {
    try {
      const payload = build();
      if (!payload.rows.length) {
        toast.error(t("Nothing to export.", "Tidak ada data untuk diekspor."));
        return;
      }
      if (kind === "xlsx") await exportTableXlsx(payload);
      else await exportTablePdf(payload);
    } catch {
      toast.error(t("Export failed.", "Ekspor gagal."));
    }
  };
  return (
    <div className="flex gap-2 no-print">
      <Button variant="outline" size={size} onClick={() => run("xlsx")}>
        <Sheet className="mr-2 h-4 w-4" /> Excel
      </Button>
      <Button variant="outline" size={size} onClick={() => run("pdf")}>
        <FileDown className="mr-2 h-4 w-4" /> PDF
      </Button>
    </div>
  );
}

/* --------------------------------- loading -------------------------------- */

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Baris skeleton yang dirender di dalam `TableBody` yang sudah ada. */
export function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Shimmer className={cn("h-4", c === 0 ? "w-8" : c % 3 === 0 ? "w-20" : "w-32")} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Placeholder satu halaman penuh: judul, kartu statistik, dan kerangka tabel. */
export function PageSkeleton({ stats = 3, columns = 6, rows = 6 }: { stats?: number; columns?: number; rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-7 w-64" />
      </div>
      {stats > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <Shimmer className="h-3 w-20" />
              <Shimmer className="mt-3 h-6 w-32" />
            </div>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableBody>
            <TableSkeletonRows columns={columns} rows={rows} />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------- pagination -------------------------------- */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Helper pemotongan data agar logika paging sama di semua layar. */
export function paginate<T>(rows: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    page: safePage,
    totalPages,
    total: rows.length,
    start,
    items: rows.slice(start, start + perPage),
  };
}

export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  onPage,
  onPerPage,
}: {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm no-print">
      <p className="text-muted-foreground">
        {t(`Showing ${from}-${to} of ${total}`, `Menampilkan ${from}-${to} dari ${total} data`)}
      </p>
      <div className="flex items-center gap-2">
        <Select
          value={String(perPage)}
          onValueChange={(v) => {
            onPerPage(Number(v));
            onPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[88px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / {t("page", "hal")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("Previous page", "Halaman sebelumnya")}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[70px] text-center text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("Next page", "Halaman berikutnya")}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** State paginasi sisi klien untuk layar daftar. */
export function usePagination<T>(rows: T[], initial = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initial);
  useEffect(() => {
    setPage(1);
  }, [rows.length, perPage]);
  const p = paginate(rows, page, perPage);
  return { ...p, perPage, setPage, setPerPage };
}

/** Bar paginasi yang terikat ke hasil `usePagination`. */
export function PaginationBar({ p }: { p: ReturnType<typeof usePagination<unknown>> }) {
  // Parity live: bar tetap tampil walau daftar kosong ("Showing 0-0 of 0").
  return (
    <Pagination
      page={p.page}
      perPage={p.perPage}
      total={p.total}
      totalPages={p.totalPages}
      onPage={p.setPage}
      onPerPage={p.setPerPage}
    />
  );
}

/* --------------------------------- search --------------------------------- */

/** Pencarian teks sisi klien pada field baris yang diberikan. */
export function useSearchFilter<T>(rows: T[], term: string, fields: (row: T) => (string | number | null | undefined)[]) {
  return useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => fields(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, term]);
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { lang } = useI18n();
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="w-56 pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? (lang === "id" ? "Cari…" : "Search…")}
      />
    </div>
  );
}
