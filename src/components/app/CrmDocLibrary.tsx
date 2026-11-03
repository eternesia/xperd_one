/**
 * #51 (BS New 3): Pustaka Dokumen Tender — unggah sekali, pakai berulang.
 *
 * Catatan porting ke Old:
 * - Supabase Storage → disk lokal lewat server fn (`lib/files.functions.ts`) dan
 *   rute unduh `/api/workspace-files`; nama berkas & ukuran tetap dicatat di DB.
 * - Lapisan data memakai `listWorkspaceRows`/`upsertWorkspaceRows`/`saveWorkspaceRow`/
 *   `deleteWorkspaceRow` (bukan Supabase).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FolderArchive, History, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { PageSkeleton, PaginationBar, usePagination } from "@/components/app/ui-states";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { deleteWorkspaceFile, uploadWorkspaceFile } from "@/lib/files.functions";
import { useI18n } from "@/lib/i18n";

export const LIB_CATS = [
  { id: "administrative", en: "Administrative", id_: "Administrasi" },
  { id: "technical", en: "Technical", id_: "Teknis" },
  { id: "commercial", en: "Price Offer", id_: "Penawaran" },
];
export const MAX_FILE = 20 * 1024 * 1024;

export interface LibDoc {
  id: string;
  category: string;
  name: string;
  doc_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  file_name: string | null;
  mime: string | null;
  size: number;
  version: number;
  notes: string | null;
}

export function useDocLibrary(workspaceId: string) {
  return useQuery({
    queryKey: ["crm-doc-library", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "crm_doc_library", workspaceId, orderBy: "name", orderDir: "asc", limit: 1000 },
      });
      return (data?.rows ?? []) as unknown as LibDoc[];
    },
  });
}

/** Membaca berkas di browser menjadi data URL (dikirim ke server fn unggah). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca berkas"));
    reader.readAsDataURL(file);
  });
}

/** Mengunggah berkas ke penyimpanan workspace; mengembalikan path relatif. */
export async function uploadWsFile(
  workspaceId: string,
  folder: string,
  file: File,
  uploadFn: (args: { data: { workspaceId: string; folder: string; fileName: string; dataUrl: string } }) => Promise<{ path: string }>,
) {
  if (file.size > MAX_FILE) throw new Error(`Berkas melebihi ${Math.round(MAX_FILE / 1024 / 1024)} MB`);
  const dataUrl = await fileToDataUrl(file);
  const result = await uploadFn({ data: { workspaceId, folder, fileName: file.name, dataUrl } });
  return result.path;
}

/** Membuka berkas di tab baru (rute unduh memakai cookie sesi). */
export function openWsFile(path: string) {
  window.open(`/api/workspace-files?path=${encodeURIComponent(path)}`, "_blank");
}

export function expiryState(expiry: string | null) {
  if (!expiry) return "none" as const;
  const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
  if (days < 0) return "expired" as const;
  if (days <= 30) return "soon" as const;
  return "valid" as const;
}

export function ExpiryBadge({ expiry }: { expiry: string | null }) {
  const { lang } = useI18n();
  const s = expiryState(expiry);
  if (s === "none") return <Badge variant="outline">{lang === "id" ? "Tanpa batas" : "No expiry"}</Badge>;
  if (s === "expired") return <Badge variant="destructive">{lang === "id" ? "Kedaluwarsa" : "Expired"}</Badge>;
  if (s === "soon")
    return <Badge className="bg-gold text-navy">{lang === "id" ? "Segera habis" : "Expiring soon"}</Badge>;
  return (
    <Badge variant="outline" className="border-emerald-500 text-emerald-600">
      {lang === "id" ? "Berlaku" : "Valid"}
    </Badge>
  );
}

/** Pencocokan nama longgar: salah satu nama memuat nama lainnya. */
export function matchLibrary(name: string, lib: LibDoc[]) {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = n(name);
  return (
    lib.find((d) => {
      const x = n(d.name);
      return x && (target.includes(x) || x.includes(target));
    }) ??
    lib.find((d) => {
      const first = n(d.name).split(" ")[0];
      return first.length >= 3 && target.split(" ").includes(first);
    })
  );
}

type Form = {
  id?: string;
  category: string;
  name: string;
  doc_number: string;
  issued_date: string;
  expiry_date: string;
  notes: string;
  file: File | null;
};
const EMPTY: Form = {
  category: "administrative",
  name: "",
  doc_number: "",
  issued_date: "",
  expiry_date: "",
  notes: "",
  file: null,
};

export function DocLibraryView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadWorkspaceFile);
  const deleteFileFn = useServerFn(deleteWorkspaceFile);
  const { data: docs = [], isLoading } = useDocLibrary(workspaceId);
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [histFor, setHistFor] = useState<LibDoc | null>(null);

  const filtered = useMemo(
    () =>
      docs.filter(
        (d) =>
          (cat === "all" || d.category === cat) &&
          `${d.name} ${d.doc_number ?? ""} ${d.file_name ?? ""}`.toLowerCase().includes(term.toLowerCase()),
      ),
    [docs, term, cat],
  );
  const pager = usePagination(filtered);

  const save = useMutation({
    mutationFn: async () => {
      const existing = docs.find((d) => d.id === form.id);
      let fileFields: Partial<LibDoc> = {};
      if (form.file) {
        const path = await uploadWsFile(workspaceId, "crm/tender-library", form.file, uploadFn);
        fileFields = { file_path: path, file_name: form.file.name, mime: form.file.type, size: form.file.size };
      }
      const base = {
        category: form.category,
        name: form.name.trim(),
        doc_number: form.doc_number || null,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes || null,
      };
      if (existing) {
        if (form.file && existing.file_path) {
          // Versi lama dipindahkan ke riwayat supaya jejak berkas tetap ada.
          await upsertWorkspaceRows({
            data: {
              table: "crm_doc_library_versions",
              workspaceId,
              rows: [
                {
                  id: crypto.randomUUID(),
                  library_doc_id: existing.id,
                  version: existing.version,
                  file_path: existing.file_path,
                  file_name: existing.file_name,
                  expiry_date: existing.expiry_date,
                },
              ],
            },
          });
        }
        await saveWorkspaceRow({
          data: {
            table: "crm_doc_library",
            workspaceId,
            id: existing.id,
            data: { ...base, ...fileFields, version: form.file ? existing.version + 1 : existing.version },
          },
        });
      } else {
        await upsertWorkspaceRows({
          data: {
            table: "crm_doc_library",
            workspaceId,
            rows: [{ id: crypto.randomUUID(), ...base, ...fileFields, version: 1 }],
          },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-doc-library", workspaceId] });
      setOpen(false);
      toast.success(lang === "id" ? "Dokumen disimpan" : "Document saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(d: LibDoc) {
    if (!confirm(lang === "id" ? `Hapus "${d.name}" dari pustaka?` : `Delete "${d.name}"?`)) return;
    try {
      await deleteWorkspaceRow({ data: { table: "crm_doc_library", workspaceId, id: d.id } });
      if (d.file_path) await deleteFileFn({ data: { workspaceId, path: d.file_path } });
      void qc.invalidateQueries({ queryKey: ["crm-doc-library", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus dokumen");
    }
  }

  const soon = docs.filter((d) => ["expired", "soon"].includes(expiryState(d.expiry_date))).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">QALLING CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? "Pustaka Dokumen Tender" : "Tender Document Library"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "id" ? "Unggah sekali, pakai berulang di setiap tender." : "Upload once, reuse in every tender."}
          </p>
        </div>
        <Button
          variant="navy"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> {lang === "id" ? "Upload dokumen" : "Upload document"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{lang === "id" ? "Total dokumen" : "Total documents"}</p>
            <p className="text-2xl font-semibold">{docs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{lang === "id" ? "Belum ada berkas" : "Missing file"}</p>
            <p className="text-2xl font-semibold">{docs.filter((d) => !d.file_path).length}</p>
          </CardContent>
        </Card>
        <Card className={soon ? "border-destructive" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {lang === "id" ? "Kedaluwarsa / ≤30 hari" : "Expired / ≤30 days"}
            </p>
            <p className={`text-2xl font-semibold ${soon ? "text-destructive" : ""}`}>{soon}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-64 pl-9"
            placeholder={lang === "id" ? "Cari dokumen…" : "Search…"}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <AdminSelect className="w-48" value={cat} onChange={setCat}>
          <option value="all">{lang === "id" ? "Semua kategori" : "All categories"}</option>
          {LIB_CATS.map((c) => (
            <option key={c.id} value={c.id}>
              {lang === "id" ? c.id_ : c.en}
            </option>
          ))}
        </AdminSelect>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <PageSkeleton stats={0} columns={7} rows={5} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <FolderArchive className="mx-auto mb-3 h-8 w-8 text-gold" />
              {lang === "id" ? "Belum ada dokumen di pustaka." : "No documents yet."}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{lang === "id" ? "Dokumen" : "Document"}</TableHead>
                    <TableHead>{lang === "id" ? "Kategori" : "Category"}</TableHead>
                    <TableHead>{lang === "id" ? "Nomor" : "Number"}</TableHead>
                    <TableHead>{lang === "id" ? "Berlaku s/d" : "Valid until"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.items.map((d, i) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-muted-foreground">{pager.start + i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {d.name}
                        {d.version > 1 && <span className="ml-2 text-xs text-muted-foreground">v{d.version}</span>}
                      </TableCell>
                      <TableCell>
                        {lang === "id"
                          ? LIB_CATS.find((c) => c.id === d.category)?.id_
                          : LIB_CATS.find((c) => c.id === d.category)?.en}
                      </TableCell>
                      <TableCell>{d.doc_number || "—"}</TableCell>
                      <TableCell>{d.expiry_date || "—"}</TableCell>
                      <TableCell>
                        <ExpiryBadge expiry={d.expiry_date} />
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs">
                        {d.file_path ? (
                          <button className="text-primary underline" onClick={() => openWsFile(d.file_path!)}>
                            {d.file_name}
                          </button>
                        ) : (
                          <span className="text-destructive">{lang === "id" ? "Belum diunggah" : "Not uploaded"}</span>
                        )}
                      </TableCell>
                      <TableCell className="flex gap-1">
                        {d.file_path && (
                          <Button variant="ghost" size="icon" onClick={() => openWsFile(d.file_path!)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setForm({
                              id: d.id,
                              category: d.category,
                              name: d.name,
                              doc_number: d.doc_number ?? "",
                              issued_date: d.issued_date ?? "",
                              expiry_date: d.expiry_date ?? "",
                              notes: d.notes ?? "",
                              file: null,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {d.version > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => setHistFor(d)}>
                            <History className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => void remove(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar p={pager} />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? lang === "id"
                  ? "Ubah / ganti versi dokumen"
                  : "Edit / new version"
                : lang === "id"
                  ? "Upload dokumen"
                  : "Upload document"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <AdminField label={lang === "id" ? "Nama dokumen" : "Document name"}>
              <Input
                placeholder="NIB / OSS"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label={lang === "id" ? "Kategori" : "Category"}>
                <AdminSelect value={form.category} onChange={(v) => setForm({ ...form, category: v })}>
                  {LIB_CATS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === "id" ? c.id_ : c.en}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label={lang === "id" ? "Nomor dokumen" : "Document no."}>
                <Input value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} />
              </AdminField>
              <AdminField label={lang === "id" ? "Tanggal terbit" : "Issued"}>
                <Input
                  type="date"
                  value={form.issued_date}
                  onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
                />
              </AdminField>
              <AdminField label={lang === "id" ? "Berlaku sampai" : "Valid until"}>
                <Input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </AdminField>
            </div>
            <AdminField label={lang === "id" ? "Berkas (maks 20 MB)" : "File (max 20 MB)"}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
                <Upload className="h-4 w-4" />
                <span className="truncate">
                  {form.file?.name ??
                    (form.id
                      ? lang === "id"
                        ? "Pilih berkas untuk versi baru (opsional)"
                        : "Choose a file for a new version (optional)"
                      : lang === "id"
                        ? "Pilih berkas"
                        : "Choose file")}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                />
              </label>
            </AdminField>
            <AdminField label={lang === "id" ? "Keterangan" : "Notes"}>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="navy" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {lang === "id" ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {histFor && <VersionHistory doc={histFor} workspaceId={workspaceId} onClose={() => setHistFor(null)} />}
    </div>
  );
}

interface LibVersion {
  id: string;
  version: number;
  file_path: string | null;
  file_name: string | null;
  expiry_date: string | null;
}

function VersionHistory({ doc, workspaceId, onClose }: { doc: LibDoc; workspaceId: string; onClose: () => void }) {
  const { lang } = useI18n();
  const { data = [] } = useQuery({
    queryKey: ["crm-doc-versions", doc.id],
    queryFn: async () => {
      const result = await listWorkspaceRows({
        data: {
          table: "crm_doc_library_versions",
          workspaceId,
          filters: { library_doc_id: doc.id },
          orderBy: "version",
          orderDir: "desc",
          limit: 200,
        },
      });
      return (result?.rows ?? []) as unknown as LibVersion[];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {lang === "id" ? "Riwayat versi" : "Version history"} — {doc.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            v{doc.version} ({lang === "id" ? "aktif" : "current"}) · {doc.file_name}
          </p>
          {data.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded border p-2">
              <span>
                v{v.version} · {v.file_name} {v.expiry_date && `· s/d ${v.expiry_date}`}
              </span>
              {v.file_path && (
                <Button size="sm" variant="ghost" onClick={() => openWsFile(v.file_path!)}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
