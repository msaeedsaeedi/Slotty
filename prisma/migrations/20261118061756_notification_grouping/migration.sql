-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "groupKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "groupKey" TEXT;

-- CreateIndex
CREATE INDEX "EmailOutbox_groupKey_idx" ON "EmailOutbox"("groupKey");

-- CreateIndex
CREATE INDEX "Notification_userId_groupKey_idx" ON "Notification"("userId", "groupKey");
