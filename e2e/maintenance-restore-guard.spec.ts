import { expect, test } from "@playwright/test";
import fs from "node:fs";

import { ADMIN, login, resolveWorkspaceId } from "./helpers";

/**
 * Backup & Restore (BS New 11, Ronde 46): cadangan membawa `workspace_id` + `owner_email` pembuatnya dan hanya dapat
 * dipulihkan ke workspace yang sama oleh email akun yang sama (anti trial-hopping).
 */
test("MAINTENANCE: backup memuat pemilik; restore ditolak untuk workspace/email lain", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/maintenance`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  const file = info.outputPath("backup.json");
  await download.saveAs(file);
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(snap.workspace_id).toBe(ws);
  expect(snap.owner_email).toBe(ADMIN.email.toLowerCase());
  expect(Object.keys(snap.tables).length).toBeGreaterThan(5);

  const input = page.locator('input[type="file"]');
  // email lain → ditolak
  const other = info.outputPath("other.json");
  fs.writeFileSync(other, JSON.stringify({ ...snap, owner_email: "someone.else@example.com" }));
  await input.setInputFiles(other);
  await expect(
    page
      .getByText(
        "This backup belongs to another workspace or account email and cannot be restored here.",
      )
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  // workspace lain → ditolak
  const otherWs = info.outputPath("otherws.json");
  fs.writeFileSync(
    otherWs,
    JSON.stringify({ ...snap, workspace_id: "00000000-0000-0000-0000-000000000000" }),
  );
  await input.setInputFiles(otherWs);
  await expect(page.getByText(/belongs to another workspace/).first()).toBeVisible({
    timeout: 20_000,
  });
  // tanpa owner_email (cadangan lama) → ditolak
  const legacy = info.outputPath("legacy.json");
  const { owner_email: _o, ...rest } = snap;
  fs.writeFileSync(legacy, JSON.stringify(rest));
  await input.setInputFiles(legacy);
  await expect(page.getByText(/belongs to another workspace/).first()).toBeVisible({
    timeout: 20_000,
  });
  // pemilik yang sama + workspace yang sama → dipulihkan
  await input.setInputFiles(file);
  await expect(page.getByText(/master record\(s\) restored\./).first()).toBeVisible({
    timeout: 60_000,
  });
});
