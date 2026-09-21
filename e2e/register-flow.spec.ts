import { test, expect } from "@playwright/test";

// /auth must match the Business Suite (Lovable) reference: two tabs,
// "Sign in" and "Register online" (the register tab routes to /register).
test("AUTH: /auth shows Sign in + Register online tabs (BS parity)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/auth");

  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Register online" })).toBeVisible();

  // Sign in is the default tab and carries the credential form.
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();

  // Register online tab → online registration page + contact sales.
  await page.getByRole("tab", { name: "Register online" }).click();
  const start = page.getByRole("link", { name: "Start online registration" });
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute("href", "/register");
  await expect(page.getByRole("link", { name: /contact sales/i })).toBeVisible();
});

// The online registration flow (company signup → admin registrations queue).
test("REGISTER: online registration submits and shows the success state", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");

  // Wait until the public-package query has resolved (page fully hydrated)
  // before typing — otherwise a late re-render can wipe the input values.
  await expect(page.getByRole("button", { name: /XPERD One Starter/ })).toBeVisible({ timeout: 30_000 });

  const stamp = Date.now().toString().slice(-8);
  const company = `PT E2E ${stamp}`;
  await page.locator("#company_name").fill(company);
  await page.locator("#contact_name").fill("E2E Tester");
  await page.locator("#email").fill(`e2e${stamp}@example.com`);
  await page.locator("#phone").fill("081234567890");
  await page.locator("#subdomain").fill(`e2e${stamp}`);

  // Values must have stuck (guards against the hydration race).
  await expect(page.locator("#company_name")).toHaveValue(company);
  await expect(page.locator("#subdomain")).toHaveValue(`e2e${stamp}`);

  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Your registration has been received")).toBeVisible({ timeout: 60_000 });
});
