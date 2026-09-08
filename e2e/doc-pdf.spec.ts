import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { login, WS } from "./helpers";

// Seeded sales document for the PDF download flow (see repo memory note).
const DOC_ID = "aaaaaaaa-bbbb-0000-0000-00000000000d"; // E2E-SO-0001
const DOC_URL = `/app/w/${WS}/sales/sales-orders/${DOC_ID}`;

test("DOC PDF: download renders a valid %PDF file from the doc detail page", async ({ page }) => {
  test.setTimeout(180_000);
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || m.type() === "warning") console.log(`  [console:${m.type()}] ${t}`);
  });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
  await login(page);

  await page.goto(DOC_URL);
  await expect(page.getByText("E2E-SO-0001", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  const dlBtn = page.getByRole("button", { name: /Download PDF|Unduh PDF/ });
  await expect(dlBtn).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await dlBtn.click();
  const download = await downloadPromise;

  const dir = join(process.cwd(), "test-results", "pdf");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, download.suggestedFilename() || "doc.pdf");
  await download.saveAs(file);

  // Real PDF bytes were written to disk.
  const size = statSync(file).size;
  expect(size).toBeGreaterThan(0);
  const head = readFileSync(file).subarray(0, 5).toString("latin1");
  expect(head).toBe("%PDF-");
  // eslint-disable-next-line no-console
  console.log(`  OK pdf ${file} (${size} bytes, header ${head})`);
});
