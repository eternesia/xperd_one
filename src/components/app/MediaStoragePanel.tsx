/** Super Admin → Object Storage: sakelar unggahan ke R2 + pemindahan berkas lama. */
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getMediaStorageStatus,
  setMediaOnR2,
  startMediaMigrationFn,
} from "@/lib/platform-storage.functions";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

const STATUS: Record<string, string> = {
  idle: "Belum pernah dijalankan",
  running: "Sedang memindahkan…",
  done: "Selesai",
  failed: "Selesai dengan kegagalan",
  interrupted: "Terputus (server dimulai ulang) — jalankan lagi untuk melanjutkan",
};

export function MediaStoragePanel() {
  const status = useServerFn(getMediaStorageStatus);
  const toggle = useServerFn(setMediaOnR2);
  const start = useServerFn(startMediaMigrationFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [deleteLocal, setDeleteLocal] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-media-storage"],
    queryFn: () => status(),
    refetchInterval: (q) => (q.state.data?.migration.status === "running" ? 3000 : false),
  });

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["admin-media-storage"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Memuat status berkas…</p>;
  if (error || !data)
    return <p className="text-sm text-destructive">Status berkas tidak bisa dimuat.</p>;

  const m = data.migration;
  const pct = m.total ? Math.round(((m.done + m.failed) / m.total) * 100) : 0;
  const remote = data.remote && !("error" in data.remote) ? data.remote : null;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Berkas unggahan di R2</h2>
          <p className="text-sm text-muted-foreground">
            Saat aktif, unggahan baru (media Qalling, dokumen, bukti transfer, hasil render)
            langsung disimpan di bucket <b>{data.bucket || "—"}</b>. Berkas lama tetap terbaca dari
            disk sampai dipindahkan.
          </p>
        </div>
        <Switch
          checked={data.mediaOnR2}
          disabled={busy || !data.configured}
          onCheckedChange={(v) =>
            act(
              () => toggle({ data: { enabled: v } }),
              v ? "Unggahan baru disimpan di R2" : "Unggahan baru kembali ke disk server",
            )
          }
        />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-muted-foreground">Masih di disk server</div>
          <div className="text-base font-semibold">
            {data.local.count.toLocaleString("id-ID")} berkas · {bytes(data.local.bytes)}
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-muted-foreground">Di bucket {data.bucket}</div>
          <div className="text-base font-semibold">
            {remote
              ? `${remote.count.toLocaleString("id-ID")} objek · ${bytes(remote.bytes)}${remote.partial ? "+" : ""}`
              : data.remote && "error" in data.remote
                ? data.remote.error
                : "—"}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <h3 className="font-medium">Pindahkan berkas lama ke R2</h3>
        <p className="text-sm text-muted-foreground">
          Menyalin semua berkas di disk (kecuali backup) ke bucket, lalu memeriksa ukurannya. Aman
          diulang — berkas yang sudah ada dilewati. Backup tidak ikut dipindahkan.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={deleteLocal}
            onCheckedChange={(v) => setDeleteLocal(v === true)}
            disabled={busy || m.status === "running"}
          />
          Hapus salinan di disk server setelah terverifikasi di R2 (menghemat disk)
        </label>
        <Button
          variant="outline"
          disabled={busy || !data.configured || m.status === "running" || !data.local.count}
          onClick={() =>
            act(() => start({ data: { deleteLocal } }), "Pemindahan dimulai di latar belakang")
          }
        >
          {m.status === "interrupted" || m.status === "failed" ? "Lanjutkan" : "Mulai pindahkan"}
        </Button>

        <div className="space-y-1 text-sm">
          <div>
            Status: <b>{STATUS[m.status] ?? m.status}</b>
          </div>
          {m.total > 0 && (
            <>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-muted-foreground">
                {m.done.toLocaleString("id-ID")} / {m.total.toLocaleString("id-ID")} berkas (
                {bytes(m.doneBytes)} dari {bytes(m.totalBytes)})
                {m.skipped ? ` · ${m.skipped} sudah ada` : ""}
                {m.failed ? ` · ${m.failed} gagal` : ""}
                {m.freedBytes ? ` · disk dihemat ${bytes(m.freedBytes)}` : ""}
              </div>
              {m.current && (
                <div className="truncate text-xs text-muted-foreground">{m.current}</div>
              )}
              {m.lastError && (
                <div className="break-all text-xs text-destructive">
                  Galat terakhir: {m.lastError}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
