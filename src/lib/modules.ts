import {
  Banknote,
  BarChart3,
  BookOpenCheck,
  Boxes,
  Briefcase,
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
  Store,
  Truck,
  Users,
  UserPlus,
  KanbanSquare,
  ListTodo,
  Contact,
  CalendarCheck,
  Target,
  Megaphone,
  MessageCircle,
  FileText,
  CalendarDays,
  Lightbulb,
  Image,
  MessagesSquare,
  Inbox,
  Zap,
  Rocket,
  LineChart,
  ClipboardCheck,
  FolderOpen,
  CalendarRange,
  Building,
  FileBarChart,
  UsersRound,
  Sparkles,
  Share2,
  FlaskConical,
  PackageSearch,
  ShieldCheck,
  ClipboardList,
  Calculator,
  Wrench,
  PackageCheck,
  Settings2,
  Package,
  Tags,
  Ruler,
  Warehouse,
  Percent,
  Coins,
  ArrowLeftRight,
  ListTree,
  Undo2,
  PackagePlus,
  PackageMinus,
  Scale,
  ScanLine,
  CreditCard,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  GitCompare,
  BookText,
  BookOpen,
  TrendingUp,
  Filter,
  Clock,
  Lock,
  FileSpreadsheet,
  Network,
  Layers,
  UserCog,
  CircleDot,
  type LucideIcon,
  ChartGantt,
} from "lucide-react";

export interface SubModule {
  id: string;
  en: string;
  id_: string;
  /** Only workspace Owner/Admin may open it (e.g. project finance, team workload). */
  managerOnly?: boolean;
  icon?: LucideIcon;
  /** Sidebar section label [en, id]. */
  group?: [string, string];
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
  /** Add-on code required to unlock this module (see public.addons / tenant_addons). */
  addon?: string;
  submodules: SubModule[];
}

const s = (id: string, en: string, id_: string): SubModule => ({ id, en, id_ });
const m = (id: string, en: string, id_: string): SubModule => ({ id, en, id_, managerOnly: true });

const g = (
  group: [string, string],
  icon: LucideIcon,
  id: string,
  en: string,
  id_: string,
): SubModule => ({ id, en, id_, icon, group });

/** Split submodules into consecutive sidebar sections by their `group`. */
export function groupSubmodules(
  subs: SubModule[],
): { group?: [string, string]; items: SubModule[] }[] {
  const out: { group?: [string, string]; items: SubModule[] }[] = [];
  for (const sub of subs) {
    const last = out[out.length - 1];
    if (last && last.group?.[0] === sub.group?.[0]) last.items.push(sub);
    else out.push({ group: sub.group, items: [sub] });
  }
  return out;
}

// Seksi sidebar CRM (Qalling) — urutan & label sama dengan xperd-one.lovable.app (BS New 11).
const SALES: [string, string] = ["Sales", "Penjualan"];
const TENDER: [string, string] = ["Tender", "Tender"];
const SETUP: [string, string] = ["Settings", "Pengaturan"];
const OVERVIEW: [string, string] = ["Overview", "Ringkasan"];
const CONTENT: [string, string] = ["Content", "Konten"];
const CHAT: [string, string] = ["Conversations", "Percakapan"];
const CLIENTS: [string, string] = ["Clients & Reports", "Klien & Laporan"];

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
      // Ronde 29 (BS New 8): master mata uang & kurs.
      s("currencies", "Currencies", "Mata Uang"),
      s("exchange-rates", "Exchange Rates", "Kurs Mata Uang"),
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
      // #43 (BS New 3): laporan mutasi kas & bank + ekspor Excel/PDF.
      s("reports", "Cash & Bank Report", "Laporan Kas & Bank"),
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
      s("cash-flow", "Cash Flow Statement", "Laporan Arus Kas"),
      s("equity-changes", "Changes in Equity", "Perubahan Ekuitas"),
      // #45 (BS New 3): subledger piutang/hutang.
      s("ar-card", "AR Card", "Kartu Piutang"),
      s("ap-card", "AP Card", "Kartu Hutang"),
      s("ar-aging", "AR Aging", "Umur Piutang"),
      s("ap-aging", "AP Aging", "Umur Hutang"),
      s("ar-credit-memo", "AR Credit Memo", "Nota Kredit Piutang"),
      s("ap-credit-memo", "AP Credit Memo", "Nota Kredit Hutang"),
      s("period-closing", "Period Closing", "Tutup Periode"),
      // Ronde 29 (BS New 8): revaluasi kurs akhir periode (PSAK 10).
      s("fx-revaluation", "FX Revaluation", "Revaluasi Kurs"),
      s("consistency", "Consistency Check", "Cek Konsistensi"),
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
    en: "Production",
    id_: "Production",
    descEn: "Formulations, production orders, lots, quality and production costing.",
    descId: "Formulasi, perintah produksi, lot, mutu, dan biaya produksi.",
    icon: Factory,
    tone: "emerald",
    phase: 4,
    addon: "manufacturing",
    submodules: [
      {
        ...s("profiles", "Item Profiles", "Profil Item"),
        icon: PackageCheck,
      },
      { ...s("boms", "Formulation / BoM", "Formulasi / BoM"), icon: FlaskConical },
      {
        ...s("lots", "Material Stock & Batches", "Stok Bahan & Batch"),
        icon: PackageSearch,
      },
      { ...s("quality", "QC · Samples & Release", "QC · Sampel & Rilis"), icon: ShieldCheck },
      {
        ...s("orders", "Planning & Production Orders", "Perencanaan & Perintah Produksi"),
        icon: ClipboardList,
      },
      {
        ...s("accounting", "Costing (COGM) & Journals", "Biaya (HPP Produksi) & Jurnal"),
        icon: Calculator,
      },
      s("reports", "Production Reports", "Laporan Produksi"),
      s("waste", "Waste & Shrinkage", "Waste & Susut"),
      { ...s("work-centers", "Work Centers & Rates", "Pusat Kerja & Tarif"), icon: Wrench },
      { ...s("settings", "Production Settings", "Pengaturan"), icon: Settings2 },
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
    en: "Qalling CRM",
    id_: "Qalling CRM",
    descEn: "Leads, pipeline, follow-up and campaign add-on.",
    descId: "Prospek, pipeline, follow up, dan kampanye (add-on).",
    icon: HandCoins,
    tone: "gold",
    phase: 4,
    addon: "qalling",
    submodules: [
      // Catatan (Ronde 35): submodul `dashboard` SENGAJA tidak didaftarkan di sini.
      // Halaman indeks modul sudah merender dasbor CRM yang sama, sehingga
      // mendaftarkannya akan memunculkan dua menu "Dashboard" di sidebar.
      // Ronde 37 (BS New 11): sidebar bergrup + ikon, sama dengan live.
      g(OVERVIEW, LineChart, "social-dashboard", "Insights", "Insight Sosial"),
      g(OVERVIEW, UserPlus, "leads", "Leads", "Prospek"),
      g(SALES, KanbanSquare, "pipeline", "Pipeline", "Pipeline"),
      g(SALES, Contact, "contacts", "Contacts", "Kontak"),
      g(SALES, CalendarCheck, "follow-ups", "Follow Ups", "Follow Up"),
      g(SALES, Target, "targets", "Sales Targets", "Target Sales"),
      g(SALES, Filter, "funnel", "Sales Funnel", "Funnel Penjualan"),
      g(SALES, TrendingUp, "attribution", "Content Attribution", "Atribusi Konten"),
      g(CONTENT, CalendarRange, "calendar", "Calendar", "Kalender"),
      g(CONTENT, CalendarDays, "post-scheduler", "Posts", "Posts"),
      g(CONTENT, Lightbulb, "ideas", "Ideas", "Ide Konten"),
      g(CONTENT, Image, "media", "Media", "Media"),
      g(CONTENT, Rocket, "campaigns", "Social Campaigns", "Kampanye Sosial"),
      g(CHAT, Inbox, "inbox", "Inbox", "Inbox"),
      g(CHAT, MessagesSquare, "comments", "Comments", "Komentar"),
      g(CHAT, Zap, "automations", "Automations", "Otomasi"),
      g(CHAT, Megaphone, "broadcast", "Broadcast", "Broadcast Pesan"),
      g(CHAT, MessageCircle, "wa-gateway", "WhatsApp Number", "Nomor WhatsApp"),
      g(CHAT, FileText, "templates", "Quick Replies", "Balasan Cepat"),
      g(CLIENTS, Building, "clients", "Clients & Brands", "Klien & Brand"),
      g(CLIENTS, FileBarChart, "reports", "Client Reports", "Laporan Klien"),
      g(CLIENTS, ShieldCheck, "agency", "Agency Studio", "Studio Agency"),
      g(TENDER, ClipboardCheck, "tenders", "Tender Checklist", "Checklist Tender"),
      g(TENDER, FolderOpen, "doc-library", "Document Library", "Pustaka Dokumen"),
      g(SETUP, Share2, "social-accounts", "Social Accounts", "Akun Media Sosial"),
      g(SETUP, Sparkles, "ai", "AI & MCP Integration", "Integrasi AI & MCP"),
      g(SETUP, UsersRound, "team", "Team & Members", "Tim & Anggota"),
    ],
  },
  {
    id: "hr",
    en: "Slipp HR",
    id_: "Slipp HR",
    descEn: "Employees, payroll, BPJS and PPh 21 TER add-on.",
    descId: "Karyawan, payroll, BPJS, dan PPh 21 TER (add-on).",
    icon: Users,
    tone: "rose",
    phase: 4,
    addon: "slipp_hr",
    submodules: [
      s("employees", "Employees", "Data Karyawan"),
      s("departments", "Departments", "Master Departemen"),
      s("positions", "Positions", "Master Jabatan"),
      s("ptkp", "PTKP & TER", "Master PTKP & TER"),
      s("components", "Salary Components", "Komponen Gaji"),
      s("payroll", "Payroll & Payslips", "Payroll & Slip Gaji"),
      s("tax-bpjs", "BPJS & PPh 21", "BPJS & PPh 21"),
    ],
  },
  {
    id: "omnix",
    en: "Omnix",
    id_: "Omnix",
    descEn: "Omni-channel marketplace & food delivery in one dashboard (add-on).",
    descId: "Marketplace & food delivery omni-channel dalam satu dasbor (add-on).",
    icon: Store,
    tone: "sky",
    phase: 4,
    addon: "omnix",
    submodules: [
      s("stores", "Store Connections", "Koneksi Toko"),
      s("orders", "Transactions", "Transaksi"),
      s("shipping", "Shipping & Pickup", "Pengiriman & Pickup"),
      s("reports", "Reports", "Laporan"),
      s("wallet", "Balance & Billing", "Saldo & Tagihan"),
      s("settings", "API Settings", "Pengaturan API"),
    ],
  },
  // Ronde 33 (BS New 10): add-on XPro — Proyek & Kontrak, Milestone, RAB,
  // tagihan termin/BAST. Diporting apa adanya (termasuk BAST → draft AR Invoice).
  {
    id: "xpro",
    en: "XPro",
    id_: "XPro",
    descEn: "Projects, milestones, budget (RAB) and progress billing (add-on).",
    descId: "Proyek, milestone, RAB, dan tagihan termin/BAST (add-on).",
    icon: Briefcase,
    tone: "violet",
    phase: 4,
    addon: "xpro",
    submodules: [
      // Ronde 36 (BS New 11): Kanban untuk semua penerima tugas; sisanya khusus owner/admin.
      m("roadmap", "Roadmap", "Roadmap"),
      s("my-tasks", "My Tasks", "Tugas Saya"),
      m("backlog", "Backlog & Sprints", "Backlog & Sprint"),
      s("kanban", "Kanban Tasks", "Kanban Tugas"),
      m("workload", "Team Workload", "Beban Kerja Tim"),
      m("projects", "Projects & Contracts", "Proyek & Kontrak"),
      m("milestones", "Milestones & Tasks", "Tahapan & Tugas"),
      m("budget", "Project Budget (RAB)", "Rencana Anggaran Biaya"),
      m("billing", "Progress Billing & BAST", "Tagihan Termin & BAST"),
    ],
  },
];

// Ikon sidebar default per submenu (kunci "modul/submenu", lalu "submenu"). Submenu yang sudah punya ikon sendiri tidak diubah.
const SUB_ICONS: Record<string, LucideIcon> = {
  items: Package,
  categories: Tags,
  uom: Ruler,
  customers: Users,
  suppliers: Truck,
  warehouses: Warehouse,
  taxes: Percent,
  currencies: Coins,
  "exchange-rates": ArrowLeftRight,
  coa: ListTree,
  "purchase-requests": ClipboardList,
  "purchase-orders": ShoppingCart,
  "goods-receipts": PackageCheck,
  "ap-invoices": ReceiptText,
  payments: CreditCard,
  "purchase-returns": Undo2,
  "stock-overview": Boxes,
  "stock-in": PackagePlus,
  "stock-out": PackageMinus,
  transfers: ArrowLeftRight,
  "stock-opname": ClipboardCheck,
  valuation: Scale,
  quotations: FileText,
  "sales-orders": ShoppingCart,
  "delivery-orders": Truck,
  "shipment-scan": ScanLine,
  "ar-invoices": ReceiptText,
  receipts: Wallet,
  pos: Store,
  "sales-returns": Undo2,
  accounts: Landmark,
  "cash-in": ArrowDownToLine,
  "cash-out": ArrowUpFromLine,
  reconciliation: GitCompare,
  "cash-bank/reports": FileBarChart,
  reports: FileBarChart,
  "opening-balance": BookOpen,
  journals: BookText,
  ledger: BookOpen,
  "trial-balance": Scale,
  "balance-sheet": Landmark,
  "profit-loss": TrendingUp,
  "cash-flow": Banknote,
  "equity-changes": Layers,
  "ar-card": Contact,
  "ap-card": Contact,
  "ar-aging": Clock,
  "ap-aging": Clock,
  "ar-credit-memo": FileText,
  "ap-credit-memo": FileText,
  "period-closing": Lock,
  "fx-revaluation": Coins,
  consistency: ShieldCheck,
  assets: Building,
  depreciation: TrendingUp,
  disposal: Undo2,
  "vat-in": Receipt,
  "vat-out": Receipt,
  withholding: Percent,
  efaktur: FileSpreadsheet,
  executive: LineChart,
  sales: HandCoins,
  purchasing: ShoppingCart,
  inventory: Boxes,
  financial: Landmark,
  exports: FileSpreadsheet,
  employees: Users,
  departments: Network,
  positions: Briefcase,
  ptkp: UserCog,
  components: Layers,
  payroll: Wallet,
  "tax-bpjs": Percent,
  stores: Store,
  orders: ClipboardList,
  shipping: Truck,
  wallet: Wallet,
  settings: Settings2,
  roadmap: ChartGantt,
  "my-tasks": ListTodo,
  backlog: Inbox,
  kanban: KanbanSquare,
  workload: UsersRound,
  projects: FolderOpen,
  milestones: Target,
  budget: Banknote,
  billing: ReceiptText,
  profiles: PackageCheck,
  boms: FlaskConical,
  lots: PackageSearch,
  quality: ShieldCheck,
  accounting: Calculator,
  "work-centers": Wrench,
};

const withIcons = (mod: AppModule): AppModule => ({
  ...mod,
  submodules: mod.submodules.map((sub) => ({
    ...sub,
    icon: sub.icon ?? SUB_ICONS[`${mod.id}/${sub.id}`] ?? SUB_ICONS[sub.id] ?? CircleDot,
  })),
});

// Disabled (coming soon) modules always render last in the launcher.
export const APP_MODULES: AppModule[] = MODULE_DEFS.map(withIcons).sort(
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
