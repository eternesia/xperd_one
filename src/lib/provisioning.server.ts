import { execute, uuid } from "@/integrations/mysql/pool";

export const DEFAULT_COA: { code: string; name: string; account_type: string }[] = [
  { code: "1000", name: "Kas", account_type: "asset" },
  { code: "1010", name: "Bank BCA", account_type: "asset" },
  { code: "1200", name: "Piutang Usaha", account_type: "asset" },
  { code: "1250", name: "Piutang Karyawan", account_type: "asset" },
  { code: "1300", name: "Persediaan Barang", account_type: "asset" },
  { code: "1400", name: "PPN Masukan", account_type: "asset" },
  { code: "1410", name: "PPN Lebih Bayar", account_type: "asset" },
  // #36 (BS New 3): kredit pajak PPh yang dipotong pelanggan atas invoice kita.
  { code: "1450", name: "PPh Dibayar Dimuka", account_type: "asset" },
  { code: "1500", name: "Uang Muka Pembelian", account_type: "asset" },
  { code: "1700", name: "Aset Tetap", account_type: "asset" },
  { code: "1790", name: "Akumulasi Penyusutan", account_type: "asset" },
  { code: "2000", name: "Hutang Usaha", account_type: "liability" },
  // #38: barang sudah diterima tapi belum ditagih supplier (GR/IR clearing).
  { code: "2050", name: "Hutang Belum Ditagih (GR/IR)", account_type: "liability" },
  { code: "2100", name: "PPN Keluaran", account_type: "liability" },
  { code: "2110", name: "Hutang PPN", account_type: "liability" },
  { code: "2200", name: "Hutang Pajak", account_type: "liability" },
  { code: "2210", name: "Hutang PPh 21", account_type: "liability" },
  { code: "2300", name: "Hutang BPJS", account_type: "liability" },
  // #37: uang muka yang diterima dari pelanggan (kewajiban kontrak).
  { code: "2400", name: "Uang Muka Penjualan", account_type: "liability" },
  { code: "3000", name: "Modal Disetor", account_type: "equity" },
  { code: "3900", name: "Laba Ditahan", account_type: "equity" },
  { code: "4000", name: "Pendapatan Penjualan", account_type: "revenue" },
  { code: "4100", name: "Retur Penjualan", account_type: "revenue" },
  { code: "5000", name: "Harga Pokok Penjualan", account_type: "expense" },
  // #38: akun beban default untuk pembelian jasa / non-persediaan.
  { code: "5200", name: "Beban Jasa & Profesional", account_type: "expense" },
  { code: "6000", name: "Beban Operasional", account_type: "expense" },
  { code: "6100", name: "Beban Penyusutan", account_type: "expense" },
  { code: "6200", name: "Beban Gaji & Tunjangan", account_type: "expense" },
  { code: "6210", name: "Beban BPJS Perusahaan", account_type: "expense" },
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
export async function seedWorkspaceDefaults(workspaceId: string) {
  const upsert = async (table: string, rows: Record<string, unknown>[], conflictCols: string[]) => {
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => "?").join(", ");
      const updates = cols
        .filter((c) => !conflictCols.includes(c))
        .map((c) => `${c} = VALUES(${c})`)
        .join(", ");
      await execute(
        `INSERT INTO ${table} (id, ${cols.join(", ")})
         VALUES (?, ${placeholders})
         ON DUPLICATE KEY UPDATE ${updates}`,
        [uuid(), ...cols.map((c) => row[c] as never)],
      );
    }
  };

  await upsert(
    "md_accounts",
    DEFAULT_COA.map((a) => ({ workspace_id: workspaceId, ...a, is_active: 1 })),
    ["workspace_id", "code"],
  );
  await upsert(
    "md_uoms",
    DEFAULT_UOMS.map((u) => ({ workspace_id: workspaceId, ...u, is_active: 1 })),
    ["workspace_id", "code"],
  );
  await upsert(
    "md_categories",
    DEFAULT_CATEGORIES.map((c) => ({ workspace_id: workspaceId, ...c, is_active: 1 })),
    ["workspace_id", "code"],
  );
  await upsert(
    "md_taxes",
    DEFAULT_TAXES.map((t) => ({ workspace_id: workspaceId, ...t, is_active: 1 })),
    ["workspace_id", "code"],
  );
  await upsert(
    "md_warehouses",
    [{ workspace_id: workspaceId, code: "WH-01", name: "Gudang Pusat", is_active: 1 }],
    ["workspace_id", "code"],
  );
  await upsert(
    "cb_accounts",
    [
      {
        workspace_id: workspaceId,
        code: "CASH",
        name: "Kas Kecil",
        account_kind: "cash",
        gl_account_code: "1000",
        currency: "IDR",
        opening_balance: 0,
        is_active: 1,
      },
      {
        workspace_id: workspaceId,
        code: "BANK",
        name: "Bank Operasional",
        account_kind: "bank",
        gl_account_code: "1010",
        currency: "IDR",
        opening_balance: 0,
        is_active: 1,
      },
    ],
    ["workspace_id", "code"],
  );
}

export function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `Xp-${out}`;
}