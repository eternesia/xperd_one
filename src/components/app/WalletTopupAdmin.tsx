import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Eye, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTopupProof, listAdminTopups, reviewWalletTopup } from "@/lib/wallet.functions";
import { walletStatus } from "./WalletPanel";
import { Card, CardContent } from "@/components/ui/card";
import { TablePager, TableSearch } from "./admin-table";

type Status = "all" | "pending" | "paid" | "rejected" | "expired" | "failed";
export function WalletTopupAdmin() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<Status>("pending");
  const [review, setReview] = useState<{ id: string; approve: boolean; amount: number } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const list = useServerFn(listAdminTopups);
  const settle = useServerFn(reviewWalletTopup);
  const proof = useServerFn(getTopupProof);
  const query = useQuery({
    queryKey: ["wallet-topups-admin", page, status],
    queryFn: () => list({ data: { page, status } }),
  });
  const mutation = useMutation({
    mutationFn: () => {
      if (!review) throw new Error("Pilih pengajuan");
      return settle({ data: { id: review.id, approve: review.approve, note } });
    },
    onSuccess: () => {
      toast.success("Pengajuan selesai ditinjau");
      setReview(null);
      qc.invalidateQueries({ queryKey: ["wallet-topups-admin"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const money = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n);
  const rows = (query.data?.rows ?? []).filter(
    (r) =>
      !search.trim() ||
      `${r.tenants?.name ?? ""} ${r.id} ${r.gateway} ${r.note ?? ""} ${r.amount_idr}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">BILLING</p>
        <h1 className="text-2xl font-bold text-navy">Deposit & Top-up</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verifikasi deposit saldo tenant dan riwayat top-up.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Cari tenant, ID, metode…" />
        <div className="flex gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as Status);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["pending", "paid", "rejected", "expired", "failed", "all"] as Status[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "Semua" : walletStatus(s)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Muat ulang top-up"
            title="Muat ulang top-up"
            onClick={() => query.refetch()}
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      {query.error && (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                    <p className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</p>
                  </TableCell>
                  <TableCell>
                    {r.tenants?.name}
                    <p className="max-w-48 break-words text-xs text-muted-foreground">{r.note}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{money(Number(r.amount_idr))}</TableCell>
                  <TableCell>{r.gateway}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{walletStatus(r.status)}</Badge>
                    {r.late_payment && (
                      <p className="text-xs text-destructive">Pembayaran terlambat</p>
                    )}
                    {r.review_note && (
                      <p className="max-w-48 text-xs text-muted-foreground">{r.review_note}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.proof_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Lihat bukti"
                          title="Lihat bukti"
                          onClick={async () => {
                            try {
                              setProofUrl((await proof({ data: { id: r.id } })).url);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Bukti gagal dibuka");
                            }
                          }}
                        >
                          <Eye />
                        </Button>
                      )}
                      {r.status === "pending" && r.gateway === "manual_transfer" && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Setujui top-up"
                            title="Setujui top-up"
                            onClick={() => {
                              setNote("");
                              setReview({ id: r.id, approve: true, amount: Number(r.amount_idr) });
                            }}
                          >
                            <Check />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Tolak top-up"
                            title="Tolak top-up"
                            onClick={() => {
                              setNote("");
                              setReview({ id: r.id, approve: false, amount: Number(r.amount_idr) });
                            }}
                          >
                            <X />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query.isLoading ? "Memuat…" : "Tidak ada pengajuan pada status ini."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePager
            page={page}
            pages={Math.max(1, Math.ceil((query.data?.count ?? 0) / 20))}
            total={query.data?.count ?? 0}
            pageSize={20}
            setPage={setPage}
          />
        </CardContent>
      </Card>
      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {review?.approve ? "Konfirmasi transfer diterima" : "Tolak pengajuan"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-2xl font-semibold">{money(review?.amount ?? 0)}</p>
          <p className="text-xs font-mono text-muted-foreground">{review?.id}</p>
          <Label htmlFor="review-note">
            {review?.approve ? "Catatan verifikasi" : "Alasan penolakan (wajib)"}
          </Label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
          <Button
            variant={review?.approve ? "gold" : "destructive"}
            disabled={mutation.isPending || (!review?.approve && !note.trim())}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Memproses…"
              : review?.approve
                ? "Setujui & tambah saldo"
                : "Tolak pengajuan"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!proofUrl} onOpenChange={(o) => !o && setProofUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti transfer</DialogTitle>
          </DialogHeader>
          {proofUrl && (
            <iframe title="Bukti transfer" src={proofUrl} className="h-96 w-full border-0" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
