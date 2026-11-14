/**
 * Super Admin → Instalasi klien: server XPERD milik klien (self-hosted) yang dipantau & dilisensikan
 * dari pusat. Server klien melapor tiap 5 menit; lisensi (modul, batas pengguna, masa berlaku)
 * ditandatangani pusat sehingga tidak bisa diubah di server klien.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LICENSE_MODULES } from "@/lib/instance";
import {
  adminCreateInstance,
  adminDeleteInstance,
  adminListInstances,
  adminRotateInstanceToken,
  adminUpdateInstance,
} from "@/lib/instances.functions";
import type { ManagedInstance } from "@/lib/managed-instances.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app-admin/instances")({
  head: () => ({ meta: [{ title: "Instalasi klien | XPERD Admin" }] }),
  component: InstancesAdmin,
});

const gb = (n?: number) => (n == null ? "-" : `${(n / 1024 ** 3).toFixed(1)} GB`);
const ago = (min: number | null) =>
  min == null
    ? "belum pernah"
    : min < 1
      ? "baru saja"
      : min < 60
        ? `${min} menit lalu`
        : min < 1440
          ? `${Math.round(min / 60)} jam lalu`
          : `${Math.round(min / 1440)} hari lalu`;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Disalin");
  } catch {
    toast.error("Tidak bisa menyalin");
  }
}

type Form = {
  id?: string;
  name: string;
  client_name: string;
  domain: string;
  modules: string[];
  max_users: number;
  expires_at: string;
  grace_days: number;
  notes: string;
  status: "active" | "suspended";
};

const EMPTY: Form = {
  name: "",
  client_name: "",
  domain: "",
  modules: LICENSE_MODULES.map((m) => m.key),
  max_users: 25,
  expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
  grace_days: 14,
  notes: "",
  status: "active",
};

function InstancesAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-instances"],
    queryFn: () => adminListInstances(),
    refetchInterval: 60_000,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [secret, setSecret] = useState<{
    name: string;
    token: string;
    publicKey: string;
    domain: string;
  } | null>(null);
  const [detail, setDetail] = useState<ManagedInstance | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-instances"] });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const data = {
        name: f.name,
        client_name: f.client_name || null,
        domain: f.domain || null,
        modules: f.modules as ("purchase" | "inventory")[],
        max_users: f.max_users,
        expires_at: f.expires_at || null,
        grace_days: f.grace_days,
        notes: f.notes || null,
      };
      if (f.id) {
        await adminUpdateInstance({ data: { ...data, id: f.id, status: f.status } });
        return null;
      }
      return adminCreateInstance({ data });
    },
    onSuccess: (r, f) => {
      setForm(null);
      void refresh();
      if (r) setSecret({ name: f.name, token: r.token, publicKey: r.publicKey, domain: f.domain });
      else toast.success("Tersimpan — lisensi baru terkirim saat server klien melapor berikutnya");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = q.data?.instances ?? [];
  const online = list.filter((i) => i.online).length;
  const alerts = list.reduce((a, i) => a + i.alerts.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">Instalasi klien</h1>
          <p className="text-sm text-muted-foreground">
            XPERD yang dipasang di server milik klien (subdomain & database mereka sendiri). Server
            klien melapor kesehatan tiap 5 menit ke sini dan menerima lisensi (modul, batas
            pengguna, masa berlaku) yang ditandatangani pusat. Data bisnis klien tidak pernah
            dikirim.
          </p>
        </div>
        <Button onClick={() => setForm({ ...EMPTY })}>
          <Plus /> Instalasi baru
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Instalasi", String(list.length), Server],
            ["Online", `${online}/${list.length}`, CheckCircle2],
            ["Peringatan", String(alerts), AlertTriangle],
          ] as const
        ).map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {label}
            </p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {q.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Belum ada instalasi klien. Klik “Instalasi baru” untuk membuat token & lisensi.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((i) => (
            <div key={i.id} className="space-y-3 rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        i.status === "suspended"
                          ? "bg-muted-foreground"
                          : i.online
                            ? "bg-emerald-500"
                            : "bg-rose-500",
                      )}
                    />
                    <span className="truncate">{i.name}</span>
                    {i.status === "suspended" && <Badge variant="secondary">Ditangguhkan</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[i.client_name, i.domain].filter(Boolean).join(" · ") || "-"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setDetail(i)}>
                    Detail
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({
                        id: i.id,
                        name: i.name,
                        client_name: i.client_name ?? "",
                        domain: i.domain ?? "",
                        modules: i.modules,
                        max_users: i.max_users,
                        expires_at: i.expires_at ?? "",
                        grace_days: i.grace_days,
                        notes: i.notes ?? "",
                        status: i.status === "suspended" ? "suspended" : "active",
                      })
                    }
                  >
                    Lisensi
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {(
                  [
                    ["Lapor", ago(i.last_seen_min)],
                    ["Versi", i.last_version ?? "-"],
                    ["Pengguna", `${i.report?.users_active ?? "-"} / ${i.max_users}`],
                    ["Lisensi s.d.", i.expires_at ?? "tanpa batas"],
                    ["CPU", i.report?.cpu_pct != null ? `${i.report.cpu_pct}%` : "-"],
                    ["RAM", i.report?.mem_pct != null ? `${i.report.mem_pct}%` : "-"],
                    ["Disk", i.report?.disk_pct != null ? `${i.report.disk_pct}%` : "-"],
                    ["Database", gb(i.report?.db_size_bytes)],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="min-w-0 rounded-lg bg-muted/50 p-2">
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                    <p className="truncate font-medium tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {LICENSE_MODULES.filter((m) => i.modules.includes(m.key)).map((m) => (
                  <Badge key={m.key} variant="secondary" className="text-[11px]">
                    {m.name}
                  </Badge>
                ))}
              </div>
              {i.alerts.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  {i.alerts.map((a) => (
                    <li key={a} className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <InstanceDialog
          form={form}
          setForm={setForm}
          saving={save.isPending}
          onSave={() => save.mutate(form)}
          onDeleted={() => {
            setForm(null);
            void refresh();
          }}
          onRotated={(r) => {
            setForm(null);
            setSecret({
              name: form.name,
              token: r.token,
              publicKey: r.publicKey,
              domain: form.domain,
            });
          }}
        />
      )}
      {secret && <SecretDialog s={secret} onClose={() => setSecret(null)} />}
      {detail && <DetailDialog i={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function InstanceDialog({
  form,
  setForm,
  saving,
  onSave,
  onDeleted,
  onRotated,
}: {
  form: Form;
  setForm: (f: Form | null) => void;
  saving: boolean;
  onSave: () => void;
  onDeleted: () => void;
  onRotated: (r: { token: string; publicKey: string }) => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const rotate = useMutation({
    mutationFn: () => adminRotateInstanceToken({ data: { id: form.id! } }),
    onSuccess: onRotated,
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => adminDeleteInstance({ data: { id: form.id! } }),
    onSuccess: onDeleted,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Lisensi instalasi" : "Instalasi baru"}</DialogTitle>
          <DialogDescription>
            Perubahan lisensi diterima server klien paling lambat 5 menit kemudian.
          </DialogDescription>
        </DialogHeader>
        <form
          id="inst-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.modules.length) return toast.error("Pilih minimal 1 modul");
            onSave();
          }}
        >
          <div className="space-y-1">
            <Label>Nama instalasi *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="mis. PT Maju — Produksi"
            />
          </div>
          <div className="space-y-1">
            <Label>Nama klien (di lisensi)</Label>
            <Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Alamat aplikasi klien</Label>
            <Input
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="erp.klien.co.id"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Modul berlisensi</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {LICENSE_MODULES.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                >
                  <Checkbox
                    checked={form.modules.includes(m.key)}
                    onCheckedChange={(v) =>
                      set(
                        "modules",
                        v ? [...form.modules, m.key] : form.modules.filter((x) => x !== m.key),
                      )
                    }
                  />
                  {m.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Data induk (barang, kontak, gudang) selalu tersedia.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Batas pengguna aktif</Label>
            <Input
              type="number"
              min={1}
              value={form.max_users}
              onChange={(e) => set("max_users", Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label>Berlaku sampai (kosong = tanpa batas)</Label>
            <Input
              type="date"
              value={form.expires_at}
              onChange={(e) => set("expires_at", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Masa toleransi setelah habis (hari)</Label>
            <Input
              type="number"
              min={0}
              max={90}
              value={form.grace_days}
              onChange={(e) => set("grace_days", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          {form.id && (
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) => set("status", e.target.value as Form["status"])}
              >
                <option value="active">Aktif</option>
                <option value="suspended">Ditangguhkan (semua modul terkunci)</option>
              </select>
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label>Catatan internal</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </form>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {form.id ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={rotate.isPending}
                onClick={() => {
                  if (
                    confirm(
                      "Buat token baru? Token lama langsung tidak berlaku; server klien perlu diperbarui .env-nya.",
                    )
                  )
                    rotate.mutate();
                }}
              >
                <KeyRound /> Token baru
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={del.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Hapus instalasi "${form.name}" dari daftar? Server klien tidak bisa melapor lagi.`,
                    )
                  )
                    del.mutate();
                }}
              >
                <Trash2 /> Hapus
              </Button>
            </div>
          ) : (
            <span />
          )}
          <Button form="inst-form" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  s,
  onClose,
}: {
  s: { name: string; token: string; publicKey: string; domain: string };
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://xperd.id";
  const env = [
    `XPERD_INSTANCE_MODE=self_hosted`,
    `XPERD_CONTROL_URL=${origin}`,
    `XPERD_INSTANCE_TOKEN=${s.token}`,
    `XPERD_LICENSE_PUBLIC_KEY=${s.publicKey}`,
    s.domain
      ? `APP_PUBLIC_URL=https://${s.domain.replace(/^https?:\/\//, "")}`
      : `APP_PUBLIC_URL=https://erp.klien.co.id`,
  ].join("\n");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Token instalasi: {s.name}</DialogTitle>
          <DialogDescription>
            Token hanya ditampilkan sekali. Masukkan baris berikut ke berkas <code>.env</code> di
            server klien (lihat <code>deploy/self-hosted/README.md</code>), lalu jalankan ulang
            aplikasi.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
          {env}
        </pre>
        <DialogFooter>
          <Button variant="outline" onClick={() => copy(env)}>
            <Copy /> Salin semua
          </Button>
          <Button onClick={onClose}>Sudah disimpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ i, onClose }: { i: ManagedInstance; onClose: () => void }) {
  const r = i.report;
  const rows: [string, string][] = [
    [
      "Terakhir melapor",
      `${ago(i.last_seen_min)}${i.last_seen_at ? ` (${i.last_seen_at} UTC)` : ""}`,
    ],
    ["IP", i.last_ip ?? "-"],
    ["Versi aplikasi", i.last_version ?? "-"],
    ["Host", r?.hostname ?? "-"],
    ["Uptime", r?.uptime_s != null ? `${Math.round(r.uptime_s / 3600)} jam` : "-"],
    ["Beban CPU", r?.cpu_pct != null ? `${r.cpu_pct}%` : "-"],
    ["RAM", r?.mem_pct != null ? `${r.mem_pct}%` : "-"],
    ["Disk", r?.disk_pct != null ? `${r.disk_pct}% (sisa ${gb(r.disk_free_bytes)})` : "-"],
    [
      "Database",
      r ? `${gb(r.db_size_bytes)} · ${r.db_ping_ms} ms · ${r.db_connections} koneksi` : "-",
    ],
    ["Pengguna", r ? `${r.users_active} aktif dari ${r.users_total} (batas ${i.max_users})` : "-"],
    ["Workspace", r?.workspaces != null ? String(r.workspaces) : "-"],
    [
      "Backup DB terakhir",
      r?.last_backup
        ? `${r.last_backup.status} · ${new Date(r.last_backup.at).toLocaleString("id-ID")} · ${gb(r.last_backup.size_bytes)}`
        : "belum ada",
    ],
    ["Status lisensi (di klien)", r?.license_status ?? "-"],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> {i.name}
          </DialogTitle>
          <DialogDescription>{i.domain ?? i.client_name ?? ""}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {r?.errors?.length ? (
          <p className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-700">
            {r.errors.join(" · ")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
