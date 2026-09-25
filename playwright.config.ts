import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";
import { readFileSync } from "node:fs";

const testEnv = parse(readFileSync(".env.test"));
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // A production build: dev mode's on-demand compiling and Fast Refresh make
  // multi-browser tests flaky, and service workers/offline need a real build.
  webServer: {
    command: `bunx next build && bunx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { ...testEnv, NEXT_DIST_DIR: ".next-e2e", ENABLE_DEV_MAIL: "1" },
  },
});
