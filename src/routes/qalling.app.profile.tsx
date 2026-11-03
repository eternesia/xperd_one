import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateWorkspaceSettings } from "@/lib/platform.functions";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/qalling/app/profile")({
  head: () => ({
    meta: [
      { title: "Profil & Rekening | Qalling CRM" },
      {
        name: "description",
        content: "Atur logo, kontak usaha dan rekening untuk invoice Qalling.",
      },
      { property: "og:title", content: "Profil & Rekening | Qalling CRM" },
      {
        property: "og:description",
        content: "Atur logo, kontak usaha dan rekening untuk invoice Qalling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { activeWorkspace: ws, refresh } = useApp();
  const [f, setF] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    bank_info: "",
    doc_footer_note: "",
    logo_url: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ws)
      setF({
        name: ws.name ?? "",
        phone: ws.phone ?? "",
        email: ws.email ?? "",
        address: ws.address ?? "",
        bank_info: ws.bank_info ?? "",
        doc_footer_note: ws.doc_footer_note ?? "",
        logo_url: ws.logo_url ?? "",
      });
  }, [ws]);
  if (!ws) return null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  function pickLogo(file?: File) {
    if (!file?.type.startsWith("image/")) return toast.error("File harus gambar");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 400 / img.width, 160 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        setF((p) => ({ ...p, logo_url: c.toDataURL("image/png") }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!ws) return;
    if (!f.name.trim()) return toast.error("Nama usaha wajib diisi");
    setBusy(true);
    const t = (v: string) => v.trim() || null;
    let error: unknown = null;
    try {
      await updateWorkspaceSettings({
        data: {
          workspaceId: ws.id,
          data: {
            name: f.name.trim(),
            phone: t(f.phone),
            email: t(f.email),
            address: t(f.address),
            bank_info: t(f.bank_info),
            doc_footer_note: t(f.doc_footer_note),
            logo_url: f.logo_url || null,
          },
        },
      });
    } catch (e) {
      error = e;
    }
    setBusy(false);
    if (error) return toast.error("Hanya admin workspace yang dapat mengubah profil.");
    toast.success("Profil disimpan");
    await refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Profil & Rekening</h1>
        <p className="text-sm text-muted-foreground">
          Dipakai otomatis di Invoice Cepat (WhatsApp & PDF).
        </p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-32 items-center justify-center rounded-md border bg-muted">
            {f.logo_url ? (
              <img src={f.logo_url} alt="Logo usaha" className="max-h-14 max-w-28 object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Logo</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <label className="cursor-pointer">
                Unggah logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickLogo(e.target.files?.[0])}
                />
              </label>
            </Button>
            {f.logo_url && (
              <Button variant="ghost" size="sm" onClick={() => setF({ ...f, logo_url: "" })}>
                Hapus
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Nama usaha</Label>
            <Input value={f.name} onChange={set("name")} />
          </div>
          <div className="space-y-1">
            <Label>No. WhatsApp / telepon</Label>
            <Input value={f.phone} onChange={set("phone")} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={f.email} onChange={set("email")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Alamat</Label>
            <Textarea rows={2} value={f.address} onChange={set("address")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Rekening bank</Label>
            <Textarea
              rows={3}
              placeholder={"BCA 1234567890 a.n. Nama Usaha"}
              value={f.bank_info}
              onChange={set("bank_info")}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Catatan pembayaran bawaan</Label>
            <Textarea
              rows={2}
              placeholder="Mohon kirim bukti transfer setelah bayar ya 🙏"
              value={f.doc_footer_note}
              onChange={set("doc_footer_note")}
            />
          </div>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
