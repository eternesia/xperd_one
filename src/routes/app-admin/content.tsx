import { useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminDelete, adminList, adminSave } from "@/lib/platform.functions";
import { TablePager, TableSearch, usePaged, rowText } from "@/components/app/admin-table";
import { BRAND } from "@/lib/xperd";
import {
  CONTACT_KEYS,
  getWebsiteContacts,
  saveXperdContact,
  type WebsiteSite,
  type XperdContactValues,
} from "@/lib/xperd-contact.functions";

export const Route = createFileRoute("/app-admin/content")({
  head: () => ({
    meta: [
      { title: "Konten Website — XPERD Super Admin" },
      { name: "description", content: "Kelola banner, fitur dan konten XPERD serta Qalling." },
      { property: "og:title", content: "Konten Website — XPERD" },
      { property: "og:description", content: "Pengelolaan konten website XPERD dan Qalling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
      const data = await adminList({
        data: { table: "site_content", orderBy: "section", orderDir: "asc" },
      });
      return data?.rows ?? [];
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
      await adminSave({
        data: { table: "site_content", id: values.id ?? undefined, data: payload },
      });
    },
    onSuccess: () => {
      toast.success("Content saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preset = useMutation({
    mutationFn: async () => {
      const have = new Set(items.map((c) => `${c.section}/${c.key}`));
      const rows = QALLING_PRESET.filter((r) => !have.has(`${r.section}/${r.key}`));
      if (!rows.length) throw new Error("Semua konten default sudah ada");
      for (const [i, r] of rows.entries())
        await adminSave({
          data: { table: "site_content", data: { ...r, sort_order: i, is_published: true } },
        });
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} konten default ditambahkan`);
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await adminDelete({ data: { table: "site_content", id } });
    },
    onSuccess: () => {
      toast.success("Content deleted");
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [site, setSite] = useState<"xperd" | "qalling">("xperd");
  const siteItems = items.filter(
    (c) => c.section !== "contact" && (site === "qalling") === c.section.startsWith("qalling."),
  );
  const pg = usePaged(siteItems, rowText);

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
            setForm({
              ...EMPTY,
              section: site === "qalling" ? "qalling.hero" : "home",
              key: site === "qalling" ? "main" : "",
            });
            setOpen(true);
          }}
        >
          <Plus /> New entry
        </Button>
      </header>

      <ContactForm site="xperd" title="Kontak website XPERD" idPrefix="contact" />
      <ContactForm site="qalling" title="Kontak website Qalling" idPrefix="qcontact" />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex gap-2">
            {(["xperd", "qalling"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={site === k ? "gold" : "outline"}
                onClick={() => setSite(k)}
              >
                {k === "xperd" ? "Website XPERD" : "Website Qalling"} (
                {items.filter((c) => (k === "qalling") === c.section.startsWith("qalling.")).length}
                )
              </Button>
            ))}
          </div>
          {site === "qalling" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="gold"
                disabled={preset.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Muat konten default Qalling? Konten yang sudah ada tidak ditimpa.",
                    )
                  )
                    preset.mutate();
                }}
              >
                Muat Konten Default
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm({ ...EMPTY, section: "qalling.hero", key: "main" });
                  setOpen(true);
                }}
              >
                + Banner utama
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm({
                    ...EMPTY,
                    section: "qalling.features",
                    key: `fitur-${Date.now().toString(36)}`,
                  });
                  setOpen(true);
                }}
              >
                + Fitur
              </Button>
            </div>
          )}
          <TableSearch value={pg.query} onChange={pg.setQuery} placeholder="Cari konten…" />
        </div>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Konten Qalling memakai awalan section <code>qalling.</code> (mis. qalling.hero,
          qalling.kontak).
        </p>
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
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && siteItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No content entries yet.
                  </TableCell>
                </TableRow>
              )}
              {pg.rows.map((c) => (
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
          <TablePager {...pg} />
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
                {site === "qalling" ? (
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                  >
                    <option value="qalling.hero">Banner Beranda</option>
                    <option value="qalling.features">Fitur Aplikasi</option>
                    <option value="qalling.kontak">Kontak</option>
                    {!["qalling.hero", "qalling.features", "qalling.kontak"].includes(
                      form.section,
                    ) && <option value={form.section}>{form.section}</option>}
                  </select>
                ) : (
                  <Input
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    required
                  />
                )}
              </Field>
              <Field label="Key">
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  required
                />
              </Field>
              <Field label="Title (EN)">
                <Input
                  value={form.title_en}
                  onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                />
              </Field>
              <Field label="Title (ID)">
                <Input
                  value={form.title_id}
                  onChange={(e) => setForm({ ...form, title_id: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Body (EN)">
                <Textarea
                  rows={4}
                  value={form.body_en}
                  onChange={(e) => setForm({ ...form, body_en: e.target.value })}
                />
              </Field>
              <Field label="Body (ID)">
                <Textarea
                  rows={4}
                  value={form.body_id}
                  onChange={(e) => setForm({ ...form, body_id: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Image URL">
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
                <Input
                  aria-label="Unggah gambar banner atau fitur"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5_000_000) {
                      toast.error("Gambar maksimal 5 MB");
                      return;
                    }
                    try {
                      const bitmap = await createImageBitmap(file);
                      const scale = Math.min(1, 1600 / bitmap.width);
                      const canvas = document.createElement("canvas");
                      canvas.width = Math.round(bitmap.width * scale);
                      canvas.height = Math.round(bitmap.height * scale);
                      const context = canvas.getContext("2d");
                      if (!context) throw new Error("Gambar tidak dapat diproses");
                      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                      bitmap.close();
                      const value = canvas.toDataURL("image/webp", 0.8);
                      if (value.length > 1_000_000)
                        throw new Error("Gambar terlalu besar setelah kompresi");
                      setForm((v) => ({ ...v, image_url: value }));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Gambar tidak valid");
                    }
                  }}
                />
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt="Pratinjau gambar"
                    className="max-h-40 w-full rounded-md object-contain"
                  />
                )}
              </Field>
              <Field label="Link URL">
                <Input
                  value={form.link_url}
                  onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                />
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
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

// Preset konten Qalling (BS New 14).
const QALLING_PRESET = [
  {
    section: "qalling.hero",
    key: "main",
    title_id: "Kelola media sosial, leads, dan closing dari satu tempat",
    title_en: "Manage social media, leads and closing in one place",
    body_id:
      "Posting lewat chat AI, balas komentar & DM otomatis, leads masuk rapi ke pipeline, lalu tarik laporan untuk klien.",
    body_en:
      "Post via AI chat, auto-reply comments & DMs, organise leads in a pipeline, and export client reports.",
    link_url: "/qalling/daftar",
  },
  {
    section: "qalling.features",
    key: "publishing",
    title_id: "Jadwal posting multi-akun",
    title_en: "Multi-account scheduling",
    body_id:
      "Instagram, TikTok, Facebook, LinkedIn, X, Threads, dan YouTube dalam satu kalender, lengkap dengan rekomendasi jam emas WIB.",
    body_en: "All major networks in one calendar with Indonesian golden-hour suggestions.",
  },
  {
    section: "qalling.features",
    key: "inbox",
    title_id: "Kotak masuk terpadu",
    title_en: "Unified inbox",
    body_id:
      "DM dan komentar dari semua akun dalam satu layar, dengan template pesan cepat dan invoice kilat.",
    body_en: "DMs and comments in one screen with quick replies and instant invoices.",
  },
  {
    section: "qalling.features",
    key: "automation",
    title_id: "Automasi komentar → DM",
    title_en: "Comment → DM automation",
    body_id: "Kirim link otomatis, wajib follow dulu, dan lacak klik untuk setiap kampanye.",
    body_en: "Auto-send links, follow gates and click tracking.",
  },
  {
    section: "qalling.features",
    key: "crm",
    title_id: "Leads & pipeline penjualan",
    title_en: "Leads & sales pipeline",
    body_id: "Dari Tanya Harga sampai Closing, follow up lewat WhatsApp dalam satu klik.",
    body_en: "From inquiry to closing, with one-click WhatsApp follow-up.",
  },
  {
    section: "qalling.features",
    key: "reports",
    title_id: "Laporan klien PDF & Excel",
    title_en: "Client reports in PDF & Excel",
    body_id: "Kelompokkan akun per klien dan ekspor performa dalam hitungan detik.",
    body_en: "Group accounts per client and export performance in seconds.",
  },
  {
    section: "qalling.features",
    key: "ai",
    title_id: "Terhubung ChatGPT & Claude",
    title_en: "Works with ChatGPT & Claude",
    body_id: "Buat ide konten dan draf postingan langsung dari chat AI melalui MCP.",
    body_en: "Create ideas and post drafts straight from AI chat via MCP.",
  },
];

const QALLING_PLACEHOLDERS: Record<string, string> = {
  email: "halo@qalling.id",
  whatsapp: "6281200000000",
  hours: "Senin–Jumat, 09.00–17.00 WIB",
  website: "https://",
};

const CONTACT_FIELDS: {
  key: (typeof CONTACT_KEYS)[number];
  label: string;
  type?: string;
  placeholder: string;
}[] = [
  { key: "email", label: "Email", type: "email", placeholder: BRAND.email },
  { key: "phone", label: "Telepon / HP", placeholder: BRAND.phone },
  { key: "whatsapp", label: "WhatsApp", placeholder: BRAND.whatsapp },
  { key: "address", label: "Alamat", placeholder: BRAND.address },
  { key: "hours", label: "Jam layanan", placeholder: "Senin–Jumat, 09.00–17.00 WIB" },
  { key: "website", label: "Website lain", type: "url", placeholder: "https://" },
];

/** Kontak yang tampil di footer, halaman Kontak, dan Tentang tiap situs; kosong = memakai nilai bawaan. */
function ContactForm({
  site,
  title,
  idPrefix,
}: {
  site: WebsiteSite;
  title: string;
  idPrefix: string;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-website-contact", site],
    queryFn: () => getWebsiteContacts({ data: { site } }),
  });
  const [f, setF] = useState<XperdContactValues | null>(null);
  useEffect(() => {
    if (data && !f) setF(data);
  }, [data, f]);
  const save = useMutation({
    mutationFn: async () => {
      if (f) await saveXperdContact({ data: { site, values: f } });
    },
    onSuccess: () => {
      toast.success("Kontak website disimpan");
      void qc.invalidateQueries({ queryKey: ["admin-website-contact", site] });
      void qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!f) return null;
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {CONTACT_FIELDS.map((c) => (
          <div key={c.key} className="space-y-1">
            <Label htmlFor={`${idPrefix}-${c.key}`}>{c.label}</Label>
            <Input
              id={`${idPrefix}-${c.key}`}
              type={c.type}
              placeholder={site === "qalling" ? (QALLING_PLACEHOLDERS[c.key] ?? "") : c.placeholder}
              value={f[c.key] ?? ""}
              onChange={(e) => setF({ ...f, [c.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        Simpan kontak
      </Button>
    </section>
  );
}
