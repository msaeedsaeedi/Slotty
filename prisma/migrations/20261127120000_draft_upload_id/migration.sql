-- #163: the last marking-sheet upload saved, so a retry isn't taken for a conflict.
-- Expand-only: nullable, the previous release ignores it.
ALTER TABLE "Evaluation" ADD COLUMN "lastClientChangeId" TEXT;
