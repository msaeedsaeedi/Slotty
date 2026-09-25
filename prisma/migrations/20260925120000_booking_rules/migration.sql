-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "rescheduleCount";

-- AlterTable
ALTER TABLE "DemoPolicy" ADD COLUMN     "openAnnouncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingAllowance" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "extraChanges" INTEGER NOT NULL DEFAULT 0,
    "lateBooking" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingAllowance_assignmentId_studentId_key" ON "BookingAllowance"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Booking_assignmentId_studentId_idx" ON "Booking"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "BookingAllowance" ADD CONSTRAINT "BookingAllowance_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAllowance" ADD CONSTRAINT "BookingAllowance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAllowance" ADD CONSTRAINT "BookingAllowance_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
