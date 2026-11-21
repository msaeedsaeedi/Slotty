import { inject } from "vitest";
import { createDatabaseFromTemplate } from "../support/postgres";

// Runs in each worker before its test files load: point DATABASE_URL at this worker's own copy
// of the migrated database, so files run in parallel without seeing each other's rows.
const worker = process.env.VITEST_POOL_ID ?? "1";
process.env.DATABASE_URL = await createDatabaseFromTemplate(inject("postgresUrl"), `slotty_test_${worker}`);
