import { test, expect } from "@playwright/test";
import { login, resolveWorkspaceId, moduleSettled, expectNoAppCrash } from "./helpers";

// 1 feature = 1 route check: each module's live submodule opens inside its
// module shell (sidebar shows the module name) without an app crash.
const ROUTES: Array<[sub: string, sidebar: string]> = [
  ["master-data/items", "Master Data"],
  ["procurement/purchase-orders", "Procurement"],
  ["inventory/stock-overview", "Inventory"],
  ["sales/sales-orders", "Sales & POS"],
  ["cash-bank/accounts", "Cash & Bank"],
  ["accounting/journals", "Accounting"],
  ["fixed-asset/assets", "Fixed Assets"],
  ["tax/vat-in", "Tax"],
  ["reporting/sales", "Reporting & BI"],
  // CRM (add-on qalling unlocked for this tenant)
  ["crm/dashboard", "CRM"],
  ["crm/leads", "CRM"],
  ["crm/targets", "CRM"],
  ["crm/templates", "CRM"],
];

test.describe("MODULES", () => {
  test("each module/submodule route renders without crash", async ({ page }) => {
    test.setTimeout(600_000);
    await login(page);
    const ws = await resolveWorkspaceId(page);
    for (const [sub, sidebar] of ROUTES) {
      await page.goto(`/app/w/${ws}/${sub}`);
      if (await moduleSettled(page, sidebar)) {
        // eslint-disable-next-line no-console
        console.log(`  SKIP /${sub} (add-on locked)`);
        continue;
      }
      await expect(page.getByText(sidebar, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
      await expectNoAppCrash(page);
      // eslint-disable-next-line no-console
      console.log(`  OK /${sub}`);
    }
  });
});
