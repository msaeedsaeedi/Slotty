/**
 * Fast-forward held mark releases for e2e (ADR-032): the e2e server runs no worker and no clock
 * control, so a spec runs this to move every hold into the past and release it, as the worker would.
 *   DATABASE_URL=<e2e database> bun tests/e2e/release-held.ts
 */
import { db } from "@/server/db";
import { releaseHeldMarks } from "@/server/services/evaluations";
import { isTestDatabaseUrl } from "../support/postgres";

if (!isTestDatabaseUrl(process.env.DATABASE_URL)) throw new Error("Refusing to touch a non-test database");
await db.evaluation.updateMany({ where: { status: "SUBMITTED", releaseAt: { not: null } }, data: { releaseAt: new Date(Date.now() - 60_000) } });
console.log(`released ${await releaseHeldMarks()}`);
await db.$disconnect();
