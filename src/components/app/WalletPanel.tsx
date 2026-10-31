import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, Loader2, Plus, RefreshCw, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createWalletTopup,
  exportWalletLedger,
  getTopupProof,
  getWallet,
  reconcileWalletTopup,
  uploadTopupProof,
} from "@/lib/wallet.functions";
import { walletCsv } from "@/lib/wallet/rules";
import { walletReturnPath } from "@/lib/wallet/return-url";
import { useI18n } from "@/lib/i18n";

// Tujuan kembali pembayaran (DOKU) hanya halaman billing; halaman lain → tanpa tujuan, top-up tetap jalan.
function safeReturnPath() {
  try {
    return walletReturnPath(window.location.pathname);
  } catch {
    return undefined;
  }
}
const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
export const walletStatus = (s: string) =>
  ({
    pending: "Menunggu verifikasi",
    paid: "Saldo masuk",
    rejected: "Ditolak",
    expired: "Kedaluwarsa",
    failed: "Gagal",
  })[s] ?? s;
const date = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function WalletPanel({ tenantId }: { tenantId: string }) {
  const { lang } = useI18n();
  const t = (id: string, en: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [gateway, setGateway] = useState("");
  const [note, setNote] = useState("");
  const key = useRef<string | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const fetchWallet = useServerFn(getWallet);
  const create = useServerFn(createWalletTopup);
  const upload = useServerFn(uploadTopupProof);
  const proof = useServerFn(getTopupProof);
  const exportRows = useServerFn(exportWalletLedger);
  const reconcile = useServerFn(reconcileWalletTopup);
  const query = useQuery({
    queryKey: ["wallet", tenantId, page],
    queryFn: () => fetchWallet({ data: { tenantId, page } }),
  });
  const data = query.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["omnix-wallet"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };
  const request = useMutation({
    mutationFn: async () => {
      key.current ??= crypto.randomUUID();
      return create({
        data: {
          tenantId,
          amount: Number(amount),
          gatewayId: gateway,
          idempotencyKey: key.current,
          note,
          returnPath: safeReturnPath(),
        },
      });
    },
    onSuccess: (r) => {
      key.current = null;
      setOpen(false);
      refresh();
      if (r.url) window.location.assign(r.url);
      else {
        setInstructions(r.instructions);
        setProofId(r.id);
        toast.success(
          t(
            "Pengajuan tersimpan. Unggah bukti transfer untuk verifikasi.",
            "Request saved. Upload transfer proof for review.",
          ),
        );
      }
    },
    onError: (e: Error) => {
      refresh();
      toast.error(e.message);
    },
  });
  const fileUpload = useMutation({
    mutationFn: async (file: File) => {
      if (!proofId) throw new Error("Pilih pengajuan");
      if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran bukti maksimal 5 MB");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return upload({
        data: {
          id: proofId,
          base64,
          mime: file.type as "image/png" | "image/jpeg" | "application/pdf",
        },
      });
    },
    onSuccess: () => {
      toast.success(
        t("Bukti terkirim; menunggu verifikasi admin.", "Proof uploaded; awaiting admin review."),
      );
      setProofId(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows: Awaited<ReturnType<typeof exportRows>> = [];
      for (let p = 0; ; p++) {
        const batch = await exportRows({ data: { tenantId, page: p } });
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
      return rows;
    },
    onSuccess: (rows) => {
      const url = URL.createObjectURL(
        new Blob([walletCsv(rows)], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "xperd-riwayat-saldo.csv";
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const check = useMutation({
    mutationFn: (id: string) => reconcile({ data: { id } }),
    onSuccess: (r) => {
      toast.info(walletStatus(r.status));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function viewProof(id: string) {
    try {
      setProofUrl((await proof({ data: { id } })).url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bukti gagal dibuka");
    }
  }
  return (
    <section className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-5 w-5 text-gold" />
            {t("Saldo deposit", "Deposit balance")}
          </h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {data ? money(data.balance) : "—"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Saldo prabayar · tidak dapat ditarik tunai", "Prepaid balance · non-withdrawable")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("Muat ulang saldo", "Refresh balance")}
            title={t("Muat ulang saldo", "Refresh balance")}
            onClick={refresh}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate()}
            disabled={!data?.ledgerCount || exportCsv.isPending}
          >
            <Download />
            {t("Ekspor CSV", "Export CSV")}
          </Button>
          {data?.canManage && (
            <Button
              variant="gold"
              onClick={() => {
                setOpen(true);
                setGateway(data.methods.find((m) => m.available)?.id ?? "");
                setAmount(String(data.settings?.min_topup_idr ?? ""));
              }}
            >
              <Plus />
              Top up
            </Button>
          )}
        </div>
      </div>
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {query.error.message}
        </p>
      )}
      <Tabs defaultValue="topups" className="mt-6">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="topups">{t("Pengajuan top-up", "Top-up requests")}</TabsTrigger>
            <TabsTrigger value="ledger">{t("Riwayat saldo", "Balance history")}</TabsTrigger>
          </TabsList>
          <TabsContent value="topups">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Tanggal", "Date")}</TableHead>
                  <TableHead>{t("Nominal", "Amount")}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{t("Aksi", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.topups.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {date(r.created_at)}
                      <p className="text-xs text-muted-foreground">{r.id.slice(0, 8)}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {money(Number(r.amount_idr))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{walletStatus(r.status)}</Badge>
                      {r.review_note && (
                        <p className="mt-1 max-w-60 text-xs text-muted-foreground">
                          {r.review_note}
                        </p>
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
                            onClick={() => viewProof(r.id)}
                          >
                            <Eye />
                          </Button>
                        )}
                        {r.status === "pending" &&
                          r.gateway === "manual_transfer" &&
                          data.canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setInstructions(
                                  data.methods.find((m) => m.provider === "manual_transfer")
                                    ?.instructions ?? "",
                                );
                                setProofId(r.id);
                              }}
                            >
                              <Upload />
                              {t("Bukti", "Proof")}
                            </Button>
                          )}
                        {["midtrans", "doku"].includes(r.gateway) && r.status !== "paid" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={check.isPending}
                              onClick={() => check.mutate(r.id)}
                            >
                              <RefreshCw />
                              {t("Cek", "Check")}
                            </Button>
                            {r.payment_url && r.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.location.assign(r.payment_url ?? "")}
                              >
                                {t("Bayar", "Pay")}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.topups.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {query.isLoading
                        ? t("Memuat…", "Loading…")
                        : t("Belum ada pengajuan top-up.", "No top-up requests yet.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="ledger">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Tanggal", "Date")}</TableHead>
                  <TableHead>{t("Keterangan", "Description")}</TableHead>
                  <TableHead>{t("Produk", "Product")}</TableHead>
                  <TableHead className="text-right">{t("Nominal", "Amount")}</TableHead>
                  <TableHead className="text-right">{t("Saldo akhir", "Balance after")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.ledger.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{date(r.created_at)}</TableCell>
                    <TableCell>
                      {r.description}
                      <p className="text-xs text-muted-foreground">{r.entry_type}</p>
                    </TableCell>
                    <TableCell>{r.product_code}</TableCell>
                    <TableCell
                      className={
                        Number(r.amount_idr) < 0 ? "text-right text-destructive" : "text-right"
                      }
                    >
                      {money(Number(r.amount_idr))}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {money(Number(r.balance_after))}
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.ledger.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("Belum ada transaksi saldo.", "No balance transactions yet.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </div>
      </Tabs>
      <div className="mt-3 flex items-center justify-end gap-3 text-xs">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          {t("Sebelumnya", "Previous")}
        </Button>
        <span>{page + 1}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * 20 >= Math.max(data?.ledgerCount ?? 0, data?.topupCount ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("Berikutnya", "Next")}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Top up saldo</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <div>
              <Label htmlFor="wallet-amount">{t("Nominal (IDR)", "Amount (IDR)")}</Label>
              <Input
                id="wallet-amount"
                type="number"
                min={Number(data?.settings?.min_topup_idr)}
                max={Number(data?.settings?.max_topup_idr)}
                step="1"
                value={amount}
                required
                onChange={(e) => {
                  key.current = null;
                  setAmount(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {data?.settings?.presets.map((v) => (
                <Button
                  key={String(v)}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    key.current = null;
                    setAmount(String(v));
                  }}
                >
                  {money(Number(v))}
                </Button>
              ))}
            </div>
            <div>
              <Label>{t("Metode pembayaran", "Payment method")}</Label>
              <Select
                value={gateway}
                onValueChange={(v) => {
                  key.current = null;
                  setGateway(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Pilih metode", "Choose method")} />
                </SelectTrigger>
                <SelectContent>
                  {data?.methods.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                      {m.display_name}
                      {!m.available ? " — belum tersedia" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {data?.methods.find((m) => m.id === gateway)?.instructions}
            </p>
            <div>
              <Label htmlFor="wallet-note">{t("Catatan", "Note")}</Label>
              <Textarea
                id="wallet-note"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="gold"
              className="w-full"
              disabled={request.isPending || !gateway}
            >
              {request.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("Ajukan top-up", "Request top-up")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!proofId}
        onOpenChange={(o) => {
          if (!o) setProofId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Bukti transfer", "Transfer proof")}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{instructions}</p>
          <p className="font-mono text-xs text-muted-foreground">{proofId}</p>
          <Label htmlFor="wallet-proof">JPEG / PNG / PDF · maks. 5 MB</Label>
          <Input
            id="wallet-proof"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            disabled={fileUpload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) fileUpload.mutate(f);
            }}
          />
          {fileUpload.isPending && <Loader2 className="animate-spin" />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!proofUrl} onOpenChange={(o) => !o && setProofUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Bukti transfer", "Transfer proof")}</DialogTitle>
          </DialogHeader>
          {proofUrl && (
            <iframe title="Bukti transfer" src={proofUrl} className="h-96 w-full border-0" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
