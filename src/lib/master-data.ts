export type FieldType = "text" | "number" | "textarea" | "boolean" | "select" | "reference" | "date";

export interface MDField {
  key: string;
  en: string;
  id_: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; en: string; id_: string }[];
  inTable?: boolean;
  defaultValue?: string | number | boolean;
  /** #41: untuk type "reference" — tabel master yang mengisi dropdown (kode aktif). */
  refTable?: MDTable;
  /** #41: field hanya tampil/disimpan bila field lain bernilai salah satu dari ini. */
  showWhen?: { key: string; values: string[] };
  /** #41: field terisi otomatis, tidak bisa diketik manual. */
  readOnly?: boolean;
  helpEn?: string;
  helpId?: string;
}

export type MDTable =
  | "md_items"
  | "md_categories"
  | "md_uoms"
  | "md_customers"
  | "md_suppliers"
  | "md_warehouses"
  | "md_taxes"
  // Ronde 29 (BS New 8): master mata uang & kurs.
  | "md_currencies"
  | "md_exchange_rates"
  | "md_accounts";

export interface MDEntity {
  submoduleId: string;
  table: MDTable;
  en: string;
  id_: string;
  fields: MDField[];
  /** #41: prefix kode otomatis berurutan (mis. ITM-0007). */
  codePrefix?: string;
  /** #41: prefix per nilai sebuah field (mis. item_type goods/service). */
  codePrefixByType?: { field: string; map: Record<string, string> };
}

const active: MDField = { key: "is_active", en: "Active", id_: "Aktif", type: "boolean", defaultValue: true, inTable: true };
const code: MDField = { key: "code", en: "Code", id_: "Kode", type: "text", required: true, inTable: true };
const name: MDField = { key: "name", en: "Name", id_: "Nama", type: "text", required: true, inTable: true };

/** #41: item jasa/lisensi/langganan tidak pernah masuk stok fisik. */
export const NON_STOCK_ITEM_TYPES = ["service", "software_license", "subscription"];

export const MASTER_DATA_ENTITIES: MDEntity[] = [
  {
    submoduleId: "items",
    table: "md_items",
    en: "Items",
    id_: "Item",
    codePrefix: "ITM",
    codePrefixByType: {
      field: "item_type",
      map: { goods: "ITM", service: "SRV", software_license: "SFT", subscription: "SUB" },
    },
    fields: [
      { ...code, readOnly: true, helpEn: "Generated automatically", helpId: "Dibuat otomatis berurutan" },
      name,
      {
        key: "item_type",
        en: "Type",
        id_: "Tipe",
        type: "select",
        defaultValue: "goods",
        inTable: true,
        options: [
          { value: "goods", en: "Goods", id_: "Barang" },
          { value: "service", en: "Service", id_: "Jasa" },
          { value: "software_license", en: "Software Licence", id_: "Lisensi Software" },
          { value: "subscription", en: "Subscription (SaaS)", id_: "Langganan (SaaS)" },
        ],
      },
      { key: "category_code", en: "Category", id_: "Kategori", type: "reference", refTable: "md_categories", inTable: true },
      { key: "uom_code", en: "UoM", id_: "Satuan", type: "reference", refTable: "md_uoms", inTable: true },
      {
        key: "billing_cycle",
        en: "Billing Cycle",
        id_: "Siklus Penagihan",
        type: "select",
        defaultValue: "one_time",
        showWhen: { key: "item_type", values: ["software_license", "subscription"] },
        options: [
          { value: "one_time", en: "One time", id_: "Sekali bayar" },
          { value: "monthly", en: "Monthly", id_: "Bulanan" },
          { value: "quarterly", en: "Quarterly", id_: "Triwulan" },
          { value: "yearly", en: "Yearly", id_: "Tahunan" },
        ],
      },
      { key: "barcode", en: "Barcode", id_: "Barcode", type: "text", showWhen: { key: "item_type", values: ["goods"] } },
      { key: "cost_price", en: "Cost Price", id_: "Harga Pokok", type: "number", defaultValue: 0, inTable: true },
      { key: "sell_price", en: "Sell Price", id_: "Harga Jual", type: "number", defaultValue: 0, inTable: true },
      {
        key: "min_stock",
        en: "Min. Stock",
        id_: "Stok Minimum",
        type: "number",
        defaultValue: 0,
        showWhen: { key: "item_type", values: ["goods"] },
      },
      {
        key: "is_stocked",
        en: "Tracked in stock",
        id_: "Dicatat sebagai stok",
        type: "boolean",
        defaultValue: true,
        readOnly: true,
        helpEn: "Services, licences and subscriptions are never stocked.",
        helpId: "Jasa, lisensi, dan langganan tidak memiliki stok fisik.",
      },
      active,
    ],
  },
  {
    submoduleId: "categories",
    table: "md_categories",
    en: "Categories",
    id_: "Kategori",
    codePrefix: "CAT",
    fields: [code, name, { key: "description", en: "Description", id_: "Deskripsi", type: "textarea", inTable: true }, active],
  },
  {
    submoduleId: "uom",
    table: "md_uoms",
    en: "Units of Measure",
    id_: "Satuan",
    fields: [code, name, active],
  },
  {
    submoduleId: "customers",
    table: "md_customers",
    en: "Customers",
    id_: "Pelanggan",
    codePrefix: "CUS",
    fields: [
      code,
      name,
      { key: "contact_name", en: "Contact", id_: "Kontak", type: "text", inTable: true },
      { key: "email", en: "Email", id_: "Email", type: "text", inTable: true },
      { key: "phone", en: "Phone", id_: "Telepon", type: "text", inTable: true },
      { key: "city", en: "City", id_: "Kota", type: "text", inTable: true },
      { key: "address", en: "Address", id_: "Alamat", type: "textarea" },
      { key: "tax_id", en: "Tax ID (NPWP)", id_: "NPWP", type: "text" },
      { key: "credit_limit", en: "Credit Limit", id_: "Limit Kredit", type: "number", defaultValue: 0 },
      active,
    ],
  },
  {
    submoduleId: "suppliers",
    table: "md_suppliers",
    en: "Suppliers",
    id_: "Pemasok",
    codePrefix: "SUP",
    fields: [
      code,
      name,
      { key: "contact_name", en: "Contact", id_: "Kontak", type: "text", inTable: true },
      { key: "email", en: "Email", id_: "Email", type: "text", inTable: true },
      { key: "phone", en: "Phone", id_: "Telepon", type: "text", inTable: true },
      { key: "city", en: "City", id_: "Kota", type: "text", inTable: true },
      { key: "address", en: "Address", id_: "Alamat", type: "textarea" },
      { key: "tax_id", en: "Tax ID (NPWP)", id_: "NPWP", type: "text" },
      { key: "payment_terms", en: "Payment Terms (days)", id_: "Termin (hari)", type: "number", defaultValue: 30 },
      active,
    ],
  },
  {
    submoduleId: "warehouses",
    table: "md_warehouses",
    en: "Warehouses",
    id_: "Gudang",
    codePrefix: "WH",
    fields: [
      code,
      name,
      { key: "pic_name", en: "PIC", id_: "Penanggung Jawab", type: "text", inTable: true },
      { key: "city", en: "City", id_: "Kota", type: "text", inTable: true },
      { key: "address", en: "Address", id_: "Alamat", type: "textarea" },
      active,
    ],
  },
  {
    submoduleId: "coa",
    table: "md_accounts",
    en: "Chart of Accounts",
    id_: "Bagan Akun",
    fields: [
      code,
      name,
      {
        key: "account_type",
        en: "Account Type",
        id_: "Tipe Akun",
        type: "select",
        defaultValue: "asset",
        inTable: true,
        options: [
          { value: "asset", en: "Asset", id_: "Aset" },
          { value: "liability", en: "Liability", id_: "Liabilitas" },
          { value: "equity", en: "Equity", id_: "Ekuitas" },
          { value: "revenue", en: "Revenue", id_: "Pendapatan" },
          { value: "expense", en: "Expense", id_: "Beban" },
        ],
      },
      { key: "parent_code", en: "Parent Code", id_: "Kode Induk", type: "text", inTable: true },
      active,
    ],
  },
  {
    submoduleId: "taxes",
    table: "md_taxes",
    en: "Tax Rates",
    id_: "Master Pajak",
    fields: [
      code,
      name,
      {
        key: "tax_type",
        en: "Tax Type",
        id_: "Jenis Pajak",
        type: "select",
        defaultValue: "vat_out",
        inTable: true,
        options: [
          { value: "none", en: "Non-taxable", id_: "Tanpa Pajak" },
          { value: "vat_in", en: "Input VAT", id_: "PPN Masukan" },
          { value: "vat_out", en: "Output VAT", id_: "PPN Keluaran" },
          { value: "withholding", en: "Withholding", id_: "PPh Potong Pungut" },
        ],
      },
      { key: "rate", en: "Rate (%)", id_: "Tarif (%)", type: "number", defaultValue: 0, inTable: true },
      { key: "account_code", en: "GL Account", id_: "Akun GL", type: "text", inTable: true },
      { key: "description", en: "Description", id_: "Keterangan", type: "textarea" },
      active,
    ],
  },
  // Ronde 29 (BS New 8): mata uang & kurs. `rate` = nilai mata uang dasar untuk
  // 1 unit mata uang tersebut.
  {
    submoduleId: "currencies",
    table: "md_currencies",
    en: "Currencies",
    id_: "Mata Uang",
    fields: [
      { ...code, helpEn: "ISO code, e.g. USD", helpId: "Kode ISO, contoh USD" },
      name,
      { key: "symbol", en: "Symbol", id_: "Simbol", type: "text", inTable: true },
      {
        key: "decimals",
        en: "Decimals",
        id_: "Angka Desimal",
        type: "number",
        defaultValue: 2,
        inTable: true,
        helpEn: "2 for USD/EUR, 0 for IDR and JPY.",
        helpId: "2 untuk USD/EUR, 0 untuk IDR dan JPY.",
      },
      {
        key: "is_base",
        en: "Base currency",
        id_: "Mata Uang Dasar",
        type: "boolean",
        defaultValue: false,
        inTable: true,
        helpEn: "The currency all reports are presented in. Only one per workspace.",
        helpId: "Mata uang pelaporan keuangan. Hanya satu per workspace.",
      },
      active,
    ],
  },
  {
    submoduleId: "exchange-rates",
    table: "md_exchange_rates",
    en: "Exchange Rates",
    id_: "Kurs Mata Uang",
    codePrefix: "FX",
    fields: [
      { ...code, readOnly: true, helpEn: "Generated automatically", helpId: "Dibuat otomatis berurutan" },
      { ...name, en: "Label", id_: "Keterangan" },
      { key: "currency_code", en: "Currency", id_: "Mata Uang", type: "reference", refTable: "md_currencies", required: true, inTable: true },
      { key: "rate_date", en: "Rate Date", id_: "Tanggal Kurs", type: "date", required: true, inTable: true },
      {
        key: "rate_type",
        en: "Rate Type",
        id_: "Jenis Kurs",
        type: "select",
        defaultValue: "transaction",
        inTable: true,
        options: [
          { value: "transaction", en: "Transaction rate", id_: "Kurs Transaksi" },
          { value: "tax", en: "Tax rate (KMK)", id_: "Kurs Pajak (KMK)" },
          { value: "closing", en: "Closing rate", id_: "Kurs Penutupan" },
        ],
      },
      {
        key: "rate",
        en: "Rate",
        id_: "Nilai Kurs",
        type: "number",
        defaultValue: 0,
        required: true,
        inTable: true,
        helpEn: "Base currency value of one unit of the selected currency.",
        helpId: "Nilai satu unit mata uang tersebut dalam mata uang dasar.",
      },
      { key: "source", en: "Source", id_: "Sumber", type: "text", inTable: true },
      { key: "notes", en: "Notes", id_: "Catatan", type: "textarea" },
      active,
    ],
  },
];

export function findMasterEntity(submoduleId?: string) {
  return MASTER_DATA_ENTITIES.find((e) => e.submoduleId === submoduleId);
}
