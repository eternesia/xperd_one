import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Download, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/lib/app-context";
import { listWorkspaceRows, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { seedWorkspace } from "@/lib/provisioning.functions";

export const Route = createFileRoute("/app/w/$workspaceId/maintenance")({
  component: MaintenancePage,
});

const BACKUP_TABLES = [
  "md_items",
  "md_categories",
  "md_uoms",
  "md_customers",
  "md_suppliers",
  "md_warehouses",
  "md_taxes",
  "md_accounts",
  "prc_documents",
  "prc_document_lines",
  "sls_documents",
  "sls_document_lines",
  "inv_movements",
  "acc_journal_entries",
  "acc_journal_lines",
  "cb_accounts",
  "cb_transactions",
  "fa_assets",
  "tax_records",
] as const;

const RESTORE_TABLES = [
  "md_categories",
  "md_uoms",
  "md_warehouses",
  "md_taxes",
  "md_accounts",
  "md_customers",
  "md_suppliers",
  "md_items",
] as const;

type Snapshot = { workspace_id: string; created_at: string; tables: Record<string, Record<string, unknown>[]> };

function MaintenancePage() {
  const { workspaceId } = Route.useParams();
  const { activeWorkspace } = useApp();
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [busy, setBusy] = useState<"backup" | "restore" | "seed" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function seedDefaults() {
    setBusy("seed");
    try {
      await seedWorkspace({ data: { workspaceId } });
      toast.success(t("Default master data loaded.", "Data master default berhasil dimuat."));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function backup() {
    setBusy("backup");
    try {
      const tables: Snapshot["tables"] = {};
      for (const table of BACKUP_TABLES) {
        const data = await listWorkspaceRows({
          data: { table, workspaceId, limit: 5000 },
        });
        tables[table] = ((data?.rows ?? []) as Record<string, unknown>[]);
      }
      const snapshot: Snapshot = { workspace_id: workspaceId, created_at: new Date().toISOString(), tables };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xperd-backup-${activeWorkspace?.slug ?? workspaceId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Backup downloaded.", "Cadangan berhasil diunduh."));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function restore(file: File) {
    setBusy("restore");
    try {
      const snapshot = JSON.parse(await file.text()) as Snapshot;
      if (!snapshot?.tables) throw new Error(t("Invalid backup file.", "Berkas cadangan tidak valid."));
      let total = 0;
      for (const table of RESTORE_TABLES) {
        const rows = snapshot.tables[table];
        if (!rows?.length) continue;
        const payload = rows.map((r) => ({ ...r, workspace_id: workspaceId }));
        await upsertWorkspaceRows({ data: { table, workspaceId, rows: payload } });
        total += payload.length;
      }
      toast.success(t(`${total} master record(s) restored.`, `${total} data master dipulihkan.`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:py-12">
      <Link
        to="/app/w/$workspaceId"
        params={{ workspaceId }}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-gold"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {t("All modules", "Semua modul")}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-navy dark:text-primary-foreground">
        {t("Backup & Restore", "Backup & Restore")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t(
          "Download a full snapshot of this workspace, or restore master data from a snapshot file.",
          "Unduh cadangan lengkap workspace ini, atau pulihkan master data dari berkas cadangan.",
        )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Backup", "Cadangkan")}</CardTitle>
            <CardDescription>
              {t(
                "Exports master data and all transactions as a JSON file.",
                "Mengekspor master data dan seluruh transaksi ke berkas JSON.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="navy" onClick={backup} disabled={busy !== null}>
              {busy === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("Download backup", "Unduh cadangan")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Restore", "Pulihkan")}</CardTitle>
            <CardDescription>
              {t(
                "Restores master data (items, partners, accounts, taxes) into this workspace.",
                "Memulihkan master data (item, mitra, akun, pajak) ke workspace ini.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("Upload snapshot", "Unggah cadangan")}
            </Button>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("Default master data", "Data master default")}</CardTitle>
            <CardDescription>
              {t(
                "Load the standard Indonesian chart of accounts, units, categories, taxes, warehouse and cash/bank accounts. Existing records with the same code are kept up to date.",
                "Muat bagan akun standar Indonesia, satuan, kategori, pajak, gudang, serta akun kas & bank. Data dengan kode sama akan diperbarui.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="gold" onClick={seedDefaults} disabled={busy !== null}>
              {busy === "seed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("Load defaults", "Muat data default")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}