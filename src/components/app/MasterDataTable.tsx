import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConsistencyReport } from "@/lib/consistency.functions";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import type { MDEntity, MDField } from "@/lib/master-data";
import { NON_STOCK_ITEM_TYPES } from "@/lib/master-data";

type Row = Record<string, unknown>;

const PAGE_SIZES = [10, 25, 50, 100];

function emptyForm(entity: MDEntity): Row {
  const out: Row = {};
  entity.fields.forEach((f) => {
    out[f.key] = f.defaultValue ?? (f.type === "boolean" ? true : f.type === "number" ? 0 : f.type === "date" ? new Date().toISOString().slice(0, 10) : "");
  });
  return out;
}

/** #41: field kondisional (barcode, min. stok, siklus penagihan) mengikuti tipe item. */
function isVisible(field: MDField, values: Row) {
  if (!field.showWhen) return true;
  return field.showWhen.values.includes(String(values[field.showWhen.key] ?? ""));
}

/** #41: dropdown yang diisi dari tabel master lain (kategori, satuan ukur, dll.). */
function ReferenceSelect({
  field,
  workspaceId,
  value,
  onChange,
}: {
  field: MDField;
  workspaceId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const { data = [], isLoading } = useQuery({
    queryKey: ["md-ref", field.refTable, workspaceId],
    enabled: Boolean(field.refTable),
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: field.refTable!,
          workspaceId,
          orderBy: "code",
          orderDir: "asc",
          limit: 500,
          filters: { is_active: 1 },
        },
      });
      return (res?.rows ?? []) as unknown as { code: string; name: string }[];
    },
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? t("Loading…", "Memuat…") : t("Select…", "Pilih…")} />
      </SelectTrigger>
      <SelectContent>
        {!data.length && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {t("No master records yet.", "Belum ada data master.")}
          </div>
        )}
        {data.map((o) => (
          <SelectItem key={o.code} value={o.code}>
            {o.code} · {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SampleDataBanner({ workspaceId }: { workspaceId: string }) {
  const run = useServerFn(getConsistencyReport);
  const q = useQuery({ queryKey: ["sample-data", workspaceId], staleTime: 60_000, queryFn: () => run({ data: { workspaceId, only: ["placeholder", "zeroprice"] } }) });
  const items = (q.data?.checks ?? []).filter((c) => c.status === "warn" || c.status === "info");
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="font-medium">Data item belum final</p>
      <ul className="mt-1 list-disc pl-5">{items.map((c) => <li key={c.id}>{c.summary}{c.rows?.length ? ` — contoh: ${c.rows.slice(0, 3).map((r) => r.label).join(", ")}` : ""}</li>)}</ul>
    </div>
  );
}

export function MasterDataTable({ entity, workspaceId }: { entity: MDEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const label = (f: MDField) => (lang === "id" ? f.id_ : f.en);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Row>(() => emptyForm(entity));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const columns = useMemo(() => entity.fields.filter((f) => f.inTable), [entity]);
  const visibleFields = useMemo(() => entity.fields.filter((f) => isVisible(f, form)), [entity, form]);
  const queryKey = ["md", entity.table, workspaceId, page, pageSize, search];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const data = await listWorkspaceRows({
        data: {
          table: entity.table,
          workspaceId,
          search: search.trim() || undefined,
          orderBy: "code",
          orderDir: "asc",
          limit: pageSize,
          offset: from,
        },
      });
      return { rows: (data?.rows ?? []) as Row[], count: data?.count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** #41: prefix kode berjalan, mengikuti tipe item bila entity mendefinisikannya. */
  const prefixOf = (values: Row) => {
    const cfg = entity.codePrefixByType;
    if (cfg) return cfg.map[String(values[cfg.field] ?? "")] ?? entity.codePrefix ?? "";
    return entity.codePrefix ?? "";
  };

  /** #41: kode berurutan berikutnya (mis. ITM-0007) dari kode tertinggi yang ada. */
  const nextCode = async (prefix: string) => {
    if (!prefix) return "";
    const res = await listWorkspaceRows({
      data: {
        table: entity.table,
        workspaceId,
        search: `${prefix}-`,
        orderBy: "code",
        orderDir: "desc",
        limit: 100,
      },
    });
    const seq = ((res?.rows ?? []) as unknown as { code?: string }[]).reduce((max, r) => {
      const c = String(r.code ?? "");
      if (!c.startsWith(`${prefix}-`)) return max;
      return Math.max(max, Number(c.slice(prefix.length + 1)) || 0);
    }, 0);
    return `${prefix}-${String(seq + 1).padStart(4, "0")}`;
  };

  /**
   * #41: satu pintu untuk perubahan form supaya field turunan tetap konsisten —
   * tipe item menentukan `is_stocked` dan mematikan min. stok/barcode, dan prefix
   * kode ikut berubah (ITM/SRV/SFT/SUB) saat tipenya diganti.
   */
  const setField = (key: string, value: unknown) => {
    setForm((prev) => {
      const next: Row = { ...prev, [key]: value };
      if (entity.table === "md_items" && key === "item_type") {
        const stocked = !NON_STOCK_ITEM_TYPES.includes(String(value));
        next.is_stocked = stocked;
        if (!stocked) {
          next.min_stock = 0;
          next.barcode = "";
        }
        if (!editingId) {
          void nextCode(prefixOf(next)).then((c) => {
            if (c) setForm((cur) => ({ ...cur, code: c }));
          });
        }
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload: Row = { workspace_id: workspaceId };
      entity.fields.forEach((f) => {
        // #41: field yang disembunyikan (mis. min. stok untuk jasa) dikembalikan ke default
        const hidden = !isVisible(f, values);
        const v = hidden ? f.defaultValue : values[f.key];
        if (f.type === "number") payload[f.key] = Number(v) || 0;
        else if (f.type === "boolean") payload[f.key] = Boolean(v);
        else payload[f.key] = v === "" || v === undefined ? null : v;
      });
      await saveWorkspaceRow({
        data: { table: entity.table, workspaceId, id: editingId ?? undefined, data: payload },
      });
    },
    onSuccess: () => {
      toast.success(t("Saved", "Tersimpan"));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["md", entity.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: entity.table, workspaceId, id } });
    },
    onSuccess: () => {
      toast.success(t("Deleted", "Terhapus"));
      void qc.invalidateQueries({ queryKey: ["md", entity.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const header = entity.fields.map((f) => f.key);
    const sample: Row = {};
    entity.fields.forEach((f) => {
      sample[f.key] = f.type === "boolean" ? "TRUE" : f.type === "number" ? 0 : f.key === "code" ? "SAMPLE-001" : "";
    });
    const ws = XLSX.utils.json_to_sheet([sample], { header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, entity.submoduleId);
    XLSX.writeFile(wb, `${entity.submoduleId}-template.xlsx`);
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!raw.length) throw new Error(t("The file has no rows.", "Berkas tidak berisi baris data."));

      const payloads = raw
        .map((r) => {
          const norm: Record<string, unknown> = {};
          Object.entries(r).forEach(([k, v]) => {
            norm[String(k).trim().toLowerCase().replace(/\s+/g, "_")] = v;
          });
          const out: Row = { workspace_id: workspaceId };
          entity.fields.forEach((f) => {
            const v = norm[f.key];
            if (f.type === "number") out[f.key] = Number(v) || 0;
            else if (f.type === "boolean")
              out[f.key] = v === "" || v === undefined ? true : ["true", "1", "yes", "ya", "aktif"].includes(String(v).toLowerCase());
            else out[f.key] = v === "" || v === undefined ? null : String(v);
          });
          return out;
        })
        .filter((p) => p.code && p.name);

      if (!payloads.length)
        throw new Error(t("No valid rows: code and name are required.", "Tidak ada baris valid: kolom code dan name wajib diisi."));

      await upsertWorkspaceRows({ data: { table: entity.table, workspaceId, rows: payloads } });
      toast.success(t(`${payloads.length} rows imported`, `${payloads.length} baris diimpor`));
      setPage(1);
      void qc.invalidateQueries({ queryKey: ["md", entity.table] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Import failed", "Impor gagal"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function renderCell(f: MDField, row: Row) {
    const v = row[f.key];
    if (f.type === "boolean")
      return (
        <Badge variant={v ? "default" : "secondary"}>
          {v ? t("Active", "Aktif") : t("Inactive", "Nonaktif")}
        </Badge>
      );
    if (f.type === "select") {
      const opt = f.options?.find((o) => o.value === v);
      return opt ? (lang === "id" ? opt.id_ : opt.en) : "—";
    }
    if (f.type === "number") return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US").format(Number(v ?? 0));
    // Ronde 29 (BS New 8): field tanggal (mis. Tanggal Kurs) tampil terformat.
    if (f.type === "date")
      return v
        ? new Date(String(v)).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—";
    return v ? String(v) : "—";
  }

  return (
    <div className="space-y-4">
      {entity.table === "md_items" && <SampleDataBanner workspaceId={workspaceId} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">MASTER DATA</p>
          <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">
            {lang === "id" ? entity.id_ : entity.en}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} {t("records", "data")}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-full pl-9 sm:w-56"
              placeholder={t("Search code or name…", "Cari kode atau nama…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download /> {t("Template", "Template")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
            }}
          />
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="animate-spin" /> : <Upload />} {t("Import Excel", "Impor Excel")}
          </Button>
          <Button
            variant="navy"
            onClick={() => {
              const blank = emptyForm(entity);
              setEditingId(null);
              setForm(blank);
              setOpen(true);
              // #41: kode item dibuat otomatis, jadi langsung diisi saat form dibuka
              void nextCode(prefixOf(blank)).then((c) => {
                if (c) setForm((cur) => ({ ...cur, code: c }));
              });
            }}
          >
            <Plus /> {t("New", "Tambah")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">#</TableHead>
              {columns.map((f) => (
                <TableHead key={f.key}>{label(f)}</TableHead>
              ))}
              <TableHead className="text-right">{t("Actions", "Aksi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="text-sm text-muted-foreground">
                  {t("Loading…", "Memuat…")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                  {t("No records yet. Add one or import from Excel.", "Belum ada data. Tambah manual atau impor dari Excel.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={String(row.id)}>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {(page - 1) * pageSize + i + 1}
                </TableCell>
                {columns.map((f) => (
                  <TableCell key={f.key} className="max-w-[240px] truncate text-sm">
                    {renderCell(f, row)}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("Edit", "Ubah")}
                    onClick={() => {
                      const next = emptyForm(entity);
                      entity.fields.forEach((f) => {
                        next[f.key] = row[f.key] ?? next[f.key];
                      });
                      setForm(next);
                      setEditingId(String(row.id));
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("Delete", "Hapus")}
                    onClick={() => {
                      if (confirm(t(`Delete "${row.code}"?`, `Hapus "${row.code}"?`))) remove.mutate(String(row.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Rows per page", "Baris per halaman")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20">
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
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("Page", "Halaman")} {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("Edit record", "Ubah data") : t("New record", "Data baru")} ·{" "}
              {lang === "id" ? entity.id_ : entity.en}
            </DialogTitle>
            <DialogDescription>
              {t("Fields marked required must be filled.", "Kolom bertanda wajib harus diisi.")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            {visibleFields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {/* Ronde 31 (parity live): field berkode otomatis tetap menampilkan tanda wajib ("Code *"). */}
                  {label(f)} {f.required && <span className="text-destructive">*</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                ) : f.type === "boolean" ? (
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={Boolean(form[f.key])}
                      disabled={f.readOnly}
                      onCheckedChange={(v) => setField(f.key, v)}
                    />
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    value={String(form[f.key] ?? "")}
                    onValueChange={(v) => setField(f.key, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {lang === "id" ? o.id_ : o.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "reference" ? (
                  <ReferenceSelect
                    field={f}
                    workspaceId={workspaceId}
                    value={String(form[f.key] ?? "")}
                    onChange={(v) => setField(f.key, v)}
                  />
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    required={f.required && !f.readOnly}
                    readOnly={f.readOnly}
                    className={f.readOnly ? "bg-muted font-medium" : undefined}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                )}
                {(lang === "id" ? f.helpId : f.helpEn) && (
                  <p className="text-xs text-muted-foreground">{lang === "id" ? f.helpId : f.helpEn}</p>
                )}
              </div>
            ))}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("Cancel", "Batal")}
              </Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? t("Saving…", "Menyimpan…") : t("Save", "Simpan")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
