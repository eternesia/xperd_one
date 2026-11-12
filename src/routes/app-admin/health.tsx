import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  Cpu,
  Database,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminSystemHealth } from "@/lib/system-health.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app-admin/health")({
  head: () => ({ meta: [{ title: "Kesehatan Sistem | XPERD Admin" }] }),
  component: HealthAdmin,
});

function bytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString("id-ID", { maximumFractionDigits: i >= 3 ? 2 : 1 })} ${u[i]}`;
}

function dur(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} hari ${h} jam` : h ? `${h} jam ${m} mnt` : `${m} mnt`;
}

const when = (iso: string) =>
  new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function Meter({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const tone = pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {pct.toLocaleString("id-ID")}%
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Server;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-gold" /> {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function HealthAdmin() {
  const [rescan, setRescan] = useState(0);
  const q = useQuery({
    queryKey: ["admin-health", rescan],
    queryFn: () => adminSystemHealth({ data: { rescanStorage: rescan > 0 } }),
    refetchInterval: 30_000,
  });
  const h = q.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kesehatan Sistem</h1>
          <p className="text-sm text-muted-foreground">
            Server aplikasi, database, penyimpanan berkas, dan backup. Diperbarui otomatis tiap 30
            detik
            {h && ` · terakhir ${when(h.checkedAt)}`}.
          </p>
        </div>
        <Button variant="outline" disabled={q.isFetching} onClick={() => setRescan((n) => n + 1)}>
          {q.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Periksa ulang
        </Button>
      </div>

      {q.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {q.error && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat: {q.error instanceof Error ? q.error.message : String(q.error)}
        </p>
      )}

      {h && (
        <>
          {/* Peringatan */}
          <div className="space-y-2">
            {h.alerts.length === 0 && (
              <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Semua pemeriksaan normal.
              </p>
            )}
            {h.alerts.map((a, i) => {
              const Icon =
                a.level === "critical"
                  ? AlertOctagon
                  : a.level === "warning"
                    ? AlertTriangle
                    : Info;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-3 sm:p-4",
                    a.level === "critical" && "border-red-500/40 bg-red-500/5",
                    a.level === "warning" && "border-amber-500/40 bg-amber-500/5",
                    a.level === "info" && "border-sky-500/30 bg-sky-500/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      a.level === "critical"
                        ? "text-red-600"
                        : a.level === "warning"
                          ? "text-amber-600"
                          : "text-sky-600",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel icon={Server} title="Server aplikasi">
              <div className="space-y-4">
                <Meter
                  pct={h.server.mem.pct}
                  label="RAM"
                  sub={`${bytes(h.server.mem.used)} dari ${bytes(h.server.mem.total)} · proses aplikasi ${bytes(h.server.process.rss)}`}
                />
                {h.server.disks.map((d) => (
                  <Meter
                    key={d.path}
                    pct={d.pct}
                    label={d.path === "/" ? "Disk sistem (/)" : `Disk penyimpanan (${d.path})`}
                    sub={`${bytes(d.used)} dari ${bytes(d.total)} · sisa ${bytes(d.free)}`}
                  />
                ))}
                <KV
                  rows={[
                    ["Host", h.server.hostname],
                    ["CPU", `${h.server.cpuCount} inti`],
                    ["Beban (1/5/15 mnt)", h.server.load.join(" / ")],
                    ["Server menyala", dur(h.server.uptimeSec)],
                    ["Aplikasi berjalan", dur(h.server.processUptimeSec)],
                    ["Node.js", h.server.node],
                    ["Versi", h.server.version ?? "—"],
                    ["Penjadwal", h.server.schedulerDisabled ? "Mati" : "Aktif"],
                  ]}
                />
              </div>
            </Panel>

            <Panel icon={Database} title="Database (MySQL)">
              <div className="space-y-4">
                {h.database.maxConnections > 0 && (
                  <Meter
                    pct={
                      Math.round((h.database.threadsConnected / h.database.maxConnections) * 1000) /
                      10
                    }
                    label="Koneksi"
                    sub={`${h.database.threadsConnected} aktif dari maks ${h.database.maxConnections} · puncak ${h.database.maxUsedConnections}`}
                  />
                )}
                <KV
                  rows={[
                    ["Host", h.database.host],
                    ["Versi", h.database.version ?? "—"],
                    ["Waktu respons", `${h.database.pingMs} ms`],
                    ["Menyala", dur(h.database.uptimeSec)],
                    [
                      "Ukuran total",
                      `${bytes(h.database.sizeBytes)} (${h.database.tableCount} tabel)`,
                    ],
                    ["Query lambat", h.database.slowQueries.toLocaleString("id-ID")],
                    ["Buffer pool", bytes(h.database.bufferPoolBytes)],
                    [
                      "Migrasi terakhir",
                      h.database.lastMigration
                        ? `${h.database.lastMigration.name} · ${when(h.database.lastMigration.appliedAt)}`
                        : "—",
                    ],
                    [
                      "Data",
                      h.database.counts
                        ? `${h.database.counts.tenants} tenant · ${h.database.counts.workspaces} workspace · ${h.database.counts.users} pengguna`
                        : "—",
                    ],
                  ]}
                />
              </div>
            </Panel>

            <Panel icon={Database} title="Tabel terbesar">
              <table className="q-keep w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Tabel</th>
                    <th className="pb-2 text-right font-medium">Baris (perkiraan)</th>
                    <th className="pb-2 text-right font-medium">Ukuran</th>
                  </tr>
                </thead>
                <tbody>
                  {h.database.topTables.map((t) => (
                    <tr key={t.name} className="border-t border-border">
                      <td className="max-w-[12rem] truncate py-1.5 font-mono text-xs">{t.name}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {t.rows.toLocaleString("id-ID")}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{bytes(t.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel icon={HardDrive} title="Penyimpanan berkas">
              <div className="space-y-4">
                <KV
                  rows={[
                    ["Lokasi", h.storage.exists ? h.storage.root : `${h.storage.root} (belum ada)`],
                    [
                      "Total",
                      `${bytes(h.storage.total)} · ${h.storage.files.toLocaleString("id-ID")} berkas${h.storage.partial ? " (sebagian)" : ""}`,
                    ],
                    [
                      "Object storage",
                      h.storage.objectStorageConfigured
                        ? `${h.storage.objectStorageProvider} diatur, belum dipakai unggahan`
                        : "Belum diatur",
                    ],
                    ["Dihitung", when(new Date(h.storage.cachedAt).toISOString())],
                  ]}
                />
                {h.storage.folders.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Per folder</p>
                    <div className="space-y-1.5">
                      {h.storage.folders.slice(0, 8).map((f) => (
                        <div key={f.name} className="flex items-center gap-2 text-sm">
                          <span className="w-28 shrink-0 truncate font-mono text-xs">{f.name}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-navy dark:bg-primary"
                              style={{
                                width: `${h.storage.total ? (f.bytes / h.storage.total) * 100 : 0}%`,
                              }}
                            />
                          </span>
                          <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                            {bytes(f.bytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {h.storage.perTenant.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Pemakaian per tenant (berkas tercatat)
                    </p>
                    <table className="q-keep w-full text-sm">
                      <tbody>
                        {h.storage.perTenant.map((r) => (
                          <tr key={r.tenant} className="border-t border-border">
                            <td className="max-w-[12rem] truncate py-1.5">{r.tenant}</td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                              {r.files.toLocaleString("id-ID")} berkas
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{bytes(r.bytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Panel>

            <Panel icon={Archive} title="Backup">
              {h.backup ? (
                <KV
                  rows={[
                    ["Terakhir", when(h.backup.finishedAt)],
                    ["Status", h.backup.status],
                    ["Ukuran", bytes(h.backup.sizeBytes)],
                    ["Tujuan", h.backup.target],
                  ]}
                />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-red-600">Belum ada backup otomatis.</p>
                  <p className="text-muted-foreground">
                    Database, berkas unggahan, dan aplikasi saat ini berada di satu server. Bila
                    server rusak, semuanya hilang bersamaan. Disarankan backup harian database +
                    folder berkas ke lokasi lain (mis. Cloudflare R2/S3) dengan retensi 14 hari.
                  </p>
                </div>
              )}
            </Panel>

            <Panel icon={Cpu} title="Proses aplikasi">
              <div className="space-y-4">
                <Meter
                  pct={
                    Math.round(
                      (h.server.process.heapUsed / Math.max(1, h.server.process.heapTotal)) * 1000,
                    ) / 10
                  }
                  label="Heap JavaScript"
                  sub={`${bytes(h.server.process.heapUsed)} dari ${bytes(h.server.process.heapTotal)}`}
                />
                <KV
                  rows={[
                    ["Lingkungan", h.server.env],
                    ["Platform", h.server.platform],
                    ["Mulai", when(h.server.startedAt)],
                    ["Memori proses (RSS)", bytes(h.server.process.rss)],
                  ]}
                />
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MemoryStick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Angka server diambil dari mesin yang menjalankan aplikasi ini. Bila nanti database
                  dipisah ke server lain, panel Database tetap membaca server database tersebut.
                </p>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
