import "dotenv/config";
import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: "node scripts/prepare-playwright-server.cjs && node .next/standalone/server.js",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, AUTH_URL: baseURL, HOSTNAME: "127.0.0.1", PORT: "3100" },
  },
});
