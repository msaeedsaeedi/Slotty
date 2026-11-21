import type { TestProject } from "vitest/node";
import { startPostgres } from "../support/postgres";

declare module "vitest" {
  export interface ProvidedContext {
    postgresUrl: string;
  }
}

/** One throwaway Postgres for the run, migrated once; each worker copies it (see setup.ts). */
export default async function setup(project: TestProject) {
  const { container, baseUrl } = await startPostgres();
  project.provide("postgresUrl", baseUrl);
  return async () => {
    await container.stop();
  };
}
