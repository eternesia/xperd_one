import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "dnicorp.id@gmail.com", password: "@DNIIPO2032" };
/** Fallback workspace id (seeded demo); prefer resolveWorkspaceId(). */
export const WS = "aaaaaaaa-aaaa-aaaa-aaaa-000000000002";

let cachedWorkspaceId: string | null = null;

/**
 * Resolve the first workspace the signed-in user can open, so tests do not
 * depend on a hard-coded workspace id (the DB may be re-seeded/renamed).
 * The picker renders one `Card role="button"` per workspace.
 */
export async function resolveWorkspaceId(page: Page): Promise<string> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  await page.goto("/app");
  const card = page.locator('[role="button"]').first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.click();
  await page.waitForURL(/\/app\/w\/[^/?#]+$/, { timeout: 30_000 });
  const match = page.url().match(/\/app\/w\/([^/?#]+)/);
  if (!match) throw new Error(`Could not resolve a workspace id from "${page.url()}"`);
  cachedWorkspaceId = match[1];
  return cachedWorkspaceId;
}

/**
 * Wait until the module shell settled, then report whether it rendered the
 * add-on lock panel (vs. the module content). `contentText` is the marker the
 * unlocked module is expected to show.
 */
export async function moduleSettled(page: Page, contentText?: string): Promise<boolean> {
  // The add-on lock panel (BS parity) offers a link to Billing.
  const locked = page.getByRole("link", { name: /Open Billing|Buka Billing/ });
  const content = contentText
    ? page.getByText(contentText, { exact: false }).first()
    : page.locator("main").first();
  await expect(locked.or(content).first()).toBeVisible({ timeout: 60_000 });
  return locked.isVisible().catch(() => false);
}

export async function login(page: Page, creds: { email: string; password: string } = ADMIN) {
  await page.goto("/auth");
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  // NB: /auth now has a "Sign in" TAB plus a "Sign in" submit button, so match
  // the submit control explicitly (pressing Enter in the form is equivalent).
  await page.locator("#password").press("Enter");
  // Login redirects to /app (client-side). Give vite/SSR time to settle.
  await page.waitForURL(/\/app/, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

/** Go to the workspace launcher for the signed-in user. */
export async function openLauncher(page: Page) {
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}`);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function expectNoAppCrash(page: Page) {
  await expect(page.locator("body")).not.toContainText("Application error");
}
