"use server";

import { requireUser } from "@/server/auth/session";
import { run, str, type ActionState } from "@/server/action-utils";
import { bookSlot, cancelBooking, markAttendance, rescheduleBooking, staffCancelBooking } from "@/server/services/bookings";

export async function bookSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await bookSlot(await requireUser(), str(fd, "slotId"));
    return "Booked! A confirmation has been sent to your email.";
  });
}

export async function rescheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await rescheduleBooking(await requireUser(), str(fd, "bookingId"), str(fd, "slotId"));
    const back = str(fd, "returnTo");
    return { message: "Rescheduled.", navigate: back.startsWith("/") && !back.startsWith("//") ? back : undefined };
  });
}

export async function cancelBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await cancelBooking(await requireUser(), str(fd, "bookingId"));
    return "Booking cancelled.";
  });
}

export async function markAttendanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const status = str(fd, "status");
    if (status !== "BOOKED" && status !== "COMPLETED" && status !== "NO_SHOW") throw new Error("bad status");
    await markAttendance(await requireUser(), str(fd, "bookingId"), status);
  });
}

export async function staffCancelBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await staffCancelBooking(await requireUser(), str(fd, "bookingId"), str(fd, "reason"));
    return "Booking cancelled; the student was notified.";
  });
}
