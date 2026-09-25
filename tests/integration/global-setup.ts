import { execSync } from "node:child_process";
import path from "node:path";
import { parse } from "dotenv";
import { readFileSync } from "node:fs";

/** Apply migrations to the test database before the integration suite runs. */
export default function setup() {
  const root = path.resolve(import.meta.dirname, "../..");
  const env = { ...process.env, ...parse(readFileSync(path.join(root, ".env.test"))) };
  execSync("bunx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
}
