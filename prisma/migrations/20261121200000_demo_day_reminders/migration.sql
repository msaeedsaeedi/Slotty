-- Morning-of and 10-minute demo reminders (issue #5). Expand-only: new nullable and
-- defaulted columns, which the previous release ignores.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reminder10mAt" TIMESTAMP(3),
ADD COLUMN     "reminderMorningAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "remind10m" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "remindMorning" BOOLEAN NOT NULL DEFAULT true;
