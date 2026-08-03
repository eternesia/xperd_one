import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MDEntity, MDField } from "@/lib/master-data";

type Row = Record<string, unknown>;

const PAGE_SIZES = [10, 25, 50, 100];

function emptyForm(entity: MDEntity): Row {
  const out: Row = {};
  entity.fields.forEach((f) => {
    out[f.key] = f.defaultValue ?? (f.type === "boolean" ? true : f.type === "number" ? 0 : "");
  });
  return out;
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
  const queryKey = ["md", entity.table, workspaceId, page, pageSize, search];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      let q = supabase
        .from(entity.table)
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .order("code", { ascending: true })
        .range(from, from + pageSize - 1);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`code.ilike.${s},name.ilike.${s}`);
      }
      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as Row[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload: Row = { workspace_id: workspaceId };
      entity.fields.forEach((f) => {
        const v = values[f.key];
        if (f.type === "number") payload[f.key] = Number(v) || 0;
        else if (f.type === "boolean") payload[f.key] = Boolean(v);
        else payload[f.key] = v === "" || v === undefined ? null : v;
      });
      const { error } = editingId
        ? await supabase.from(entity.table).update(payload as never).eq("id", editingId)
        : await supabase.from(entity.table).insert(payload as never);
      if (error) throw error;
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
      const { error } = await supabase.from(entity.table).delete().eq("id", id);
      if (error) throw error;
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

      const { error } = await supabase
        .from(entity.table)
        .upsert(payloads as never, { onConflict: "workspace_id,code" });
      if (error) throw error;
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
    return v ? String(v) : "—";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">MASTER DATA</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? entity.id_ : entity.en}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} {t("records", "data")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-56 pl-9"
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
              setEditingId(null);
              setForm(emptyForm(entity));
              setOpen(true);
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
            {entity.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label(f)} {f.required && <span className="text-destructive">*</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                ) : f.type === "boolean" ? (
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={Boolean(form[f.key])}
                      onCheckedChange={(v) => setForm({ ...form, [f.key]: v })}
                    />
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    value={String(form[f.key] ?? "")}
                    onValueChange={(v) => setForm({ ...form, [f.key]: v })}
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
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    required={f.required}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
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
