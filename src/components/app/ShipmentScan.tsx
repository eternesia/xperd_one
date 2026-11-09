import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Download, Loader2, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCardLabels } from "@/lib/card-labels";
import { AdminSelect } from "@/components/app/admin-ui";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";

interface ScanRow {
  id: string;
  scan_date: string;
  tracking_no: string;
  marketplace: string;
  courier: string | null;
  order_no: string | null;
  buyer_name: string | null;
  doc_number?: string | null;
  item_summary: string | null;
  status: string;
  created_at: string;
}

const MARKETPLACES = ["shopee", "tokopedia", "tiktok", "lazada", "blibli", "offline"];
const COURIERS = ["JNE", "J&T", "SiCepat", "Anteraja", "Ninja", "SPX", "Grab", "Gosend", "Lainnya"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ShipmentScan({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const scanTableRef = useCardLabels();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [marketplace, setMarketplace] = useState("shopee");
  const [courier, setCourier] = useState("SPX");
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listWorkspaceRows({
      data: {
        table: "sls_shipment_scans",
        workspaceId,
        orderBy: "created_at",
        orderDir: "desc",
        limit: 500,
        filters: { scan_date: date },
      },
    });
    setRows((data?.rows ?? []) as ScanRow[]);
    setLoading(false);
  }, [workspaceId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    const tracking = code.trim();
    if (!tracking) return;
    setBusy(true);
    setCode("");

    if (rows.some((r) => r.tracking_no === tracking)) {
      toast.warning(t("Already scanned", "Sudah pernah discan") + `: ${tracking}`);
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    // Try to match an existing delivery order by number or reference.
    const docRows = await listWorkspaceRows({
      data: {
        table: "sls_documents",
        workspaceId,
        limit: 1,
        filters: { doc_type: "delivery_order" },
        search: tracking,
      },
    });
    const doc = (docRows?.rows?.[0] ?? null) as {
      id: string;
      doc_number: string;
      customer_name: string | null;
    } | null;

    try {
      await saveWorkspaceRow({
        data: {
          table: "sls_shipment_scans",
          workspaceId,
          data: {
            scan_date: date,
            tracking_no: tracking,
            marketplace,
            courier,
            status: "scanned",
            document_id: doc?.id ?? null,
            doc_number: doc?.doc_number ?? null,
            buyer_name: doc?.customer_name ?? null,
          },
        },
      });
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Failed");
      inputRef.current?.focus();
      return;
    }
    setBusy(false);
    inputRef.current?.focus();
    await load();
  }

  async function markShipped(ids: string[]) {
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await saveWorkspaceRow({
          data: {
            table: "sls_shipment_scans",
            workspaceId,
            id,
            data: { status: "shipped", shipped_at: sqlDateTime() },
          },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return;
    }
    toast.success(t("Marked as shipped", "Ditandai terkirim"));
    await load();
  }

  async function remove(id: string) {
    try {
      await deleteWorkspaceRow({ data: { table: "sls_shipment_scans", workspaceId, id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return;
    }
    await load();
  }

  function exportCsv() {
    const header = ["No", "Date", "Tracking No", "Marketplace", "Courier", "Order", "Buyer", "Status"];
    const lines = filtered.map((r, i) =>
      [i + 1, r.scan_date, r.tracking_no, r.marketplace, r.courier ?? "", r.doc_number ?? r.order_no ?? "", r.buyer_name ?? "", r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shipment-scan-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.tracking_no, r.buyer_name, r.order_no, r.courier].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const pending = rows.filter((r) => r.status === "scanned");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">
            {t("SALES & POS", "PENJUALAN & POS")}
          </p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {t("Shipping Scan", "Scan Pengiriman")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Scan marketplace waybills with a barcode reader to build the daily handover list.",
              "Scan resi marketplace dengan barcode reader untuk menyusun daftar serah terima harian.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download /> CSV
          </Button>
          <Button variant="navy" onClick={() => markShipped(pending.map((r) => r.id))} disabled={!pending.length}>
            <PackageCheck /> {t("Mark all shipped", "Tandai semua terkirim")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Barcode className="h-4 w-4 text-gold" /> {t("Scanner", "Pemindai")}
          </CardTitle>
          <CardDescription>
            {t(
              "Keep the cursor in the field — the reader submits automatically after each barcode.",
              "Biarkan kursor di kolom ini — reader otomatis mengirim setiap barcode.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_170px_170px_150px]" onSubmit={submitScan}>
            <div className="space-y-2">
              <Label htmlFor="scan">{t("Tracking / waybill number", "Nomor resi")}</Label>
              <Input
                id="scan"
                ref={inputRef}
                autoComplete="off"
                className="h-12 font-mono text-lg"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SPXID0123456789"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Marketplace", "Marketplace")}</Label>
              <AdminSelect value={marketplace} onChange={setMarketplace} className="h-12">
                {MARKETPLACES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label>{t("Courier", "Kurir")}</Label>
              <AdminSelect value={courier} onChange={setCourier} className="h-12">
                {COURIERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="navy" className="h-12 w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Barcode />} {t("Add", "Tambah")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{t("Shipping list", "Daftar pengiriman")}</CardTitle>
            <CardDescription>
              {rows.length} {t("scanned", "discan")} · {pending.length} {t("pending", "belum kirim")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Input
              placeholder={t("Search…", "Cari…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-48"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No scans yet today.", "Belum ada scan hari ini.")}</p>
          ) : (
            <table ref={scanTableRef} className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 py-2 text-left">#</th>
                  <th className="py-2 text-left">{t("Tracking No", "Nomor Resi")}</th>
                  <th className="py-2 text-left">Marketplace</th>
                  <th className="py-2 text-left">{t("Courier", "Kurir")}</th>
                  <th className="py-2 text-left">{t("Buyer / DO", "Pembeli / SJ")}</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-mono font-medium text-navy dark:text-primary-foreground">
                      {r.tracking_no}
                    </td>
                    <td className="py-2 capitalize">{r.marketplace}</td>
                    <td className="py-2">{r.courier ?? "—"}</td>
                    <td className="py-2">{r.buyer_name ?? r.order_no ?? "—"}</td>
                    <td className="py-2">
                      <Badge variant={r.status === "shipped" ? "default" : "secondary"} className="capitalize">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {r.status !== "shipped" && (
                          <Button size="sm" variant="outline" onClick={() => markShipped([r.id])}>
                            <PackageCheck />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => remove(r.id)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}