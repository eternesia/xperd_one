import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

export const DEFAULT_COA: { code: string; name: string; account_type: string }[] = [
  { code: "1000", name: "Kas", account_type: "asset" },
  { code: "1010", name: "Bank BCA", account_type: "asset" },
  { code: "1200", name: "Piutang Usaha", account_type: "asset" },
  { code: "1300", name: "Persediaan Barang", account_type: "asset" },
  { code: "1400", name: "PPN Masukan", account_type: "asset" },
  { code: "1500", name: "Uang Muka Pembelian", account_type: "asset" },
  { code: "1700", name: "Aset Tetap", account_type: "asset" },
  { code: "1790", name: "Akumulasi Penyusutan", account_type: "asset" },
  { code: "2000", name: "Hutang Usaha", account_type: "liability" },
  { code: "2100", name: "PPN Keluaran", account_type: "liability" },
  { code: "2200", name: "Hutang Pajak", account_type: "liability" },
  { code: "3000", name: "Modal Disetor", account_type: "equity" },
  { code: "3900", name: "Laba Ditahan", account_type: "equity" },
  { code: "4000", name: "Pendapatan Penjualan", account_type: "revenue" },
  { code: "4100", name: "Retur Penjualan", account_type: "revenue" },
  { code: "5000", name: "Harga Pokok Penjualan", account_type: "expense" },
  { code: "6000", name: "Beban Operasional", account_type: "expense" },
  { code: "6100", name: "Beban Penyusutan", account_type: "expense" },
];

const DEFAULT_UOMS = [
  { code: "PCS", name: "Piece" },
  { code: "BOX", name: "Box" },
  { code: "KG", name: "Kilogram" },
  { code: "LTR", name: "Liter" },
  { code: "SET", name: "Set" },
];

const DEFAULT_CATEGORIES = [
  { code: "CAT-FG", name: "Finished Goods" },
  { code: "CAT-RAW", name: "Raw Material" },
  { code: "CAT-PKG", name: "Packaging" },
  { code: "CAT-OFC", name: "Office Supplies" },
];

const DEFAULT_TAXES = [
  { code: "PPN11", name: "PPN 11%", tax_type: "vat_out", rate: 11, account_code: "2100" },
  { code: "PPNIN11", name: "PPN Masukan 11%", tax_type: "vat_in", rate: 11, account_code: "1400" },
  { code: "PPNF11", name: "PPN Final 1,1%", tax_type: "vat_out", rate: 1.1, account_code: "2100" },
  { code: "PPH23", name: "PPh 23", tax_type: "withholding", rate: 2, account_code: "2200" },
  { code: "NON", name: "Notax", tax_type: "none", rate: 0, account_code: null as string | null },
];

/** Seed a brand-new workspace with the default Indonesian master data set. */
export async function seedWorkspaceDefaults(admin: AnyClient, workspaceId: string) {
  const base = { workspace_id: workspaceId, is_active: true };

  const steps = [
    admin
      .from("md_accounts")
      .upsert(DEFAULT_COA.map((a) => ({ ...base, ...a })), { onConflict: "workspace_id,code" }),
    admin
      .from("md_uoms")
      .upsert(DEFAULT_UOMS.map((u) => ({ ...base, ...u })), { onConflict: "workspace_id,code" }),
    admin
      .from("md_categories")
      .upsert(DEFAULT_CATEGORIES.map((c) => ({ ...base, ...c })), { onConflict: "workspace_id,code" }),
    admin
      .from("md_taxes")
      .upsert(DEFAULT_TAXES.map((t) => ({ ...base, ...t })), { onConflict: "workspace_id,code" }),
    admin
      .from("md_warehouses")
      .upsert([{ ...base, code: "WH-01", name: "Gudang Pusat" }], { onConflict: "workspace_id,code" }),
    admin.from("cb_accounts").upsert(
      [
        {
          ...base,
          code: "CASH",
          name: "Kas Kecil",
          account_kind: "cash",
          gl_account_code: "1000",
          currency: "IDR",
          opening_balance: 0,
        },
        {
          ...base,
          code: "BANK",
          name: "Bank Operasional",
          account_kind: "bank",
          gl_account_code: "1010",
          currency: "IDR",
          opening_balance: 0,
        },
      ],
      { onConflict: "workspace_id,code" },
    ),
  ];

  for (const step of steps) {
    const { error } = await step;
    if (error) throw new Error(error.message);
  }
}

export function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `Xp-${out}`;
}