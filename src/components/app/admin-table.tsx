import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Client-side search + pagination shared by Super Admin tables. */
export function usePaged<T>(rows: T[], text?: (row: T) => string, pageSize = 10) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !text) return rows;
    return rows.filter((r) => text(r).toLowerCase().includes(q));
  }, [rows, query, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [page, pages]);
  useEffect(() => setPage(0), [query]);
  const current = Math.min(page, pages - 1);
  return {
    query,
    setQuery,
    page: current,
    setPage,
    pages,
    total: filtered.length,
    pageSize,
    rows: filtered.slice(current * pageSize, current * pageSize + pageSize),
  };
}

export function TableSearch({
  value,
  onChange,
  placeholder = "Cari…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function TablePager({
  page,
  pages,
  total,
  pageSize,
  setPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  setPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-16 text-center">
          {page + 1} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= pages - 1}
          onClick={() => setPage(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Generic search text: every field of the row. */
export const rowText = (row: unknown) => JSON.stringify(row ?? "");
