import { expect, test } from "@playwright/test";

/**
 * Boilerplate integrasi pihak ketiga (#21 public web-to-lead, #22 cron
 * pengingat) HARUS aman secara default: selama env flag belum diisi, kedua
 * endpoint membalas 404 dan tidak menyentuh database. Spec ini mengunci
 * perilaku itu supaya boilerplate opsional tidak pernah "menyala sendiri".
 */
test("INTEROP: third-party boilerplate endpoints are disabled by default", async ({ request }) => {
  const lead = await request.post("/api/public/leads", {
    data: { name: "Should not be created", email: "nobody@example.com" },
    failOnStatusCode: false,
  });
  expect(lead.status()).toBe(404);
  expect(await lead.json()).toMatchObject({ error: "not_found" });

  const cron = await request.get("/api/cron/reminders", { failOnStatusCode: false });
  expect(cron.status()).toBe(404);
  expect(await cron.json()).toMatchObject({ error: "not_found" });
});
