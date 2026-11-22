-- Retire the personal calendar feed (issue #44, ADR-033). Clear every feed secret so no
-- /calendar/<token> link works, even under the previous release after a rollback. The column
-- stays (unmodeled) and is dropped in a later release.
UPDATE "User" SET "calendarToken" = NULL WHERE "calendarToken" IS NOT NULL;
