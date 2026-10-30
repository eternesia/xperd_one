import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getEmailGateway,
  saveEmailGateway,
  testEmailGateway,
  type EmailGatewayInput,
} from "@/lib/email-gateway.functions";

const WORKSPACE_EVENTS = [
  ["invoice_issued", "Faktur AR diterbitkan ke pelanggan"],
  ["payment_received", "Pembayaran diterima"],
  ["invoice_due", "Pengingat jatuh tempo faktur"],
  ["user_invited", "Undangan pengguna baru"],
  ["approval_needed", "Dokumen menunggu persetujuan"],
] as const;
const PLATFORM_EVENTS = [
  ["signup_otp", "Kode OTP verifikasi pendaftaran"],
  ["welcome", "Email selamat datang setelah aktif"],
  ["trial_reminder", "Pengingat trial akan berakhir"],
  ["billing_invoice", "Invoice langganan (H-7)"],
] as const;

const PROVIDERS = [
  { v: "brevo", l: "Brevo (Sendinblue) API" },
  { v: "resend", l: "Resend API" },
  { v: "sendgrid", l: "SendGrid API" },
  { v: "smtp", l: "SMTP (persiapan — via relay)" },
];

export function EmailGatewayPanel({ workspaceId }: { workspaceId: string | null }) {
  const load = useServerFn(getEmailGateway);
  const save = useServerFn(saveEmailGateway);
  const test = useServerFn(testEmailGateway);
  const events = workspaceId ? WORKSPACE_EVENTS : PLATFORM_EVENTS;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [lastTest, setLastTest] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [f, setF] = useState<EmailGatewayInput>({
    workspaceId,
    enabled: false,
    provider: "brevo",
    from_name: "",
    from_email: "",
    reply_to: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_secure: "tls",
    secret: "",
    events: Object.fromEntries(events.map(([k]) => [k, true])),
  });

  useEffect(() => {
    load({ data: { workspaceId } })
      .then((r) => {
        if (r) {
          setF((p) => ({
            ...p,
            ...r,
            workspaceId,
            secret: "",
            events: { ...p.events, ...(r.events ?? {}) },
          }));
          setHasSecret(r.has_secret);
          setLastTest(
            r.last_test_status
              ? `${r.last_test_status} · ${new Date(r.last_test_at).toLocaleString()}`
              : null,
          );
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: f });
      if (f.secret) setHasSecret(true);
      setF((p) => ({ ...p, secret: "" }));
      toast.success("Pengaturan email disimpan");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }
  async function onTest() {
    setBusy(true);
    try {
      await test({ data: { workspaceId, to: testTo } });
      toast.success("Email tes terkirim");
      setLastTest("ok");
    } catch (e) {
      toast.error((e as Error).message);
      setLastTest((e as Error).message);
    }
    setBusy(false);
  }

  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  const isSmtp = f.provider === "smtp";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email gateway
              </CardTitle>
              <CardDescription>
                {workspaceId
                  ? "Pengirim email notifikasi untuk workspace ini."
                  : "Gateway platform untuk OTP pendaftaran, email selamat datang, dan penagihan."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />{" "}
              {f.enabled ? "Aktif" : "Nonaktif"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Provider</Label>
              <Select
                value={f.provider}
                onValueChange={(v) => setF({ ...f, provider: v as EmailGatewayInput["provider"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.v} value={p.v}>
                      {p.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSmtp && (
                <p className="text-xs text-muted-foreground">
                  SMTP disimpan sebagai persiapan. Server cloud belum bisa membuka koneksi SMTP
                  langsung — untuk mengirim sekarang, pilih provider API (mis. Brevo, gratis 300
                  email/hari).
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nama pengirim</Label>
              <Input
                value={f.from_name}
                onChange={(e) => setF({ ...f, from_name: e.target.value })}
                placeholder="XPERD One"
              />
            </div>
            <div className="space-y-2">
              <Label>Email pengirim</Label>
              <Input
                value={f.from_email}
                onChange={(e) => setF({ ...f, from_email: e.target.value })}
                placeholder="noreply@perusahaan.co.id"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Reply-to (opsional)</Label>
              <Input
                value={f.reply_to}
                onChange={(e) => setF({ ...f, reply_to: e.target.value })}
                placeholder="support@perusahaan.co.id"
              />
            </div>
            {isSmtp && (
              <>
                <div className="space-y-2">
                  <Label>SMTP host</Label>
                  <Input
                    value={f.smtp_host}
                    onChange={(e) => setF({ ...f, smtp_host: e.target.value })}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={f.smtp_port ?? ""}
                    onChange={(e) => setF({ ...f, smtp_port: Number(e.target.value) || null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={f.smtp_user}
                    onChange={(e) => setF({ ...f, smtp_user: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Keamanan</Label>
                  <Select
                    value={f.smtp_secure}
                    onValueChange={(v) => setF({ ...f, smtp_secure: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">STARTTLS (587)</SelectItem>
                      <SelectItem value="ssl">SSL (465)</SelectItem>
                      <SelectItem value="none">Tanpa enkripsi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>{isSmtp ? "Password SMTP" : "API key"}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={f.secret}
                onChange={(e) => setF({ ...f, secret: e.target.value })}
                placeholder={
                  hasSecret ? "•••••••• tersimpan — isi untuk mengganti" : "Masukkan kunci"
                }
              />
              <p className="text-xs text-muted-foreground">
                Disimpan aman di server dan tidak pernah ditampilkan kembali.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifikasi yang dikirim</CardTitle>
          <CardDescription>Pilih kejadian yang memicu email otomatis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map(([k, label]) => (
            <label
              key={k}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              {label}
              <Switch
                checked={!!f.events[k]}
                onCheckedChange={(v) => setF({ ...f, events: { ...f.events, [k]: v } })}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uji koneksi</CardTitle>
          <CardDescription>
            {lastTest ? `Hasil terakhir: ${lastTest}` : "Belum pernah diuji."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="email-tujuan@contoh.com"
          />
          <Button variant="outline" onClick={onTest} disabled={busy || !testTo}>
            <Send className="mr-1 h-4 w-4" /> Kirim tes
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}{" "}
          Simpan
        </Button>
      </div>
    </div>
  );
}
