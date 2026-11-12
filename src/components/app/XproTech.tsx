/**
 * XPro — tab "Teknis & serah terima" di detail proyek: repo source code, database, server,
 * URL, domain, layanan & akun (rahasia terenkripsi), catatan dokumentasi, kelengkapan serah
 * terima, riwayat akses, dan unduh paket serah terima (Markdown).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Puzzle,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteXproTechAsset,
  deleteXproTechNote,
  exportXproHandover,
  listXproTech,
  revealXproTechSecret,
  saveXproTechAsset,
  saveXproTechNote,
} from "@/lib/xpro-vault.functions";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof listXproTech>>;
type Asset = Data["assets"][number];
type Note = Data["notes"][number];

const KINDS: { key: string; label: string; icon: typeof Server; hint: string }[] = [
  { key: "repo", label: "Repositori", icon: GitBranch, hint: "GitHub/GitLab, branch utama" },
  { key: "database", label: "Database", icon: Database, hint: "Host, nama DB, user" },
  { key: "server", label: "Server / hosting", icon: Server, hint: "VPS, cPanel, cloud" },
  { key: "url", label: "URL aplikasi", icon: Link2, hint: "Produksi, staging, admin" },
  { key: "domain", label: "Domain & DNS", icon: Globe, hint: "Registrar, Cloudflare" },
  { key: "service", label: "Layanan pihak ketiga", icon: Puzzle, hint: "API, email, payment" },
  { key: "account", label: "Akun", icon: KeyRound, hint: "Login lain" },
  { key: "other", label: "Lainnya", icon: Cloud, hint: "" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
const ENVS: [string, string][] = [
  ["production", "Produksi"],
  ["staging", "Staging"],
  ["development", "Development"],
  ["other", "Lainnya"],
];
const ENV_LABEL = Object.fromEntries(ENVS);
const CATS: [string, string][] = [
  ["setup", "Setup & instalasi"],
  ["architecture", "Arsitektur"],
  ["deploy", "Deploy & operasional"],
  ["handover", "Serah terima"],
  ["log", "Log pekerjaan"],
  ["other", "Lainnya"],
];
const CAT_LABEL = Object.fromEntries(CATS);

const NOTE_TEMPLATES: Record<string, string> = {
  setup:
    "## Kebutuhan\n- Node/PHP versi:\n- Database:\n\n## Langkah instalasi lokal\n1. Clone repo\n2. Salin .env.example → .env dan isi\n3. Instal dependensi\n4. Jalankan migrasi\n5. Jalankan aplikasi\n",
  deploy:
    "## Cara deploy\n- Branch produksi:\n- Perintah / pipeline:\n\n## Variabel lingkungan penting\n- \n\n## Backup & pemulihan\n- \n\n## Cron / job terjadwal\n- \n",
  handover:
    "## Ringkasan pekerjaan\n\n## Yang sudah selesai\n- \n\n## Yang belum selesai / diketahui bermasalah\n- \n\n## Akses yang perlu dicabut / diganti\n- \n\n## Kontak & catatan lain\n",
  log: `## ${new Date().toISOString().slice(0, 10)}\n- Dikerjakan:\n- Kendala:\n- Rencana berikutnya:\n`,
};

const fmtDate = (s: string | null) =>
  s
    ? new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <AdminField label={label}>{children}</AdminField>
    </div>
  );
}

async function copy(text: string, label = "Disalin") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Tidak bisa menyalin");
  }
}

export function XproTech({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const qc = useQueryClient();
  const key = ["xpro-tech", workspaceId, projectId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => listXproTech({ data: { workspaceId, projectId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [assetDlg, setAssetDlg] = useState<Partial<Asset> | null>(null);
  const [noteDlg, setNoteDlg] = useState<Partial<Note> | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [noteFilter, setNoteFilter] = useState("all");

  const d = q.data;
  const checklist = useMemo(() => {
    if (!d) return [];
    const has = (k: string, env?: string) =>
      d.assets.some((a) => a.kind === k && (!env || a.environment === env));
    const note = (c: string) => d.notes.some((n) => n.category === c);
    return [
      ["Repositori source code", has("repo")],
      ["Database", has("database")],
      ["Server / hosting", has("server")],
      ["URL produksi", has("url", "production")],
      ["Domain & DNS", has("domain")],
      ["Catatan setup & instalasi", note("setup")],
      ["Catatan deploy & operasional", note("deploy")],
      ["Catatan serah terima", note("handover")],
    ] as [string, boolean][];
  }, [d]);

  if (q.isLoading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (q.error || !d)
    return (
      <p className="p-4 text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Gagal memuat"}
      </p>
    );

  const done = checklist.filter(([, ok]) => ok).length;
  const notes = d.notes.filter((n) => noteFilter === "all" || n.category === noteFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">Teknis & serah terima</h3>
          <p className="text-sm text-muted-foreground">
            Simpan semua repo, database, server, URL, dan akses proyek di sini, beserta catatan cara
            menjalankan & deploy. Saat freelancer atau anggota tim selesai, semua pengetahuan tetap
            tinggal di workspace. Password/token dienkripsi dan hanya bisa dibuka pengelola atau
            pembuatnya.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.canWrite && (
            <>
              <Button
                size="sm"
                variant="navy"
                onClick={() => setAssetDlg({ kind: "repo", environment: "production" })}
              >
                <Plus /> Aset
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNoteDlg({ category: "setup", body: NOTE_TEMPLATES.setup })}
              >
                <BookOpen /> Catatan
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
            <Download /> Paket serah terima
          </Button>
        </div>
      </div>

      {/* kelengkapan */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-gold" /> Kelengkapan serah terima
          </p>
          <span className="text-xs text-muted-foreground">
            {done}/{checklist.length}
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              done === checklist.length ? "bg-emerald-500" : "bg-gold",
            )}
            style={{ width: `${(done / Math.max(1, checklist.length)) * 100}%` }}
          />
        </div>
        <div className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {checklist.map(([label, ok]) => (
            <span
              key={label}
              className={cn("flex items-center gap-1.5", !ok && "text-muted-foreground")}
            >
              {ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0" />
              )}
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* aset */}
      {d.assets.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Belum ada aset teknis. Mulai dari repositori source code, database, dan URL produksi.
        </p>
      ) : (
        KINDS.filter((k) => d.assets.some((a) => a.kind === k.key)).map((k) => (
          <section key={k.key} className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <k.icon className="h-4 w-4" /> {k.label}
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              {d.assets
                .filter((a) => a.kind === k.key)
                .map((a) => (
                  <AssetCard
                    key={a.id}
                    a={a}
                    canWrite={d.canWrite}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    onEdit={() => setAssetDlg(a)}
                    onChanged={refresh}
                  />
                ))}
            </div>
          </section>
        ))
      )}

      {/* catatan */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-gold" /> Dokumentasi
          </h4>
          <AdminSelect value={noteFilter} onChange={setNoteFilter} className="w-48">
            <option value="all">Semua kategori</option>
            {CATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AdminSelect>
        </div>
        {notes.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada catatan. Tulis cara instalasi, deploy, keputusan arsitektur, atau log harian.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <details key={n.id} className="group rounded-2xl border bg-card p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                  <Badge variant="secondary">{CAT_LABEL[n.category] ?? n.category}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {n.author ?? "-"} · {fmtDate(n.updated_at)}
                  </span>
                </summary>
                <div className="mt-3 whitespace-pre-wrap break-words border-t pt-3 text-sm">
                  {n.body || "-"}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => copy(n.body, "Catatan disalin")}>
                    <Copy /> Salin
                  </Button>
                  {d.canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setNoteDlg(n)}>
                        <Pencil /> Ubah
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Hapus catatan ini?")) return;
                          try {
                            await deleteXproTechNote({
                              data: { workspaceId, projectId, id: n.id },
                            });
                            void refresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 /> Hapus
                      </Button>
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {d.isManager && d.logs.length > 0 && (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Riwayat akses rahasia & ekspor
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {d.logs.map((l, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="text-foreground">{l.who ?? "?"}</span>
                {
                  {
                    reveal: "membuka rahasia",
                    secret_update: "mengubah rahasia",
                    delete: "menghapus aset",
                    export: "mengunduh paket serah terima",
                  }[l.action]
                }
                {l.asset && <b className="text-foreground">{l.asset}</b>}
                {l.detail && <span>({l.detail})</span>}
                <span>· {new Date(l.at.replace(" ", "T") + "Z").toLocaleString("id-ID")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {assetDlg && (
        <AssetDialog
          initial={assetDlg}
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setAssetDlg(null)}
          onSaved={() => {
            setAssetDlg(null);
            void refresh();
          }}
        />
      )}
      {noteDlg && (
        <NoteDialog
          initial={noteDlg}
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setNoteDlg(null)}
          onSaved={() => {
            setNoteDlg(null);
            void refresh();
          }}
        />
      )}
      {exportOpen && (
        <ExportDialog
          workspaceId={workspaceId}
          projectId={projectId}
          isManager={d.isManager}
          onClose={() => setExportOpen(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function AssetCard({
  a,
  canWrite,
  workspaceId,
  projectId,
  onEdit,
  onChanged,
}: {
  a: Asset;
  canWrite: boolean;
  workspaceId: string;
  projectId: string;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => revealXproTechSecret({ data: { workspaceId, projectId, id: a.id } }),
    onSuccess: (r) => setSecret(r.value),
    onError: (e: Error) => toast.error(e.message),
  });
  const Icon = KIND[a.kind]?.icon ?? Cloud;
  const href = a.url && /^https?:\/\//i.test(a.url) ? a.url : null;
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{a.name}</span>
            <Badge
              variant={a.environment === "production" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {ENV_LABEL[a.environment] ?? a.environment}
            </Badge>
          </div>
          {a.url && (
            <div className="mt-1 flex items-center gap-1 text-sm">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-sky-700 hover:underline dark:text-sky-400"
                >
                  {a.url}
                </a>
              ) : (
                <span className="truncate font-mono text-xs">{a.url}</span>
              )}
              {href && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <button
                type="button"
                className="shrink-0 rounded p-1 hover:bg-muted"
                onClick={() => copy(a.url!)}
                aria-label="Salin URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        {canWrite && (
          <div className="flex shrink-0">
            <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Ubah">
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Hapus"
              onClick={async () => {
                if (!confirm(`Hapus aset "${a.name}"?`)) return;
                try {
                  await deleteXproTechAsset({ data: { workspaceId, projectId, id: a.id } });
                  onChanged();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-sm">
        {a.host && (
          <>
            <dt className="text-muted-foreground">Host</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-xs">{a.host}</span>
              <button
                type="button"
                className="rounded p-1 hover:bg-muted"
                onClick={() => copy(a.host!)}
                aria-label="Salin host"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </dd>
          </>
        )}
        {a.username && (
          <>
            <dt className="text-muted-foreground">Pengguna</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-xs">{a.username}</span>
              <button
                type="button"
                className="rounded p-1 hover:bg-muted"
                onClick={() => copy(a.username!)}
                aria-label="Salin pengguna"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </dd>
          </>
        )}
        {a.has_secret && (
          <>
            <dt className="text-muted-foreground">{a.secret_label || "Rahasia"}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              {a.can_reveal ? (
                <>
                  <span className="truncate font-mono text-xs">{secret ?? "••••••••••"}</span>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    disabled={reveal.isPending}
                    onClick={() => (secret ? setSecret(null) : reveal.mutate())}
                    aria-label={secret ? "Sembunyikan" : "Lihat"}
                  >
                    {secret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  {secret && (
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      onClick={() => copy(secret, "Rahasia disalin")}
                      aria-label="Salin rahasia"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  tersimpan terenkripsi (pengelola)
                </span>
              )}
            </dd>
          </>
        )}
        {a.account_owner && (
          <>
            <dt className="text-muted-foreground">Pemilik akun</dt>
            <dd className="truncate">{a.account_owner}</dd>
          </>
        )}
      </dl>
      {a.notes && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 text-xs">
          {a.notes}
        </p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
        <span>Diperbarui {fmtDate(a.updated_at)}</span>
        {a.updated_by_name && <span>oleh {a.updated_by_name}</span>}
        {a.last_verified_at && (
          <span className="flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" /> dicek {fmtDate(a.last_verified_at)}
          </span>
        )}
      </p>
    </div>
  );
}

function AssetDialog({
  initial,
  workspaceId,
  projectId,
  onClose,
  onSaved,
}: {
  initial: Partial<Asset>;
  workspaceId: string;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    kind: initial.kind ?? "repo",
    name: initial.name ?? "",
    environment: initial.environment ?? "production",
    url: initial.url ?? "",
    host: initial.host ?? "",
    username: initial.username ?? "",
    secret_label: initial.secret_label ?? "",
    account_owner: initial.account_owner ?? "",
    notes: initial.notes ?? "",
  });
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [verified, setVerified] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      saveXproTechAsset({
        data: {
          workspaceId,
          projectId,
          id: initial.id,
          ...f,
          kind: f.kind as "repo",
          environment: f.environment as "production",
          secret: clearSecret ? "" : secret ? secret : undefined,
          verified,
        },
      }),
    onSuccess: () => {
      toast.success("Aset tersimpan");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const placeholders: Record<string, Partial<Record<keyof typeof f, string>>> = {
    repo: {
      url: "https://github.com/org/repo",
      host: "branch: main",
      username: "deploy key / user",
    },
    database: {
      url: "mysql://… (opsional)",
      host: "db.host:3306 / nama database",
      username: "user DB",
    },
    server: { url: "https://panel…", host: "IP / hostname, port SSH", username: "root / user SSH" },
    url: { url: "https://app.klien.com", host: "", username: "akun admin aplikasi" },
    domain: {
      url: "https://dash.cloudflare.com",
      host: "klien.com · registrar",
      username: "akun registrar",
    },
    service: { url: "https://dashboard…", host: "", username: "akun / client id" },
  };
  const ph = placeholders[f.kind] ?? {};
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Ubah aset" : "Tambah aset teknis"}</DialogTitle>
        </DialogHeader>
        <form
          id="asset-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Jenis">
            <AdminSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v })}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                  {k.hint ? ` — ${k.hint}` : ""}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="Lingkungan">
            <AdminSelect value={f.environment} onChange={(v) => setF({ ...f, environment: v })}>
              {ENVS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field wide label="Nama *">
            <Input required maxLength={150} value={f.name} onChange={set("name")} />
          </Field>
          <Field wide label="URL">
            <Input maxLength={500} value={f.url} onChange={set("url")} placeholder={ph.url} />
          </Field>
          <Field label="Host / detail">
            <Input maxLength={255} value={f.host} onChange={set("host")} placeholder={ph.host} />
          </Field>
          <Field label="Pengguna / login">
            <Input
              maxLength={150}
              value={f.username}
              onChange={set("username")}
              placeholder={ph.username}
              autoComplete="off"
            />
          </Field>
          <Field label="Label rahasia">
            <Input
              maxLength={60}
              value={f.secret_label}
              onChange={set("secret_label")}
              placeholder="Password / Token / SSH key"
            />
          </Field>
          <Field label={initial.has_secret ? "Rahasia baru (kosong = tetap)" : "Rahasia"}>
            <Textarea
              rows={1}
              value={secret}
              disabled={clearSecret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={initial.has_secret ? "•••••••• tersimpan" : "disimpan terenkripsi"}
              autoComplete="off"
              className="font-mono text-xs"
            />
          </Field>
          {initial.has_secret && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={clearSecret} onCheckedChange={(v) => setClearSecret(v === true)} />
              Hapus rahasia yang tersimpan
            </label>
          )}
          <Field wide label="Pemilik akun / penagihan">
            <Input
              maxLength={150}
              value={f.account_owner}
              onChange={set("account_owner")}
              placeholder="Atas nama siapa akun ini & siapa yang membayar (klien / perusahaan / freelancer)"
            />
          </Field>
          <Field wide label="Catatan">
            <Textarea
              rows={3}
              maxLength={5000}
              value={f.notes}
              onChange={set("notes")}
              placeholder="Cara akses, port, batasan, tanggal perpanjangan…"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={verified} onCheckedChange={(v) => setVerified(v === true)} />
            Saya sudah mengecek akses ini masih berfungsi hari ini
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button form="asset-form" variant="navy" disabled={save.isPending}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  initial,
  workspaceId,
  projectId,
  onClose,
  onSaved,
}: {
  initial: Partial<Note>;
  workspaceId: string;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(initial.category ?? "setup");
  const [title, setTitle] = useState(initial.title ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const save = useMutation({
    mutationFn: () =>
      saveXproTechNote({
        data: {
          workspaceId,
          projectId,
          id: initial.id,
          category: category as "setup",
          title,
          body,
        },
      }),
    onSuccess: () => {
      toast.success("Catatan tersimpan");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Ubah catatan" : "Catatan dokumentasi"}</DialogTitle>
        </DialogHeader>
        <form
          id="note-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <Field label="Kategori">
              <AdminSelect
                value={category}
                onChange={(v) => {
                  // Ganti templat hanya bila isi masih templat bawaan / kosong.
                  const untouched = !body.trim() || Object.values(NOTE_TEMPLATES).includes(body);
                  setCategory(v);
                  if (!initial.id && untouched) setBody(NOTE_TEMPLATES[v] ?? "");
                }}
              >
                {CATS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="Judul *">
              <Input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="mis. Cara deploy ke VPS produksi"
              />
            </Field>
          </div>
          <Textarea
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-xs"
            placeholder="Tulis langkah, perintah, keputusan, dan hal penting lainnya (format Markdown)."
          />
          <p className="text-xs text-muted-foreground">
            Jangan menulis password di catatan — simpan sebagai rahasia di aset agar terenkripsi.
          </p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button form="note-form" variant="navy" disabled={save.isPending}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportDialog({
  workspaceId,
  projectId,
  isManager,
  onClose,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  isManager: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [withSecrets, setWithSecrets] = useState(false);
  const run = useMutation({
    mutationFn: () =>
      exportXproHandover({ data: { workspaceId, projectId, includeSecrets: withSecrets } }),
    onSuccess: (r) => {
      const url = URL.createObjectURL(new Blob([r.markdown], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unduh paket serah terima</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Satu dokumen (Markdown) berisi semua aset teknis, catatan dokumentasi, tim, dan tugas yang
          belum selesai — siap diserahkan ke klien atau pengganti.
        </p>
        {isManager && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={withSecrets}
              onCheckedChange={(v) => setWithSecrets(v === true)}
              className="mt-0.5"
            />
            <span>
              Sertakan password/token (terbuka di dokumen). Tercatat di riwayat akses; ganti
              kredensial setelah serah terima.
            </span>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="navy" onClick={() => run.mutate()} disabled={run.isPending}>
            <Download /> Unduh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
