-- CreateIndex
CREATE UNIQUE INDEX "uq_active_booking" ON "bookings"("student_id", "assignment_id") WHERE "status" = 'booked';
