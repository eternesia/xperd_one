export type FieldType = "text" | "number" | "textarea" | "boolean" | "select";

export interface MDField {
  key: string;
  en: string;
  id_: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; en: string; id_: string }[];
  inTable?: boolean;
  defaultValue?: string | number | boolean;
}

export type MDTable =
  | "md_items"
  | "md_categories"
  | "md_uoms"
  | "md_customers"
  | "md_suppliers"
  | "md_warehouses"
  | "md_taxes"
  | "md_accounts";

export interface MDEntity {
  submoduleId: string;
  table: MDTable;
  en: string;
  id_: string;
  fields: MDField[];
}

const active: MDField = { key: "is_active", en: "Active", id_: "Aktif", type: "boolean", defaultValue: true, inTable: true };
const code: MDField = { key: "code", en: "Code", id_: "Kode", type: "text", required: true, inTable: true };
const name: MDField = { key: "name", en: "Name", id_: "Nama", type: "text", required: true, inTable: true };

export const MASTER_DATA_ENTITIES: MDEntity[] = [
  {
    submoduleId: "items",
    table: "md_items",
    en: "Items",
    id_: "Item",
    fields: [
      code,
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
        ],
      },
      { key: "category_code", en: "Category", id_: "Kategori", type: "text", inTable: true },
      { key: "uom_code", en: "UoM", id_: "Satuan", type: "text", inTable: true },
      { key: "barcode", en: "Barcode", id_: "Barcode", type: "text" },
      { key: "cost_price", en: "Cost Price", id_: "Harga Pokok", type: "number", defaultValue: 0, inTable: true },
      { key: "sell_price", en: "Sell Price", id_: "Harga Jual", type: "number", defaultValue: 0, inTable: true },
      { key: "min_stock", en: "Min. Stock", id_: "Stok Minimum", type: "number", defaultValue: 0 },
      active,
    ],
  },
  {
    submoduleId: "categories",
    table: "md_categories",
    en: "Categories",
    id_: "Kategori",
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
];

export function findMasterEntity(submoduleId?: string) {
  return MASTER_DATA_ENTITIES.find((e) => e.submoduleId === submoduleId);
}
