import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sqlDateTime } from "@/lib/datetime";
import { adminDelete, adminList, adminSave } from "@/lib/platform.functions";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";

import { TablePager, TableSearch, usePaged, rowText } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/announcements")({
  component: AnnouncementsPage,
});

interface AnnForm {
  id?: string;
  title_en: string;
  title_id: string;
  body_en: string;
  body_id: string;
  severity: string;
  audience: string;
  starts_at: string;
  ends_at: string;
  is_published: boolean;
}

const localNow = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const EMPTY: AnnForm = {
  title_en: "",
  title_id: "",
  body_en: "",
  body_id: "",
  severity: "info",
  audience: "all",
  starts_at: localNow(),
  ends_at: "",
  is_published: false,
};

function AnnouncementsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AnnForm>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const data = await adminList({
        data: { table: "announcements", orderBy: "starts_at", orderDir: "desc" },
      });
      return data?.rows ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (v: AnnForm) => {
      const payload = {
        title_en: v.title_en.trim(),
        title_id: v.title_id || null,
        body_en: v.body_en || null,
        body_id: v.body_id || null,
        severity: v.severity,
        audience: v.audience,
        starts_at: sqlDateTime(new Date(v.starts_at)),
        ends_at: v.ends_at ? sqlDateTime(new Date(v.ends_at)) : null,
        is_published: v.is_published,
      };
      await adminSave({ data: { table: "announcements", id: v.id ?? undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Announcement saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await adminDelete({ data: { table: "announcements", id } });
    },
    onSuccess: () => {
      toast.success("Announcement deleted");
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pg = usePaged(rows, rowText);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
            <Megaphone className="h-5 w-5 text-gold" /> Announcements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Broadcast maintenance notes, releases and billing notices to tenants.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> New announcement
        </Button>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <div className="border-b border-border p-4">
            <TableSearch value={pg.query} onChange={pg.setQuery} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No announcements yet.
                  </TableCell>
                </TableRow>
              )}
              {pg.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{a.title_en}</p>
                    <p className="text-xs text-muted-foreground">{a.title_id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.audience}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.starts_at).toLocaleDateString()} →{" "}
                    {a.ends_at ? new Date(a.ends_at).toLocaleDateString() : "∞"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.is_published ? "default" : "secondary"}>
                      {a.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit announcement"
                      onClick={() => {
                        setForm({
                          id: a.id,
                          title_en: a.title_en,
                          title_id: a.title_id ?? "",
                          body_en: a.body_en ?? "",
                          body_id: a.body_id ?? "",
                          severity: a.severity,
                          audience: a.audience,
                          starts_at: new Date(a.starts_at).toISOString().slice(0, 16),
                          ends_at: a.ends_at ? new Date(a.ends_at).toISOString().slice(0, 16) : "",
                          is_published: a.is_published,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete announcement"
                      onClick={() => {
                        if (confirm("Delete this announcement?")) remove.mutate(a.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...pg} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Title (EN)">
                <Input
                  value={form.title_en}
                  onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                  required
                />
              </AdminField>
              <AdminField label="Title (ID)">
                <Input
                  value={form.title_id}
                  onChange={(e) => setForm({ ...form, title_id: e.target.value })}
                />
              </AdminField>
              <AdminField label="Body (EN)">
                <Textarea
                  rows={4}
                  value={form.body_en}
                  onChange={(e) => setForm({ ...form, body_en: e.target.value })}
                />
              </AdminField>
              <AdminField label="Body (ID)">
                <Textarea
                  rows={4}
                  value={form.body_id}
                  onChange={(e) => setForm({ ...form, body_id: e.target.value })}
                />
              </AdminField>
              <AdminField label="Severity">
                <AdminSelect
                  value={form.severity}
                  onChange={(v: string) => setForm({ ...form, severity: v })}
                >
                  {["info", "update", "promo", "success", "warning", "critical"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Audience">
                <AdminSelect
                  value={form.audience}
                  onChange={(v: string) => setForm({ ...form, audience: v })}
                >
                  {["all", "trial", "active", "suspended"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Starts at">
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </AdminField>
              <AdminField label="Ends at (optional)">
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </AdminField>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="ann-pub"
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
              />
              <Label htmlFor="ann-pub">Published</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save announcement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
