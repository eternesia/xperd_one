import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3999",
    // Default aplikasi kini Indonesia (New 12); spec lama menguji label Inggris → kunci ke "en" lewat storageState.
    storageState: "./e2e/lang-en.storage.json",
    headless: true,
    channel: "chrome",
    launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
  },
});
