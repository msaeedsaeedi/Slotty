import { execFileSync } from "node:child_process";
import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

/**
 * A throwaway Postgres for one test run (Testcontainers): the same major version as production,
 * started fresh, migrated once into a template database, removed when the run ends. Nothing is
 * shared with the dev database, and nothing has to be running beforehand except Docker.
 */
export const POSTGRES_IMAGE = "postgres:17";
export const TEMPLATE_DB = "slotty_test_template";
const root = path.resolve(import.meta.dirname, "../..");

/** Test databases are named slotty_test…; helpers that wipe tables refuse any other name. */
export const isTestDatabaseUrl = (url: string | undefined) => /\/slotty_test[\w]*(\?|$)/.test(url ?? "");

export function databaseUrl(base: string, name: string) {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function startPostgres(): Promise<{ container: StartedPostgreSqlContainer; baseUrl: string }> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(TEMPLATE_DB)
    .withUsername("slotty")
    .withPassword("slotty")
    // Durability doesn't matter for a database that lives for one run.
    .withCommand(["postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"])
    .start();
  const baseUrl = container.getConnectionUri();
  execFileSync("bunx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: baseUrl },
    stdio: "pipe",
  });
  return { container, baseUrl };
}

/** Copy the migrated template into a new database (fast: a file-level copy, no migrations). */
export async function createDatabaseFromTemplate(baseUrl: string, name: string) {
  const client = new Client({ connectionString: databaseUrl(baseUrl, "postgres") });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== "42P04") throw error; // already exists
  } finally {
    await client.end();
  }
  return databaseUrl(baseUrl, name);
}
