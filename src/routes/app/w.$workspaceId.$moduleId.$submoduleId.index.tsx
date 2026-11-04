import { createFileRoute } from "@tanstack/react-router";
import { Construction, Lock, Plus, Search } from "lucide-react";

import { MasterDataTable } from "@/components/app/MasterDataTable";
import { AccountingView } from "@/components/app/AccountingViews";
import { CashBankView } from "@/components/app/CashBankViews";
import { InventoryView } from "@/components/app/InventoryViews";
import { FixedAssetView } from "@/components/app/FixedAssetViews";
import { TaxView } from "@/components/app/TaxViews";
import { ReportingView } from "@/components/app/ReportingViews";
import { ProcurementTable } from "@/components/app/ProcurementTable";
import { ShipmentScan } from "@/components/app/ShipmentScan";
import { PosRegister } from "@/components/app/PosRegister";
import { SalesTable } from "@/components/app/SalesTable";
import { CrmView } from "@/components/app/CrmViews";
// #63 (BS New 3): modul add-on Omnix.
import { OmnixView } from "@/components/app/OmnixViews";
import { HrView } from "@/components/app/HrViews";
import { XproView } from "@/components/app/XproViews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { findAccEntity } from "@/lib/accounting";
import { findMasterEntity } from "@/lib/master-data";
import { findCbEntity } from "@/lib/cashbank";
import { findInvEntity } from "@/lib/inventory";
import { findModule } from "@/lib/modules";
import { findPrcEntity } from "@/lib/procurement";
import { ProductionView } from "@/components/app/ProductionView";
import { findSlsEntity } from "@/lib/sales";
import { findFaEntity } from "@/lib/fixedasset";
import { findTaxEntity } from "@/lib/tax";
import { findRptEntity } from "@/lib/reporting";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId/$submoduleId/")({
  component: SubModulePage,
});

function SubModulePage() {
  const { workspaceId, moduleId, submoduleId } = Route.useParams();
  const { lang } = useI18n();
  // #59 (BS New 3): penegakan izin per submodul.
  const { accessLoading, canViewSubmodule, canEditSubmodule } = useApp();
  const mod = findModule(moduleId);
  const sub = mod?.submodules.find((s) => s.id === submoduleId);

  if (!mod || !sub) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "id" ? "Sub modul tidak ditemukan." : "Sub module not found."}
      </p>
    );
  }

  if (accessLoading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <span className="text-sm text-muted-foreground">
          {lang === "id" ? "Memuat akses…" : "Loading access…"}
        </span>
      </div>
    );
  }

  if (!canViewSubmodule(moduleId, submoduleId)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-primary-foreground">
          {lang === "id" ? "Akses submodul dibatasi" : "Submodule access restricted"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "id"
            ? "Hubungi admin workspace untuk mendapatkan akses."
            : "Contact your workspace admin to request access."}
        </p>
      </div>
    );
  }

  const canEdit = canEditSubmodule(moduleId, submoduleId);

  return (
    <div className="space-y-3">
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          {lang === "id"
            ? "Akses hanya lihat — perubahan data dinonaktifkan."
            : "View-only access — data changes are disabled."}
        </div>
      )}
      <fieldset
        disabled={!canEdit}
        className="min-w-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-60 disabled:[&_input]:cursor-not-allowed disabled:[&_select]:cursor-not-allowed"
      >
        <SubModuleBody moduleId={moduleId} submoduleId={submoduleId} workspaceId={workspaceId} />
      </fieldset>
    </div>
  );
}

/** Isi layar submodul — dipisah agar penegakan izin (#59) bisa membungkusnya. */
function SubModuleBody({
  moduleId,
  submoduleId,
  workspaceId,
}: {
  moduleId: string;
  submoduleId: string;
  workspaceId: string;
}) {
  const { lang } = useI18n();
  const mod = findModule(moduleId);
  const sub = mod?.submodules.find((s) => s.id === submoduleId);
  if (!mod || !sub) return null;

  if (moduleId === "manufacturing") return <ProductionView workspaceId={workspaceId} section={submoduleId} />;

  if (moduleId === "master-data") {
    const entity = findMasterEntity(submoduleId);
    if (entity) return <MasterDataTable entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "procurement") {
    const entity = findPrcEntity(submoduleId);
    if (entity) return <ProcurementTable entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "inventory") {
    const entity = findInvEntity(submoduleId);
    if (entity) return <InventoryView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "sales") {
    if (submoduleId === "pos") return <PosRegister workspaceId={workspaceId} />;
    if (submoduleId === "shipment-scan") return <ShipmentScan workspaceId={workspaceId} />;
    const entity = findSlsEntity(submoduleId);
    if (entity) return <SalesTable entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "cash-bank") {
    const entity = findCbEntity(submoduleId);
    if (entity) return <CashBankView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "accounting") {
    const entity = findAccEntity(submoduleId);
    if (entity) return <AccountingView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "fixed-asset") {
    const entity = findFaEntity(submoduleId);
    if (entity) return <FixedAssetView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "tax") {
    const entity = findTaxEntity(submoduleId);
    if (entity) return <TaxView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "reporting") {
    const entity = findRptEntity(submoduleId);
    if (entity) return <ReportingView entity={entity} workspaceId={workspaceId} />;
  }

  if (moduleId === "crm") {
    return <CrmView submoduleId={submoduleId} workspaceId={workspaceId} />;
  }

  // Batch 3 #63 (BS New 3): modul add-on Omnix (toko, transaksi, pengiriman,
  // laporan, saldo & tagihan, pengaturan API).
  if (moduleId === "omnix") {
    return <OmnixView submoduleId={submoduleId} workspaceId={workspaceId} />;
  }

  if (moduleId === "hr") {
    // Batch 2 (Slipp HR): layar per submodule (PTKP/TER, departemen, jabatan, dst).
    return <HrView submoduleId={submoduleId} workspaceId={workspaceId} />;
  }

  // Ronde 33 (BS New 10): XPro — proyek & kontrak, milestone, RAB, BAST.
  if (moduleId === "xpro") {
    return <XproView submoduleId={submoduleId} workspaceId={workspaceId} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">
            {(lang === "id" ? mod.id_ : mod.en).toUpperCase()}
          </p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? sub.id_ : sub.en}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-56 pl-9" placeholder={lang === "id" ? "Cari data…" : "Search records…"} disabled />
          </div>
          <Button variant="navy" disabled>
            <Plus /> {lang === "id" ? "Tambah" : "New"}
          </Button>
        </div>
      </div>

      <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center">
        <Construction className="h-8 w-8 text-gold" />
        <p className="mt-4 font-medium text-navy dark:text-primary-foreground">
          {lang === "id" ? "Sedang disiapkan" : "Being prepared"}
        </p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {lang === "id"
            ? `Data dan formulir untuk ${sub.id_} akan aktif pada rilis fase ${mod.phase}.`
            : `Records and forms for ${sub.en} go live in the phase ${mod.phase} rollout.`}
        </p>
      </div>
    </div>
  );
}