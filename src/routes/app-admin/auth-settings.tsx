import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { savePlatformAuthSettings } from "@/lib/qalling-auth.functions";
import { useAuthSettings, type AuthSettings } from "@/components/qalling/qalling-auth";

export const Route = createFileRoute("/app-admin/auth-settings")({
  head: () => ({
    meta: [
      { title: "Login & Pendaftaran — XPERD Super Admin" },
      { name: "description", content: "Pengaturan metode masuk dan lama trial Qalling." },
      { property: "og:title", content: "Login & Pendaftaran — XPERD" },
      { property: "og:description", content: "Pengaturan akses Qalling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthSettingsPage,
});

function AuthSettingsPage() {
  const qc = useQueryClient();
  const { data } = useAuthSettings();
  const [form, setForm] = useState<AuthSettings | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const save = useMutation({
    mutationFn: async (v: AuthSettings) => {
      if (!Number.isInteger(v.trial_days) || v.trial_days < 1 || v.trial_days > 90)
        throw new Error("Lama trial harus 1–90 hari");
      await savePlatformAuthSettings({ data: v });
    },
    onSuccess: () => {
      toast.success("Pengaturan disimpan");
      qc.invalidateQueries({ queryKey: ["platform-auth-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const callback =
    typeof window !== "undefined" ? `${window.location.origin}/qalling/login` : "/qalling/login";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Login & Pendaftaran</h1>
        <p className="text-sm text-muted-foreground">
          Atur cara pelanggan Qalling mendaftar dan masuk, serta lama masa trial.
        </p>
      </div>

      {form && (
        <form
          className="space-y-4 rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <Row
            title="Masuk & daftar dengan Google"
            desc="Akun baru langsung aktif dengan trial — tanpa pilihan paket wajib atau kode email. Butuh penyedia OAuth Google (VITE_GOOGLE_OAUTH_URL)."
          >
            <Switch
              checked={form.google_enabled}
              onCheckedChange={(v) => setForm({ ...form, google_enabled: v })}
              aria-label="Google"
            />
          </Row>
          <Row
            title="Kode masuk lewat email"
            desc="Pelanggan mengisi nama & email, lalu memasukkan kode 6 digit. Butuh Email Gateway aktif."
          >
            <Switch
              checked={form.email_otp_enabled}
              onCheckedChange={(v) => setForm({ ...form, email_otp_enabled: v })}
              aria-label="Kode email"
            />
          </Row>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="trial">Lama trial (hari)</Label>
            <Input
              id="trial"
              type="number"
              min={1}
              max={90}
              value={form.trial_days}
              onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Berlaku untuk pendaftaran baru; trial yang sudah berjalan tidak berubah.
            </p>
          </div>
          <div className="space-y-4 border-t pt-4">
            <div>
              <p className="font-medium">Persetujuan saat mendaftar</p>
              <p className="text-sm text-muted-foreground">
                Pelanggan wajib mencentang kalimat ini sebelum bisa mendaftar. Isi dokumen yang
                kosong tidak ditampilkan sebagai tautan.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="terms_label">Kalimat kotak centang</Label>
              <Input
                id="terms_label"
                value={form.terms_label}
                maxLength={300}
                onChange={(e) => setForm({ ...form, terms_label: e.target.value })}
              />
            </div>
            {(
              [
                ["terms_of_service", "Syarat Layanan (Terms of Service)"],
                ["privacy_policy", "Kebijakan Privasi (Privacy Policy)"],
                ["acceptable_use_policy", "Kebijakan Penggunaan (Acceptable Use Policy)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="grid gap-2">
                <Label htmlFor={k}>{label}</Label>
                <Textarea
                  id={k}
                  rows={6}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button type="submit" variant="gold" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}Simpan
          </Button>
        </form>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-6 text-sm shadow-sm">
        <h2 className="text-base font-semibold">Kunci Google sendiri (opsional)</h2>
        <p className="text-muted-foreground">
          Login Google memakai penyedia OAuth pihak ketiga. Isi VITE_GOOGLE_OAUTH_URL dengan
          endpoint pengalihan OAuth Anda; buat OAuth Client di Google Cloud Console agar layar
          persetujuan menampilkan nama dan logo Qalling.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Google Cloud Console → APIs & Services → OAuth consent screen: isi nama aplikasi dan
            domain (mis. qalling.id).
          </li>
          <li>Credentials → Create credentials → OAuth Client ID → Web application.</li>
          <li>Masukkan alamat callback penyedia OAuth Anda ke “Authorized redirect URIs”.</li>
          <li>Simpan Client ID & Secret pada penyedia OAuth Anda.</li>
        </ol>
        <p className="text-muted-foreground">
          Halaman tujuan setelah login:{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5">{callback}</code>
        </p>
      </section>
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
