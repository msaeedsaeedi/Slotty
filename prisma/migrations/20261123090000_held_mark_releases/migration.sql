-- Held mark releases (issue #35, ADR-032). Expand-only: two nullable columns and an index. Held
-- marks stay SUBMITTED, so the previous release shows them as awaiting review and never to students.

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "releaseAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateIndex
CREATE INDEX "Evaluation_status_releaseAt_idx" ON "Evaluation"("status", "releaseAt");

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
