import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * #63 (BS New 3): Omnix — biaya per transaksi dipotong DI LEVEL APLIKASI di
 * dalam satu transaksi MySQL (tanpa trigger database). Spec ini memastikan:
 *  1. menyelesaikan pesanan memotong saldo sebesar biaya Omnix & menulis ledger;
 *  2. pengajuan top up menunggu persetujuan Super Admin, dan saldo bertambah
 *     setelah disetujui.
 */
const ORDER_NO = `E2E-OMX-${Date.now().toString().slice(-6)}`;
const FEE = 25;
const TOPUP = 50000;

function money(text: string): number {
  return Number(text.replace(/[^\d]/g, "") || 0);
}

test("OMNIX: completing an order charges the wallet and top up needs approval", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  /* ---------- 1. saldo awal ---------- */
  await page.goto(`/app/w/${ws}/omnix/wallet`);
  const balance = page.getByTestId("omnix-balance");
  await expect(balance).toBeVisible({ timeout: 60_000 });
  const startBalance = money(await balance.innerText());

  /* ---------- 2. buat pesanan lalu selesaikan (biaya dipotong) ---------- */
  await page.goto(`/app/w/${ws}/omnix/orders`);
  const createButton = page.getByRole("button", { name: /New order|Pesanan baru|Tambah pesanan/ });
  await expect(createButton).toBeVisible({ timeout: 60_000 });

  const existing = page.getByRole("row").filter({ hasText: ORDER_NO }).first();
  if (!(await existing.isVisible().catch(() => false))) {
    await createButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByTestId("omnix-order-no").fill(ORDER_NO);
    await dialog.getByTestId("omnix-order-buyer").fill("Pembeli e2e");
    await dialog.getByTestId("omnix-order-gross").fill("100000");
    await dialog.getByTestId("omnix-order-fee").fill("5000");
    await dialog.getByRole("button", { name: /Simpan|Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
  }

  const row = page.getByRole("row").filter({ hasText: ORDER_NO }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("combobox").selectOption("completed");
  await expect(page.getByText(new RegExp(`Rp${FEE}\\b|charged|dipotong`, "i")).first()).toBeVisible({
    timeout: 60_000,
  });
  // Pesanan yang sudah tertagih tidak boleh dihapus (biaya sudah masuk ledger).
  await expect(
    row.locator(
      'button[title*="charged"], button[title*="tertagih"], button[title="Delete"], button[title="Hapus"]',
    ),
  ).toBeDisabled();

  /* ---------- 3. saldo berkurang & ledger mencatat charge ---------- */
  await page.goto(`/app/w/${ws}/omnix/wallet`);
  await expect(page.getByText(ORDER_NO, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => money(await balance.innerText()), { timeout: 60_000 }).toBe(startBalance - FEE);

  /* ---------- 4. pengajuan top up menunggu persetujuan ---------- */
  const afterBalance = money(await balance.innerText());
  await page.getByTestId("omnix-topup-amount").fill(String(TOPUP));
  await page.getByRole("button", { name: /^(Top up|Kirim pengajuan|Submit request)$/ }).click();
  await expect(page.getByText(/menunggu Super Admin|waiting for Super Admin/).first()).toBeVisible({
    timeout: 60_000,
  });

  /* ---------- 5. Super Admin menyetujui → saldo bertambah ---------- */
  await page.goto("/app-admin/addons");
  // Pilih baris pengajuan dengan nominal yang baru dibuat (bukan baris lain).
  // Baris pengajuan = satu-satunya baris yang punya tombol Setujui; filter nominal
  // saja bisa cocok dengan baris katalog add-on yang harganya memuat "50.000"
  // (mis. XPro Rp 750.000), sehingga tombolnya tidak ada di baris itu.
  const pendingRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: /^Setujui$/ }) })
    .filter({ hasText: new RegExp(`${String(TOPUP).slice(0, 2)}[.\\s]?000`) })
    .first();
  await expect(pendingRow).toBeVisible({ timeout: 60_000 });
  await pendingRow.getByRole("button", { name: /^Setujui$/ }).click();
  await expect(page.getByText(/Top up disetujui/).first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`/app/w/${ws}/omnix/wallet`);
  await expect.poll(async () => money(await balance.innerText()), { timeout: 60_000 }).toBe(afterBalance + TOPUP);
});
