import { execSync } from "node:child_process";
import { parse } from "dotenv";
import { readFileSync } from "node:fs";

/** Migrate and reset the test database, then create the accounts the specs sign in with. */
export default function globalSetup() {
  const env = { ...process.env, ...parse(readFileSync(".env.test")) };
  execSync("bunx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("bun tests/e2e/setup-db.ts", { env, stdio: "inherit" });
}
