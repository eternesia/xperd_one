import {
  Banknote,
  BarChart3,
  BookOpenCheck,
  Boxes,
  Building2,
  Cog,
  Database,
  DatabaseBackup,
  Factory,
  HandCoins,
  Landmark,
  Receipt,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SubModule {
  id: string;
  en: string;
  id_: string;
}

export interface AppModule {
  id: string;
  en: string;
  id_: string;
  descEn: string;
  descId: string;
  icon: LucideIcon;
  tone: "navy" | "gold" | "emerald" | "sky" | "violet" | "rose";
  phase: 1 | 2 | 3 | 4;
  disabled?: boolean;
  submodules: SubModule[];
}

const s = (id: string, en: string, id_: string): SubModule => ({ id, en, id_ });

const MODULE_DEFS: AppModule[] = [
  {
    id: "master-data",
    en: "Master Data",
    id_: "Master Data",
    descEn: "Items, partners, warehouses and chart of accounts.",
    descId: "Item, mitra, gudang, dan bagan akun.",
    icon: Database,
    tone: "navy",
    phase: 1,
    submodules: [
      s("items", "Items", "Item"),
      s("categories", "Categories", "Kategori"),
      s("uom", "Units of Measure", "Satuan"),
      s("customers", "Customers", "Pelanggan"),
      s("suppliers", "Suppliers", "Pemasok"),
      s("warehouses", "Warehouses", "Gudang"),
      s("taxes", "Tax Rates", "Master Pajak"),
      s("coa", "Chart of Accounts", "Bagan Akun"),
    ],
  },
  {
    id: "procurement",
    en: "Procurement",
    id_: "Pembelian",
    descEn: "Requests, purchase orders, receipts and payables.",
    descId: "Permintaan, pesanan pembelian, penerimaan, dan hutang.",
    icon: Truck,
    tone: "sky",
    phase: 2,
    submodules: [
      s("purchase-requests", "Purchase Requests", "Permintaan Pembelian"),
      s("purchase-orders", "Purchase Orders", "Pesanan Pembelian"),
      s("goods-receipts", "Goods Receipts", "Penerimaan Barang"),
      s("ap-invoices", "AP Invoices", "Faktur Hutang"),
      s("payments", "Payments", "Pembayaran"),
      s("purchase-returns", "Purchase Returns", "Retur Pembelian"),
    ],
  },
  {
    id: "inventory",
    en: "Inventory",
    id_: "Persediaan",
    descEn: "Stock movement, transfers, opname and costing.",
    descId: "Mutasi stok, transfer, opname, dan perhitungan HPP.",
    icon: Boxes,
    tone: "emerald",
    phase: 2,
    submodules: [
      s("stock-overview", "Stock Overview", "Ringkasan Stok"),
      s("stock-in", "Stock In", "Barang Masuk"),
      s("stock-out", "Stock Out", "Barang Keluar"),
      s("transfers", "Transfers", "Transfer Gudang"),
      s("stock-opname", "Stock Opname", "Stok Opname"),
      s("valuation", "Valuation", "Penilaian Persediaan"),
    ],
  },
  {
    id: "sales",
    en: "Sales & POS",
    id_: "Penjualan & POS",
    descEn: "Orders, deliveries, receivables and point of sale.",
    descId: "Pesanan, pengiriman, piutang, dan kasir.",
    icon: ShoppingCart,
    tone: "gold",
    phase: 2,
    submodules: [
      s("quotations", "Quotations", "Penawaran"),
      s("sales-orders", "Sales Orders", "Pesanan Penjualan"),
      s("delivery-orders", "Delivery Orders", "Surat Jalan"),
      s("shipment-scan", "Shipping Scan", "Scan Pengiriman"),
      s("ar-invoices", "AR Invoices", "Faktur Piutang"),
      s("receipts", "Receipts", "Penerimaan Pembayaran"),
      s("pos", "Point of Sale", "Point of Sale"),
      s("sales-returns", "Sales Returns", "Retur Penjualan"),
    ],
  },
  {
    id: "cash-bank",
    en: "Cash & Bank",
    id_: "Kas & Bank",
    descEn: "Cash flow, payments, receipts and reconciliation.",
    descId: "Arus kas, pembayaran, penerimaan, dan rekonsiliasi.",
    icon: Banknote,
    tone: "violet",
    phase: 3,
    submodules: [
      s("accounts", "Cash & Bank Accounts", "Akun Kas & Bank"),
      s("cash-in", "Cash In", "Kas Masuk"),
      s("cash-out", "Cash Out", "Kas Keluar"),
      s("transfers", "Fund Transfers", "Transfer Dana"),
      s("reconciliation", "Reconciliation", "Rekonsiliasi Bank"),
    ],
  },
  {
    id: "accounting",
    en: "Accounting",
    id_: "Akuntansi",
    descEn: "Journals, ledger, financial statements and closing.",
    descId: "Jurnal, buku besar, laporan keuangan, dan tutup buku.",
    icon: Landmark,
    tone: "navy",
    phase: 3,
    submodules: [
      s("opening-balance", "Opening Balance", "Saldo Awal"),
      s("journals", "Journal Entries", "Jurnal Umum"),
      s("ledger", "General Ledger", "Buku Besar"),
      s("trial-balance", "Trial Balance", "Neraca Saldo"),
      s("balance-sheet", "Balance Sheet", "Neraca"),
      s("profit-loss", "Profit & Loss", "Laba Rugi"),
      s("period-closing", "Period Closing", "Tutup Periode"),
    ],
  },
  {
    id: "fixed-asset",
    en: "Fixed Assets",
    id_: "Aset Tetap",
    descEn: "Asset register, depreciation and disposal.",
    descId: "Daftar aset, penyusutan, dan pelepasan.",
    icon: Building2,
    tone: "sky",
    phase: 4,
    submodules: [
      s("assets", "Asset Register", "Daftar Aset"),
      s("depreciation", "Depreciation", "Penyusutan"),
      s("disposal", "Disposal", "Pelepasan Aset"),
    ],
  },
  {
    id: "tax",
    en: "Tax",
    id_: "Perpajakan",
    descEn: "Input/output VAT, withholding tax and e-filing.",
    descId: "PPN masukan/keluaran, PPh, dan e-filing.",
    icon: Receipt,
    tone: "rose",
    phase: 4,
    submodules: [
      s("vat-in", "Input VAT", "PPN Masukan"),
      s("vat-out", "Output VAT", "PPN Keluaran"),
      s("withholding", "Withholding Tax", "PPh Potong Pungut"),
      s("efaktur", "e-Faktur & e-Bupot", "e-Faktur & e-Bupot"),
    ],
  },
  {
    id: "manufacturing",
    en: "Manufacturing",
    id_: "Manufaktur",
    descEn: "Bill of materials, work orders and production costing.",
    descId: "BOM, work order, dan biaya produksi.",
    icon: Factory,
    tone: "emerald",
    phase: 4,
    disabled: true,
    submodules: [
      s("bom", "Bill of Materials", "Bill of Materials"),
      s("work-orders", "Work Orders", "Perintah Kerja"),
      s("production-cost", "Production Costing", "Biaya Produksi"),
    ],
  },
  {
    id: "reporting",
    en: "Reporting & BI",
    id_: "Laporan & BI",
    descEn: "Operational and financial dashboards with exports.",
    descId: "Dasbor operasional dan keuangan dengan ekspor.",
    icon: BarChart3,
    tone: "violet",
    phase: 1,
    submodules: [
      s("executive", "Executive Dashboard", "Dasbor Eksekutif"),
      s("sales", "Sales Analytics", "Analitik Penjualan"),
      s("purchasing", "Purchasing Analytics", "Analitik Pembelian"),
      s("inventory", "Inventory Analytics", "Analitik Persediaan"),
      s("financial", "Financial Reports", "Laporan Keuangan"),
      s("exports", "Data Exports", "Ekspor Data"),
    ],
  },
  {
    id: "crm",
    en: "CRM",
    id_: "CRM",
    descEn: "Pipeline, activities and customer engagement.",
    descId: "Pipeline, aktivitas, dan interaksi pelanggan.",
    icon: HandCoins,
    tone: "gold",
    phase: 4,
    disabled: true,
    submodules: [
      s("leads", "Leads", "Prospek"),
      s("pipeline", "Pipeline", "Pipeline"),
      s("activities", "Activities", "Aktivitas"),
    ],
  },
  {
    id: "hr",
    en: "HR & Payroll",
    id_: "HR & Payroll",
    descEn: "Employees, attendance and payroll integration.",
    descId: "Karyawan, absensi, dan integrasi payroll.",
    icon: Users,
    tone: "rose",
    phase: 4,
    disabled: true,
    submodules: [
      s("employees", "Employees", "Karyawan"),
      s("attendance", "Attendance", "Absensi"),
      s("payroll", "Payroll", "Penggajian"),
    ],
  },
];

// Disabled (coming soon) modules always render last in the launcher.
export const APP_MODULES: AppModule[] = [...MODULE_DEFS].sort(
  (a, b) => Number(Boolean(a.disabled)) - Number(Boolean(b.disabled)),
);

export const LAUNCHER_UTILITIES = [
  {
    id: "team",
    to: "/app/w/$workspaceId/team" as const,
    en: "Team",
    id_: "Tim",
    descEn: "Members, roles and invitations for this workspace.",
    descId: "Anggota, peran, dan undangan untuk workspace ini.",
    icon: Users,
    tone: "navy" as const,
  },
  {
    id: "settings",
    to: "/app/w/$workspaceId/settings" as const,
    en: "Settings",
    id_: "Pengaturan",
    descEn: "Company profile, currency, fiscal year and costing.",
    descId: "Profil perusahaan, mata uang, tahun fiskal, dan costing.",
    icon: Cog,
    tone: "gold" as const,
  },
  {
    id: "billing",
    to: "/app/w/$workspaceId/billing" as const,
    en: "Billing & Package",
    id_: "Tagihan & Paket",
    descEn: "Subscription, monthly invoices and package upgrade.",
    descId: "Langganan, tagihan bulanan, dan upgrade paket.",
    icon: ReceiptText,
    tone: "emerald" as const,
  },
  {
    id: "maintenance",
    to: "/app/w/$workspaceId/maintenance" as const,
    en: "Backup & Restore",
    id_: "Backup & Restore",
    descEn: "Export a workspace snapshot or restore master data.",
    descId: "Ekspor cadangan workspace atau pulihkan master data.",
    icon: DatabaseBackup,
    tone: "sky" as const,
  },
];

export const TONE_CLASS: Record<AppModule["tone"], string> = {
  navy: "bg-navy/10 text-navy dark:bg-navy/40 dark:text-primary-foreground",
  gold: "bg-gold/20 text-gold-foreground dark:bg-gold/25 dark:text-gold",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export const MODULE_ICON_FALLBACK = BookOpenCheck;

export function findModule(id?: string) {
  return APP_MODULES.find((m) => m.id === id);
}