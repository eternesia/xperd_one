import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "dnicorp.id@gmail.com", password: "@DNIIPO2032" };
export const WS = "aaaaaaaa-aaaa-aaaa-aaaa-000000000002";

export async function login(page: Page, creds: { email: string; password: string } = ADMIN) {
  await page.goto("/auth");
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await page.click("button:has-text('Sign in')");
  // Login redirects to /app (client-side). Give vite/SSR time to settle.
  await page.waitForURL(/\/app/, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

/** Go straight to the (single) workspace launcher for the demo tenant. */
export async function openLauncher(page: Page) {
  await page.goto(`/app/w/${WS}`);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function expectNoAppCrash(page: Page) {
  await expect(page.locator("body")).not.toContainText("Application error");
}
