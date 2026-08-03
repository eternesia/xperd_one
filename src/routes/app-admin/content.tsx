import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app-admin/content")({
  component: ContentPage,
});

interface ContentForm {
  id?: string;
  section: string;
  key: string;
  title_en: string;
  title_id: string;
  body_en: string;
  body_id: string;
  image_url: string;
  link_url: string;
  sort_order: number;
  is_published: boolean;
}

const EMPTY: ContentForm = {
  section: "home",
  key: "",
  title_en: "",
  title_id: "",
  body_en: "",
  body_id: "",
  image_url: "",
  link_url: "",
  sort_order: 0,
  is_published: true,
};

function ContentPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContentForm>(EMPTY);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-site-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_content")
        .select("*")
        .order("section")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: ContentForm) => {
      const payload = {
        section: values.section.trim(),
        key: values.key.trim(),
        title_en: values.title_en || null,
        title_id: values.title_id || null,
        body_en: values.body_en || null,
        body_id: values.body_id || null,
        image_url: values.image_url || null,
        link_url: values.link_url || null,
        sort_order: Number(values.sort_order) || 0,
        is_published: values.is_published,
      };
      const { error } = values.id
        ? await supabase.from("site_content").update(payload).eq("id", values.id)
        : await supabase.from("site_content").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Content saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Content deleted");
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Website Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage dynamic website copy in English and Indonesian.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> New entry
        </Button>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section / Key</TableHead>
                <TableHead>English</TableHead>
                <TableHead>Indonesian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">No content entries yet.</TableCell>
                </TableRow>
              )}
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{c.section}</p>
                    <p className="text-xs text-muted-foreground">{c.key}</p>
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm">
                    <p className="truncate font-medium">{c.title_en}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.body_en}</p>
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm">
                    <p className="truncate font-medium">{c.title_id}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.body_id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_published ? "default" : "secondary"}>
                      {c.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit content"
                      onClick={() => {
                        setForm({
                          id: c.id,
                          section: c.section,
                          key: c.key,
                          title_en: c.title_en ?? "",
                          title_id: c.title_id ?? "",
                          body_en: c.body_en ?? "",
                          body_id: c.body_id ?? "",
                          image_url: c.image_url ?? "",
                          link_url: c.link_url ?? "",
                          sort_order: c.sort_order,
                          is_published: c.is_published,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete content"
                      onClick={() => {
                        if (confirm(`Delete "${c.section}/${c.key}"?`)) remove.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit content" : "New content"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section">
                <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required />
              </Field>
              <Field label="Key">
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required />
              </Field>
              <Field label="Title (EN)">
                <Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
              </Field>
              <Field label="Title (ID)">
                <Input value={form.title_id} onChange={(e) => setForm({ ...form, title_id: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Body (EN)">
                <Textarea rows={4} value={form.body_en} onChange={(e) => setForm({ ...form, body_en: e.target.value })} />
              </Field>
              <Field label="Body (ID)">
                <Textarea rows={4} value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Image URL">
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              </Field>
              <Field label="Link URL">
                <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
              </Field>
              <Field label="Sort order">
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="published"
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
              />
              <Label htmlFor="published">Published</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save content"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
