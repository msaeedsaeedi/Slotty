-- CreateEnum
CREATE TYPE "BookingChange" AS ENUM ('RESCHEDULED', 'MOVED_BY_STAFF');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "freeCancel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replacedBy" "BookingChange";
