import { defineConfig, devices } from "@playwright/test";

// Set by tests/e2e/run.ts, which starts a throwaway Postgres first: run `bun run test:e2e`.
const DATABASE_URL = process.env.E2E_DATABASE_URL;
if (!DATABASE_URL) throw new Error("Run the e2e tests with `bun run test:e2e` (it starts their database)");
const PORT = 3100;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  forbidOnly: CI,
  reporter: CI ? [["list"], ["html", { open: "never" }], ["github"]] : [["list"]],
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
    env: {
      DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      SMTP_HOST: "",
      NEXT_DIST_DIR: ".next-e2e",
      ENABLE_DEV_MAIL: "1",
    },
  },
});
