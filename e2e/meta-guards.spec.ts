import { test, expect } from "@playwright/test";
import { login, moduleSettled, resolveWorkspaceId } from "./helpers";

/**
 * #55 (BS New 3): penjaga (guard) endpoint publik Meta & hook cron.
 *
 * Integrasi Meta butuh App ID/Secret milik user, jadi spec ini **tidak**
 * memanggil Graph API. Yang diuji adalah hal yang bisa diverifikasi lokal:
 *  1. hook cron `/api/public/hooks/social-publish` menolak pemanggil tanpa
 *     secret bila `SOCIAL_PUBLISH_SECRET` diset (dan tetap jalan bila tidak);
 *  2. callback OAuth `/api/public/meta/callback` menolak `state` yang tidak
 *     valid (state disimpan di server, sekali pakai);
 *  3. panel Meta di UI hanya menampilkan App ID (bukan App Secret) dan tetap
 *     dapat dibuka tanpa kredensial.
 */
test("META GUARD: hook cron menolak pemanggil tanpa secret", async ({ request }) => {
  const secret = process.env.SOCIAL_PUBLISH_SECRET;

  if (!secret) {
    // Tanpa secret: endpoint terbuka (pola dev) → hanya pastikan tidak error.
    const res = await request.get("/api/public/hooks/social-publish");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    test.skip(true, "SOCIAL_PUBLISH_SECRET belum diset — mode dev tanpa secret");
    return;
  }

  const denied = await request.get("/api/public/hooks/social-publish");
  expect(denied.status()).toBe(403);

  const wrong = await request.get("/api/public/hooks/social-publish?secret=salah");
  expect(wrong.status()).toBe(403);

  const allowed = await request.get(`/api/public/hooks/social-publish?secret=${encodeURIComponent(secret)}`);
  expect(allowed.status()).toBe(200);
  expect(await allowed.json()).toMatchObject({ success: true });

  const viaHeader = await request.post("/api/public/hooks/social-publish", {
    headers: { "x-webhook-secret": secret },
  });
  expect(viaHeader.status()).toBe(200);
});

test("META GUARD: callback OAuth menolak state yang tidak valid", async ({ request }) => {
  // Tanpa state sama sekali → 400.
  expect((await request.get("/api/public/meta/callback")).status()).toBe(400);

  // State acak (bukan workspace uuid.nonce yang tersimpan) → 400.
  const bogus = await request.get(
    "/api/public/meta/callback?state=aaaaaaaa-aaaa-aaaa-aaaa-000000000000.00000000-0000-0000-0000-000000000000&code=x",
  );
  expect(bogus.status()).toBe(400);

  // State berbentuk benar tetapi tidak punya baris pengaturan → 400.
  const noRow = await request.get(
    "/api/public/meta/callback?state=e77b5fd9-cc3f-417b-bed8-75aad0801d46.00000000-0000-0000-0000-000000000000&code=x",
  );
  expect(noRow.status()).toBe(400);
});

test("META GUARD: panel pengaturan Meta tidak membocorkan App Secret", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/crm/social-accounts`);

  // Panel Meta harus terlihat (bisa juga berupa panel terkunci add-on).
  const hint = page.getByText(/developers\.facebook\.com/).first();
  const locked = await moduleSettled(page, "developers.facebook.com");
  if (locked) {
    test.skip(true, "add-on CRM tidak aktif untuk workspace ini");
    return;
  }
  await expect(hint).toBeVisible({ timeout: 30_000 });

  // App ID tampil sebagai placeholder; App Secret hanya diisi manual (state
  // klien) dan tidak pernah di-prefill dari server.
  await expect(page.getByPlaceholder("1234567890")).toBeVisible({ timeout: 30_000 });
  const secretInput = page.locator('input[type="password"]').first();
  if (await secretInput.isVisible().catch(() => false)) {
    await expect(secretInput).toHaveValue("");
  }
  // Tidak ada access token Meta yang ikut ter-render ke halaman.
  await expect(page.locator("body")).not.toContainText(/EAA[A-Za-z0-9]{20,}/);
});
