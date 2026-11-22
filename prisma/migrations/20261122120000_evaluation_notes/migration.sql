-- Private notes per author (issue #36, ADR-031). Expand-only: a new table, and the old
-- "Evaluation"."privateNotes" column stays in place (unmodeled) so the previous release keeps
-- working after a rollback. Existing notes are copied without an author, which makes them
-- readable by the course's enrolled instructors only. The column is dropped in a later release.

-- CreateTable
CREATE TABLE "EvaluationNote" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationNote_authorId_idx" ON "EvaluationNote"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationNote_evaluationId_authorId_key" ON "EvaluationNote"("evaluationId", "authorId");

-- AddForeignKey
ALTER TABLE "EvaluationNote" ADD CONSTRAINT "EvaluationNote_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationNote" ADD CONSTRAINT "EvaluationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy existing notes, author unknown.
INSERT INTO "EvaluationNote" ("id", "evaluationId", "authorId", "body", "createdAt", "updatedAt")
SELECT 'legacy_' || "id", "id", NULL, "privateNotes", "updatedAt", "updatedAt"
FROM "Evaluation"
WHERE "privateNotes" IS NOT NULL AND btrim("privateNotes") <> '';
