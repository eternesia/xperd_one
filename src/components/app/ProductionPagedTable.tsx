import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationBar, usePagination, searchRows } from './ui-states';

/** Standard Production list: card, row number column, client pagination, action column on the right. */
export function ProductionPagedTable<T>({ rows, headers, row, empty, perPage = 25, searchable = true }: { searchable?: boolean; rows: T[]; headers: ReactNode[]; row: (r: T, no: number) => ReactNode; empty: string; perPage?: number }) {
  const [q, setQ] = useState('');
  const filtered = searchRows(rows, q);
  const p = usePagination(filtered, perPage);
  return (
    <div className="space-y-3">{searchable && <TableSearch value={q} onChange={setQ} />}<div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{headers.map((h, i) => <TableHead key={i} className={i === headers.length - 1 && h === 'Aksi' ? 'text-right' : undefined}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {p.items.map((r, i) => row(r, p.start + i + 1))}
            {!filtered.length && <TableRow><TableCell colSpan={headers.length + 1} className="py-10 text-center text-muted-foreground">{empty}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <PaginationBar p={p as never} />
    </div></div>
  );
}

export function RowNo({ no }: { no: number }) {
  return <TableCell className="text-center text-xs text-muted-foreground">{no}</TableCell>;
}

export function TableSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Cari..." aria-label="Cari di tabel" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
