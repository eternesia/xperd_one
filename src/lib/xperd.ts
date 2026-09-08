export type ProductLine = "one" | "business" | "enterprise";

export const BRAND = {
  name: "XPERD",
  legal: "PT XPERD Teknologi Indonesia",
  promise: "Enterprise Resource Planning untuk setiap skala bisnis Indonesia.",
  email: "sales@xperd.id",
  phone: "+62 21 5000 8888",
  whatsapp: "+62 811 8000 900",
  address: "Menara Digital, Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan 12190",
};

export const NAV_LINKS = [
  { label: "Produk", key: "nav.products", to: "/products" },
  { label: "Solusi", key: "nav.solutions", to: "/solutions" },
  { label: "Industri", key: "nav.industries", to: "/industries" },
  { label: "Teknologi", key: "nav.technology", to: "/technology" },
  { label: "Harga", key: "nav.pricing", to: "/pricing" },
  { label: "Resources", key: "nav.resources", to: "/resources" },
  { label: "Tentang", key: "nav.about", to: "/about" },
] as const;

export interface ProductSummary {
  line: ProductLine;
  slug: string;
  name: string;
  tagline: string;
  audience: string;
  blurb: string;
  priceLabel: string;
  ctaLabel: string;
  ctaTo: string;
  highlights: string[];
  competitors: string[];
}

export const PRODUCTS: ProductSummary[] = [
  {
    line: "one",
    slug: "xperd-one",
    name: "XPERD One",
    tagline: "Smart ERP Solution",
    audience: "UMKM, startup, retail, distributor kecil, dan jasa",
    blurb:
      "Cloud ERP siap pakai yang merapikan penjualan, pembelian, stok, dan akuntansi dalam satu sistem. Daftar online, aktif hari ini juga.",
    priceLabel: "Mulai Rp249.000/bulan",
    ctaLabel: "Daftar Online",
    ctaTo: "/register",
    highlights: [
      "Registrasi mandiri tanpa menunggu sales",
      "Akuntansi, sales, purchasing, inventory",
      "Laporan keuangan otomatis",
      "Backup harian & keamanan cloud",
    ],
    competitors: ["Accurate Online", "Jurnal", "Kledo"],
  },
  {
    line: "business",
    slug: "xperd-business",
    name: "XPERD Business",
    tagline: "Powering Growth. Managing Success.",
    audience: "Perusahaan berkembang, multi cabang, multi gudang, multi departemen",
    blurb:
      "ERP menengah dengan fondasi multi entitas, kontrol otorisasi granular, dan integrasi penuh ke ekosistem digital bisnis Anda.",
    priceLabel: "Harga sesuai kebutuhan",
    ctaLabel: "Request Demo",
    ctaTo: "/contact",
    highlights: [
      "Multi company, branch, dan warehouse",
      "Approval workflow & KPI dashboard",
      "CRM dan customer portal",
      "REST API, webhook, WhatsApp, marketplace",
    ],
    competitors: ["Odoo Enterprise", "HashMicro", "Business Central"],
  },
  {
    line: "enterprise",
    slug: "xperd-enterprise",
    name: "XPERD Enterprise",
    tagline: "Built for Enterprise. Designed for Scale.",
    audience: "Holding, manufaktur, BUMN, dan korporasi besar",
    blurb:
      "Enterprise Digital Business Platform dengan konsolidasi finansial, tata kelola, keamanan tingkat korporasi, dan kapabilitas AI.",
    priceLabel: "Program konsultasi enterprise",
    ctaLabel: "Request Consultation",
    ctaTo: "/contact",
    highlights: [
      "Financial consolidation & intercompany",
      "API Gateway, SSO, IAM, audit trail",
      "High availability & disaster recovery",
      "AI forecast, AI accounting, OCR, IoT",
    ],
    competitors: ["SAP", "Oracle ERP", "Microsoft Dynamics", "Infor"],
  },
];

export const getProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

export const ONE_MODULES = [
  { name: "Dashboard", desc: "Ringkasan kinerja bisnis real time dalam satu layar." },
  { name: "Accounting", desc: "Jurnal, buku besar, dan laporan keuangan otomatis." },
  { name: "Sales", desc: "Quotation, sales order, invoice, hingga penerimaan pembayaran." },
  { name: "Purchasing", desc: "Permintaan pembelian, PO, penerimaan barang, dan hutang." },
  { name: "Inventory", desc: "Kartu stok, mutasi gudang, dan stock opname." },
  { name: "Customer", desc: "Basis data pelanggan, limit kredit, dan riwayat transaksi." },
  { name: "Vendor", desc: "Manajemen pemasok, termin, dan performa pengiriman." },
  { name: "Product", desc: "Katalog produk, varian, satuan, dan struktur harga." },
  { name: "Approval", desc: "Persetujuan berjenjang untuk dokumen penting." },
  { name: "Asset", desc: "Registrasi aset tetap dan penyusutan otomatis." },
  { name: "Report", desc: "Laporan operasional dan keuangan siap ekspor." },
  { name: "Backup", desc: "Pencadangan harian terenkripsi di cloud." },
  { name: "User Management", desc: "Pengelolaan pengguna, peran, dan hak akses." },
];

export const BUSINESS_MODULE_GROUPS = [
  {
    group: "Foundation",
    items: ["Multi Company", "Multi Branch", "Multi Warehouse", "Role & Permission"],
  },
  { group: "Finance", items: ["Accounting", "Budget", "Asset", "Cash & Bank"] },
  { group: "Commercial", items: ["Sales", "Purchasing", "CRM", "Customer Portal"] },
  { group: "Operation", items: ["Inventory", "Warehouse", "Project", "Manufacturing Lite"] },
  { group: "Management", items: ["Dashboard", "KPI", "Approval Workflow", "Notification"] },
  {
    group: "Integration",
    items: ["REST API", "Webhook", "Email", "WhatsApp", "Marketplace", "Payment Gateway"],
  },
];

export const ENTERPRISE_MODULE_GROUPS = [
  {
    group: "Enterprise Core",
    items: [
      "Financial Consolidation",
      "Intercompany",
      "Treasury",
      "Budget",
      "Procurement",
      "Manufacturing",
      "Project",
      "Asset",
      "HR",
      "BI Dashboard",
    ],
  },
  {
    group: "Technology",
    items: [
      "API Gateway",
      "SSO",
      "IAM",
      "Audit Trail",
      "Workflow Engine",
      "AI Assistant",
      "Document Management",
      "High Availability",
      "Disaster Recovery",
    ],
  },
  {
    group: "Future Ready",
    items: ["AI Forecast", "AI Accounting", "AI Analytics", "AI Chat", "OCR", "IoT", "RFID"],
  },
];

export const INDUSTRIES = [
  {
    slug: "manufacturing",
    name: "Manufacturing",
    pain: "Biaya produksi tidak terukur, stok bahan baku meleset, dan penjadwalan produksi manual.",
    solution:
      "Perhitungan HPP per batch, MRP, dan integrasi produksi dengan inventory serta akuntansi.",
    modules: ["Manufacturing", "Inventory", "Accounting", "Procurement", "Asset"],
  },
  {
    slug: "distribution",
    name: "Distribution",
    pain: "Multi gudang sulit dipantau, retur berantakan, dan margin per kanal tidak terlihat.",
    solution: "Kontrol stok multi gudang real time, manajemen retur, dan analitik margin per kanal.",
    modules: ["Inventory", "Warehouse", "Sales", "CRM", "Report"],
  },
  {
    slug: "retail",
    name: "Retail",
    pain: "Data toko tidak tersentralisasi dan rekonsiliasi kasir memakan waktu.",
    solution: "Konsolidasi penjualan seluruh outlet dengan rekonsiliasi otomatis harian.",
    modules: ["Sales", "Inventory", "Accounting", "Dashboard"],
  },
  {
    slug: "construction",
    name: "Construction",
    pain: "Biaya proyek melebihi anggaran dan progres termin sulit ditagihkan tepat waktu.",
    solution: "Kontrol anggaran per proyek, progress billing, dan manajemen subkontraktor.",
    modules: ["Project", "Budget", "Procurement", "Asset", "Accounting"],
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    pain: "Stok farmasi kedaluwarsa dan penagihan penjamin lambat.",
    solution: "Manajemen batch dan expiry, serta alur klaim penjamin yang terstruktur.",
    modules: ["Inventory", "Procurement", "Accounting", "Approval"],
  },
  {
    slug: "education",
    name: "Education",
    pain: "Administrasi keuangan yayasan terpisah dari operasional unit sekolah.",
    solution: "Konsolidasi keuangan multi unit dengan anggaran dan pelaporan terpusat.",
    modules: ["Accounting", "Budget", "Asset", "HR"],
  },
  {
    slug: "logistics",
    name: "Logistics",
    pain: "Biaya armada tidak terkontrol dan penagihan pelanggan tertunda.",
    solution: "Manajemen aset armada, biaya operasional, dan penagihan berbasis order.",
    modules: ["Asset", "Project", "Accounting", "CRM"],
  },
  {
    slug: "property",
    name: "Property",
    pain: "Piutang unit dan jadwal angsuran dikelola manual di spreadsheet.",
    solution: "Manajemen piutang, skema angsuran, dan pengingat tagihan otomatis.",
    modules: ["Accounting", "Project", "CRM", "Report"],
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    pain: "Biaya F&B tidak terhitung akurat dan pengadaan lambat.",
    solution: "Resep dan HPP F&B, pengadaan terjadwal, serta kontrol stok dapur.",
    modules: ["Inventory", "Procurement", "Accounting", "Dashboard"],
  },
];

export const TECHNOLOGY_STACK = [
  { name: "Laravel", role: "Application core", desc: "Backend service matang dengan ekosistem enterprise yang teruji." },
  { name: "React / Next.js", role: "Web experience", desc: "Antarmuka cepat, modular, dan ramah SEO." },
  { name: "Flutter", role: "Mobile", desc: "Aplikasi mobile satu basis kode untuk Android dan iOS." },
  { name: "PostgreSQL", role: "Database", desc: "Basis data transaksional andal dengan integritas tinggi." },
  { name: "Redis", role: "Cache & queue", desc: "Percepatan respons dan antrean proses berat." },
  { name: "Docker", role: "Packaging", desc: "Lingkungan konsisten dari development sampai produksi." },
  { name: "Kubernetes", role: "Orchestration", desc: "Skalabilitas horizontal dan self healing service." },
  { name: "REST API", role: "Integration", desc: "Kontrak integrasi terbuka dan terdokumentasi." },
  { name: "AI Layer", role: "Intelligence", desc: "Forecast, OCR, dan asisten analitik untuk pengambilan keputusan." },
  { name: "Cloud Native", role: "Infrastructure", desc: "Deployment cloud, hybrid, atau on premise." },
];

export const formatIDR = (value: number | null | undefined) =>
  value == null
    ? "-"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value);

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";

export interface Bilingual {
  en: string;
  id: string;
}

/** English copy for the shared product/industry data (Indonesian lives on the base fields). */
export const PRODUCT_EN: Record<ProductLine, {
  audience: string;
  blurb: string;
  priceLabel: string;
  ctaLabel: string;
  highlights: string[];
}> = {
  one: {
    audience: "SMEs, startups, retailers, small distributors, and service firms",
    blurb:
      "A ready-to-use cloud ERP that organises sales, purchasing, inventory, and accounting in one system. Sign up online and go live today.",
    priceLabel: "From IDR 249,000/month",
    ctaLabel: "Sign Up Online",
    highlights: [
      "Self-service signup, no waiting for sales",
      "Accounting, sales, purchasing, inventory",
      "Automated financial reporting",
      "Daily backup and cloud security",
    ],
  },
  business: {
    audience: "Growing companies with multiple branches, warehouses, and departments",
    blurb:
      "A mid-market ERP with a multi-entity foundation, granular authorisation control, and full integration into your digital business ecosystem.",
    priceLabel: "Pricing tailored to your needs",
    ctaLabel: "Request Demo",
    highlights: [
      "Multi company, branch, and warehouse",
      "Approval workflow and KPI dashboard",
      "CRM and customer portal",
      "REST API, webhook, WhatsApp, marketplace",
    ],
  },
  enterprise: {
    audience: "Holdings, manufacturers, state-owned enterprises, and large corporations",
    blurb:
      "An Enterprise Digital Business Platform with financial consolidation, governance, corporate-grade security, and AI capabilities.",
    priceLabel: "Enterprise consulting programme",
    ctaLabel: "Request Consultation",
    highlights: [
      "Financial consolidation and intercompany",
      "API Gateway, SSO, IAM, audit trail",
      "High availability and disaster recovery",
      "AI forecast, AI accounting, OCR, IoT",
    ],
  },
};

export const INDUSTRY_EN: Record<string, { pain: string; solution: string }> = {
  manufacturing: {
    pain: "Production costs are unmeasured, raw material stock misses targets, and scheduling is manual.",
    solution: "Cost of goods per batch, MRP, and production integrated with inventory and accounting.",
  },
  distribution: {
    pain: "Multi-warehouse stock is hard to monitor, returns are messy, and channel margin is invisible.",
    solution: "Real-time multi-warehouse stock control, returns management, and margin analytics per channel.",
  },
  retail: {
    pain: "Store data is not centralised and cashier reconciliation takes too long.",
    solution: "Consolidated sales across every outlet with automated daily reconciliation.",
  },
  construction: {
    pain: "Project costs exceed budget and progress billing is hard to invoice on time.",
    solution: "Budget control per project, progress billing, and subcontractor management.",
  },
  healthcare: {
    pain: "Pharmacy stock expires and payer billing is slow.",
    solution: "Batch and expiry management plus a structured insurance claim workflow.",
  },
  education: {
    pain: "Foundation finance is disconnected from school unit operations.",
    solution: "Multi-unit financial consolidation with centralised budgeting and reporting.",
  },
  logistics: {
    pain: "Fleet costs are uncontrolled and customer billing is delayed.",
    solution: "Fleet asset management, operating cost control, and order-based billing.",
  },
  property: {
    pain: "Unit receivables and instalment schedules are managed manually in spreadsheets.",
    solution: "Receivables management, instalment schemes, and automated payment reminders.",
  },
  hospitality: {
    pain: "F&B costs are inaccurate and procurement is slow.",
    solution: "F&B recipes and costing, scheduled procurement, and kitchen stock control.",
  },
};
