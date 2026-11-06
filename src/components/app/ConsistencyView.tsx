import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Info, Loader2, MinusCircle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getConsistencyReport, type ConsistencyCheck, type ConsistencyStatus } from "@/lib/consistency.functions";
import { cn } from "@/lib/utils";

const META: Record<ConsistencyStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  ok: { label: "Sesuai", icon: CheckCircle2, cls: "text-emerald-600" },
  warn: { label: "Perlu perhatian", icon: AlertTriangle, cls: "text-amber-600" },
  fail: { label: "Tidak sesuai", icon: XCircle, cls: "text-destructive" },
  info: { label: "Info", icon: Info, cls: "text-sky-600" },
  na: { label: "Tidak berlaku", icon: MinusCircle, cls: "text-muted-foreground" },
};

export function ConsistencyView({ workspaceId }: { workspaceId: string }) {
  const run = useServerFn(getConsistencyReport);
  const q = useQuery({ queryKey: ["consistency", workspaceId], queryFn: () => run({ data: { workspaceId } }), staleTime: 0 });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const checks = q.data?.checks ?? [];
  const count = useMemo(() => {
    const c: Record<ConsistencyStatus, number> = { ok: 0, warn: 0, fail: 0, info: 0, na: 0 };
    for (const x of checks) c[x.status]++;
    return c;
  }, [checks]);
  const groups = useMemo(() => {
    const m = new Map<string, ConsistencyCheck[]>();
    for (const x of checks) m.set(x.group, [...(m.get(x.group) ?? []), x]);
    return [...m.entries()];
  }, [checks]);

  function copyReport() {
    const lines = [`Cek Konsistensi — ${new Date(q.data?.generatedAt ?? Date.now()).toLocaleString("id-ID")}`, ""];
    for (const [g, list] of groups) {
      lines.push(`## ${g}`);
      for (const x of list) {
        lines.push(`[${META[x.status].label}] ${x.title} — ${x.summary}`);
        for (const r of x.rows ?? []) lines.push(`    • ${r.label}: ${r.value}`);
        if (x.status !== "ok" && x.status !== "na" && x.hint) lines.push(`    → ${x.hint}`);
      }
      lines.push("");
    }
    void navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success("Laporan disalin"));
  }

  const headline = count.fail > 0 ? "Ada yang tidak sesuai" : count.warn > 0 ? "Sebagian perlu perhatian" : "Semua pengecekan sesuai";
  const headCls = count.fail > 0 ? "text-destructive" : count.warn > 0 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">AKUNTANSI</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">Cek Konsistensi</h1>
          <p className="text-sm text-muted-foreground">Memeriksa apakah jurnal, stok, piutang/hutang, dan produksi saling cocok. Hanya membaca data, tidak mengubah apa pun.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyReport} disabled={!checks.length}><Copy className="size-4" />Salin laporan</Button>
          <Button variant="navy" onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Periksa ulang</Button>
        </div>
      </div>

      {q.isPending ? <Loader2 className="m-8 animate-spin text-muted-foreground" /> : q.isError ? <p className="text-destructive">{q.error.message}</p> : (
        <>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className={cn("text-lg font-semibold", headCls)}>{headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {count.ok} sesuai · {count.warn} perlu perhatian · {count.fail} tidak sesuai · {count.info} info · {count.na} tidak berlaku
            </p>
          </div>
          {groups.map(([g, list]) => (
            <section key={g} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {list.map((x) => {
                  const M = META[x.status];
                  const expandable = Boolean(x.rows?.length || (x.hint && x.status !== "ok" && x.status !== "na"));
                  const isOpen = open[x.id] ?? (x.status === "fail" || x.status === "warn");
                  return (
                    <div key={x.id} className="p-3">
                      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => expandable && setOpen({ ...open, [x.id]: !isOpen })}>
                        <M.icon className={cn("mt-0.5 size-5 shrink-0", M.cls)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{x.title}</p>
                          <p className={cn("text-sm", x.status === "ok" || x.status === "na" ? "text-muted-foreground" : M.cls)}>{x.summary}</p>
                        </div>
                        {expandable && (isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />)}
                      </button>
                      {expandable && isOpen && (
                        <div className="ml-8 mt-2 space-y-2">
                          {x.rows && x.rows.length > 0 && (
                            <div className="overflow-hidden rounded-lg border border-border text-sm">
                              {x.rows.map((r, i) => <div key={i} className="flex justify-between gap-4 border-b border-border px-3 py-1.5 last:border-b-0"><span className="text-muted-foreground">{r.label}</span><span className="text-right font-medium">{r.value}</span></div>)}
                            </div>
                          )}
                          {x.hint && x.status !== "ok" && x.status !== "na" && <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Yang perlu disesuaikan: </span>{x.hint}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">Diperiksa {new Date(q.data.generatedAt).toLocaleString("id-ID")}. Selisih sampai Rp1 dianggap pembulatan.</p>
        </>
      )}
    </div>
  );
}
