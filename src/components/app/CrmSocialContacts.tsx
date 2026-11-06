import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Search, Trash2, UserPlus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SocialIcon } from "@/components/qalling/SocialIcon";
import {
  createLeadFromContact,
  deleteSocialContact,
  getSocialContact,
  listSocialContacts,
  saveSocialContact,
} from "@/lib/crm-contacts.functions";

const PAGE = 25;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

type Form = {
  name: string;
  phone: string;
  email: string;
  company_name: string;
  tags: string;
  notes: string;
};
const EMPTY: Form = { name: "", phone: "", email: "", company_name: "", tags: "", notes: "" };

export function SocialContactsPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(term);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  // Sinkronkan percakapan DM → kontak sekali saat halaman dibuka.
  useEffect(() => {
    listSocialContacts({ data: { workspaceId, sync: true, pageSize: 5 } })
      .then(() => qc.invalidateQueries({ queryKey: ["social-contacts", workspaceId] }))
      .catch(() => undefined);
  }, [workspaceId, qc]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["social-contacts", workspaceId, q, tag, page],
    queryFn: () =>
      listSocialContacts({
        data: { workspaceId, query: q || undefined, tag: tag || undefined, page, pageSize: PAGE },
      }),
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari nama, telepon, email…"
            className="pl-9"
            aria-label="Cari kontak"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value.trim())}
            placeholder="Filter tag"
            className="h-9 w-32"
            aria-label="Filter tag"
          />
          <Button onClick={() => setOpenId("new")}>
            <Plus className="h-4 w-4" /> Tambah kontak
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
          ) : isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Memuat…</p>
          ) : !data?.rows.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q || tag
                ? "Tidak ada kontak yang cocok."
                : "Belum ada kontak. Kontak dibuat otomatis dari percakapan DM, atau tambahkan manual."}
            </p>
          ) : (
            <ul className="divide-y">
              {data.rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.company_name, c.phone, c.email].filter(Boolean).join(" · ") ||
                          "Belum ada detail kontak"}
                      </p>
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                      {c.platforms.map((p) => (
                        <SocialIcon key={p} platform={p} className="h-4 w-4" />
                      ))}
                    </div>
                    <div className="hidden max-w-40 flex-wrap gap-1 md:flex">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {c.lead_count > 0 && <Badge variant="outline">{c.lead_count} prospek</Badge>}
                    <span className="hidden w-28 text-right text-xs text-muted-foreground lg:block">
                      {when(c.last_interaction_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data?.total ?? 0} kontak</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            {page + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>
      {openId && (
        <ContactDialog workspaceId={workspaceId} id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function ContactDialog({
  workspaceId,
  id,
  onClose,
}: {
  workspaceId: string;
  id: string | "new";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNew = id === "new";
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data } = useQuery({
    queryKey: ["social-contact", workspaceId, id],
    enabled: !isNew,
    queryFn: () => getSocialContact({ data: { workspaceId, contactId: id } }),
  });
  useEffect(() => {
    if (!data) return;
    const c = data.contact;
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      company_name: c.company_name ?? "",
      tags: c.tags.join(", "),
      notes: c.notes ?? "",
    });
  }, [data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["social-contacts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["social-contact", workspaceId, id] });
  };
  const save = useMutation({
    mutationFn: () =>
      saveSocialContact({
        data: {
          workspaceId,
          contactId: isNew ? undefined : id,
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          company_name: form.company_name || null,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Kontak disimpan");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteSocialContact({ data: { workspaceId, contactId: id } }),
    onSuccess: () => {
      toast.success("Kontak dihapus");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toLead = useMutation({
    mutationFn: () => createLeadFromContact({ data: { workspaceId, contactId: id } }),
    onSuccess: (r) => {
      toast.success(r.existing ? "Prospek yang terbuka sudah ada" : "Prospek dibuat");
      refresh();
      qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
      navigate({ to: "/qalling/app/$submoduleId", params: { submoduleId: "leads" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Kontak baru" : "Detail kontak"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nama</Label>
            <Input value={form.name} onChange={set("name")} />
          </div>
          <div>
            <Label>Telepon</Label>
            <Input value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={set("email")} />
          </div>
          <div>
            <Label>Perusahaan</Label>
            <Input value={form.company_name} onChange={set("company_name")} />
          </div>
          <div>
            <Label>Tag (pisahkan koma)</Label>
            <Input value={form.tags} onChange={set("tags")} placeholder="vip, reseller" />
          </div>
          <div className="sm:col-span-2">
            <Label>Catatan</Label>
            <Textarea rows={3} value={form.notes} onChange={set("notes")} />
          </div>
        </div>

        {!isNew && data && (
          <div className="space-y-3">
            {data.conversations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.conversations.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  >
                    <SocialIcon platform={c.platform} className="h-3 w-3" /> {c.account_name}
                    {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
                  </span>
                ))}
              </div>
            )}
            {data.leads.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Prospek: {data.leads.map((l) => `${l.code} (${l.stage})`).join(", ")}
              </p>
            )}
            <div>
              <p className="mb-1 text-sm font-medium">Riwayat</p>
              {data.timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada interaksi.</p>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
                  {data.timeline.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-24 shrink-0 text-muted-foreground">{when(t.at)}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{t.title}</span>
                        {t.detail && (
                          <span className="block truncate text-muted-foreground">{t.detail}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toLead.mutate()}
                disabled={toLead.isPending}
              >
                <UserPlus className="h-4 w-4" /> Jadikan prospek
              </Button>
              {confirmDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => del.mutate()}
                  disabled={del.isPending}
                >
                  Yakin hapus?
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Hapus kontak"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
