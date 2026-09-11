import { test, expect } from "@playwright/test";

// Homepage topbar must mirror the Business Suite header:
//   Logo · nav · LanguageSwitcher · [Contact Sales outline] [Sign In / Sign Up Online gold]
// (no separate standalone "Sign Up Online" button as the old layout had).
test("SITE: homepage topbar matches Business Suite (nav + CTAs)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  const header = page.locator("header").first();
  await expect(header).toBeVisible({ timeout: 30_000 });

  // Brand logo (wordmark) is rendered.
  await expect(header.locator("img").first()).toBeVisible();

  // Navigation links are present.
  await expect(header.locator("nav a").first()).toBeVisible();

  // CTAs: Contact Sales (outline) + combined "Sign In / Sign Up Online" (gold -> /auth).
  await expect(header.getByRole("link", { name: /Contact Sales/ })).toBeVisible();
  const signIn = header.getByRole("link", { name: /Sign In\s*\/\s*Sign Up Online/ });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", /\/auth/);

  // Old layout had a standalone register button — it must be gone.
  await expect(header.getByRole("link", { name: /^Sign Up Online$/ })).toHaveCount(0);

  await header.screenshot({ path: "test-results/home-header.png" });
});
