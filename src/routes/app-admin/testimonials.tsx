import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareQuote, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AdminField } from "@/components/app/admin-ui";
import { adminDelete, adminList, adminSave } from "@/lib/platform.functions";

export const Route = createFileRoute("/app-admin/testimonials")({
  head: () => ({ meta: [{ title: "Testimoni | XPERD Admin" }] }),
  component: TestimonialsAdmin,
});

type Row = {
  id?: string;
  name: string;
  role_id: string;
  role_en: string;
  quote_id: string;
  quote_en: string;
  rating: string;
  sort_order: string;
  is_published: boolean;
};
const EMPTY: Row = {
  name: "",
  role_id: "",
  role_en: "",
  quote_id: "",
  quote_en: "",
  rating: "",
  sort_order: "0",
  is_published: true,
};

function TestimonialsAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Row>(EMPTY);
  const [open, setOpen] = useState(false);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () =>
      (await adminList({ data: { table: "testimonials", orderBy: "sort_order", orderDir: "asc" } }))
        ?.rows ?? [],
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
    qc.invalidateQueries({ queryKey: ["public-testimonials"] });
  };
  const save = useMutation({
    mutationFn: async (v: Row) =>
      adminSave({
        data: {
          table: "testimonials",
          id: v.id,
          data: {
            name: v.name.trim(),
            role_id: v.role_id.trim() || null,
            role_en: v.role_en.trim() || null,
            quote_id: v.quote_id.trim(),
            quote_en: v.quote_en.trim() || null,
            rating: v.rating ? Math.min(5, Math.max(1, Number(v.rating))) : null,
            sort_order: Number(v.sort_order) || 0,
            is_published: v.is_published ? 1 : 0,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Testimoni tersimpan");
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDelete({ data: { table: "testimonials", id } }),
    onSuccess: () => {
      toast.success("Testimoni dihapus");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = (r: Record<string, unknown>) => {
    setForm({
      id: String(r.id),
      name: String(r.name ?? ""),
      role_id: String(r.role_id ?? ""),
      role_en: String(r.role_en ?? ""),
      quote_id: String(r.quote_id ?? ""),
      quote_en: String(r.quote_en ?? ""),
      rating: r.rating ? String(r.rating) : "",
      sort_order: String(r.sort_order ?? 0),
      is_published: Boolean(Number(r.is_published)),
    });
    setOpen(true);
  };
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
            <MessageSquareQuote className="h-5 w-5 text-gold" /> Testimoni
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tampil di beranda dan halaman Testimoni Qalling. Urutan kecil tampil lebih dulu. Gunakan
            hanya testimoni asli dengan izin pengguna.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> Tambah testimoni
        </Button>
      </header>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Kutipan</TableHead>
                <TableHead>Urutan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6}>Memuat…</TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>Belum ada testimoni.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell className="font-medium">{String(r.name)}</TableCell>
                  <TableCell className="text-muted-foreground">{String(r.role_id ?? "")}</TableCell>
                  <TableCell className="max-w-md truncate">{String(r.quote_id)}</TableCell>
                  <TableCell>{String(r.sort_order)}</TableCell>
                  <TableCell>
                    <Badge variant={Number(r.is_published) ? "secondary" : "outline"}>
                      {Number(r.is_published) ? "Tampil" : "Disembunyikan"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => edit(r)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Hapus testimoni ini?")) remove.mutate(String(r.id));
                      }}
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit testimoni" : "Tambah testimoni"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Nama">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
              />
            </AdminField>
            <AdminField label="Urutan">
              <Input
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                inputMode="numeric"
              />
            </AdminField>
            <AdminField label="Peran (ID)">
              <Input
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                placeholder="Pemilik UMKM fashion"
                maxLength={160}
              />
            </AdminField>
            <AdminField label="Peran (EN)">
              <Input
                value={form.role_en}
                onChange={(e) => setForm({ ...form, role_en: e.target.value })}
                placeholder="Fashion business owner"
                maxLength={160}
              />
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label="Kutipan (ID)">
                <Textarea
                  value={form.quote_id}
                  onChange={(e) => setForm({ ...form, quote_id: e.target.value })}
                  rows={3}
                  maxLength={1000}
                />
              </AdminField>
            </div>
            <div className="sm:col-span-2">
              <AdminField label="Kutipan (EN, opsional)">
                <Textarea
                  value={form.quote_en}
                  onChange={(e) => setForm({ ...form, quote_en: e.target.value })}
                  rows={3}
                  maxLength={1000}
                />
              </AdminField>
            </div>
            <AdminField label="Rating 1–5 (opsional)">
              <Input
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: e.target.value })}
                inputMode="numeric"
              />
            </AdminField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
              />{" "}
              Tampilkan di situs
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              variant="gold"
              disabled={!form.name.trim() || form.quote_id.trim().length < 5 || save.isPending}
              onClick={() => save.mutate(form)}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
