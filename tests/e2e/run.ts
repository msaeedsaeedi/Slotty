/**
 * `bun run test:e2e [playwright args]`: start a throwaway Postgres (Testcontainers), migrate and
 * seed it, then run Playwright against it. Playwright starts its web server before any
 * globalSetup, so the database has to exist first — hence this launcher instead of a setup file.
 */
import { spawn, execFileSync } from "node:child_process";
import { startPostgres } from "../support/postgres";

const { container, baseUrl } = await startPostgres();
const env = { ...process.env, E2E_DATABASE_URL: baseUrl };
let code = 1;
try {
  execFileSync("bun", ["tests/e2e/setup-db.ts"], { env: { ...env, DATABASE_URL: baseUrl }, stdio: "inherit" });
  const child = spawn("bunx", ["playwright", "test", ...process.argv.slice(2)], { env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  code = await new Promise<number>((resolve) => child.on("exit", (c, s) => resolve(c ?? (s ? 1 : 0))));
} finally {
  await container.stop();
}
process.exit(code);
