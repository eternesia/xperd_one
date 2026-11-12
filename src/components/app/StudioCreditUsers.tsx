/** Super Admin → Studio AI → Kredit user: tabel kredit per tenant + detail riwayat pemakaian. */
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { AdminSelect } from "@/components/app/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  adminCreditUserDetail,
  adminCreditUsers,
  adminGrantCredits,
} from "@/lib/ai-studio.functions";
import { TEMPLATES } from "@/lib/ai-templates";
import { cn } from "@/lib/utils";

const rp = (v: number) => `Rp${Math.round(v).toLocaleString("id-ID")}`;
const num = (v: number) => v.toLocaleString("id-ID");
const when = (s: string | null) =>
  s
    ? new Date(s.replace(" ", "T") + "Z").toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
const KIND: Record<string, [string, string]> = {
  purchase: ["Beli", "bg-violet-500/15 text-violet-700 dark:text-violet-300"],
  usage: ["Pakai", "bg-sky-500/15 text-sky-700 dark:text-sky-300"],
  refund: ["Kembali", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"],
  bonus: ["Bonus", "bg-amber-500/15 text-amber-700 dark:text-amber-300"],
  adjustment: ["Penyesuaian", "bg-muted text-foreground"],
};

function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} dari ${num(total)}`
          : "0 data"}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Sebelumnya"
        >
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button
          size="icon"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Berikutnya"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function StudioCreditUsers() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"balance" | "used" | "purchased" | "recent" | "name">("recent");
  const [filter, setFilter] = useState<"all" | "has_credits" | "buyers" | "zero">("all");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ["admin-credit-users", search, page, sort, filter],
    queryFn: () => adminCreditUsers({ data: { q: search, page, pageSize: 20, sort, filter } }),
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  return (
    <div className="space-y-4">
      {d && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              [
                "Tenant pengguna Studio",
                num(d.summary.tenants),
                `${d.summary.with_credits} punya saldo`,
              ],
              ["Total saldo kredit", num(d.summary.balance), "belum terpakai"],
              ["Kredit dibeli", num(d.summary.purchased), rp(d.summary.purchased_idr)],
              ["Kredit bonus", num(d.summary.bonus), "pendaftaran & manual"],
              ["Kredit terpakai", num(d.summary.used), "setelah pengembalian"],
            ] as const
          ).map(([label, value, sub]) => (
            <div key={label} className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="q-filters flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nama tenant, subdomain, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <AdminSelect
          value={filter}
          onChange={(v) => {
            setFilter(v as typeof filter);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="all">Semua</option>
          <option value="has_credits">Punya saldo</option>
          <option value="zero">Saldo habis</option>
          <option value="buyers">Pernah membeli</option>
        </AdminSelect>
        <AdminSelect
          value={sort}
          onChange={(v) => {
            setSort(v as typeof sort);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="recent">Aktivitas terbaru</option>
          <option value="balance">Saldo terbanyak</option>
          <option value="used">Pemakaian terbanyak</option>
          <option value="purchased">Pembelian terbesar</option>
          <option value="name">Nama A–Z</option>
        </AdminSelect>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Tenant</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3 text-right">Dibeli</th>
              <th className="p-3 text-right">Bonus</th>
              <th className="p-3 text-right">Terpakai</th>
              <th className="p-3 text-right">Video</th>
              <th className="p-3">Aktivitas terakhir</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className={cn(list.isFetching && "opacity-60")}>
            {list.isLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : !d?.rows.length ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Tidak ada data.
                </td>
              </tr>
            ) : (
              d.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.email ?? r.subdomain ?? "-"}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "p-3 text-right font-semibold tabular-nums",
                      r.balance <= 0 && "text-muted-foreground",
                    )}
                  >
                    {num(r.balance)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {num(r.purchased)}
                    {r.purchased_idr > 0 && (
                      <div className="text-xs text-muted-foreground">{rp(r.purchased_idr)}</div>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">{num(r.bonus)}</td>
                  <td className="p-3 text-right tabular-nums">{num(r.used)}</td>
                  <td className="p-3 text-right tabular-nums">{num(r.videos)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{when(r.last_at)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>
                      Detail
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {d && <Pager page={page} pageSize={d.pageSize} total={d.total} onPage={setPage} />}
      {open && <CreditDetail tenantId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CreditDetail({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin-credit-detail", tenantId, page],
    queryFn: () => adminCreditUserDetail({ data: { tenantId, page } }),
    placeholderData: keepPreviousData,
  });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const grant = useMutation({
    mutationFn: () =>
      adminGrantCredits({
        data: {
          email: q.data!.tenant.email!,
          credits: Math.trunc(Number(amount)),
          note,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      toast.success("Kredit diperbarui");
      setAmount("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["admin-credit-detail", tenantId] });
      void qc.invalidateQueries({ queryKey: ["admin-credit-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{d?.tenant.name ?? "Memuat…"}</DialogTitle>
          <DialogDescription>{d?.tenant.email ?? d?.tenant.subdomain ?? ""}</DialogDescription>
        </DialogHeader>
        {!d ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Saldo", num(d.tenant.balance)],
                  ["Dibeli", `${num(d.summary.purchased)} · ${rp(d.summary.purchased_idr)}`],
                  ["Bonus", num(d.summary.bonus)],
                  ["Terpakai", num(d.summary.used)],
                  ["Video berhasil", num(d.summary.done)],
                  ["Video gagal", num(d.summary.failed)],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{l}</p>
                  <p className="font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            {d.tenant.email && (
              <form
                className="flex flex-wrap items-end gap-2 rounded-xl border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!Number(amount)) return toast.error("Isi jumlah kredit (boleh negatif)");
                  grant.mutate();
                }}
              >
                <div className="w-28">
                  <p className="mb-1 text-xs text-muted-foreground">Tambah / kurangi</p>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="mis. 5 / -2"
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="mb-1 text-xs text-muted-foreground">Catatan</p>
                  <Input
                    value={note}
                    maxLength={200}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="alasan penyesuaian"
                  />
                </div>
                <Button type="submit" disabled={grant.isPending}>
                  Simpan
                </Button>
              </form>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5">Waktu</th>
                    <th className="p-2.5">Jenis</th>
                    <th className="p-2.5">Keterangan</th>
                    <th className="p-2.5 text-right">Kredit</th>
                    <th className="p-2.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        Belum ada riwayat.
                      </td>
                    </tr>
                  ) : (
                    d.rows.map((r) => {
                      const [label, cls] = KIND[r.kind] ?? [r.kind, "bg-muted"];
                      const tpl = r.job?.template
                        ? (TEMPLATES.find((t) => t.key === r.job!.template)?.name ?? r.job.template)
                        : null;
                      return (
                        <tr key={r.id} className="border-t align-top">
                          <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                            {when(r.created_at)}
                          </td>
                          <td className="p-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs", cls)}>
                              {label}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <div>{r.description ?? "-"}</div>
                            {r.job && (
                              <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                <span>
                                  {tpl ?? `Video AI ${r.job.tier}`} · {r.job.duration_s} dtk
                                  {r.job.ratio ? ` · ${r.job.ratio}` : ""}
                                </span>
                                <Badge
                                  variant={r.job.status === "failed" ? "destructive" : "secondary"}
                                  className="h-4 px-1.5 text-[10px]"
                                >
                                  {{ done: "berhasil", failed: "gagal" }[r.job.status] ??
                                    "diproses"}
                                </Badge>
                              </div>
                            )}
                            {r.amount_idr > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {rp(r.amount_idr)}
                              </div>
                            )}
                            {r.by && (
                              <div className="text-xs text-muted-foreground">oleh {r.by}</div>
                            )}
                          </td>
                          <td
                            className={cn(
                              "p-2.5 text-right font-medium tabular-nums",
                              r.delta > 0 ? "text-emerald-600" : "text-rose-600",
                            )}
                          >
                            {r.delta > 0 ? `+${r.delta}` : r.delta}
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{r.balance_after}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
