"use server";

import { requireUser } from "@/server/auth/session";
import { bool, run, str, type ActionState } from "@/server/action-utils";
import {
  allowRebookAfterNoShow,
  bookSlot,
  cancelBooking,
  markAttendance,
  rescheduleBooking,
  setAllowance,
  staffCancelBooking,
  staffPlaceStudent,
} from "@/server/services/bookings";
import { createRequest, resolveRequest } from "@/server/services/requests";
import { joinWaitlist, leaveWaitlist } from "@/server/services/waitlist";

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

export async function staffPlaceStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await staffPlaceStudent(await requireUser(), {
      assignmentId: str(fd, "assignmentId"),
      studentId: str(fd, "studentId"),
      slotId: str(fd, "slotId"),
      overCapacity: bool(fd, "overCapacity"),
    });
    return "Done — the student was notified.";
  });
}

export async function allowRebookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await allowRebookAfterNoShow(await requireUser(), str(fd, "bookingId"));
    return "The student can book a new slot and was notified.";
  });
}

export async function setAllowanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await setAllowance(await requireUser(), str(fd, "assignmentId"), str(fd, "studentId"), {
      extraChanges: Number(str(fd, "extraChanges") || 0),
      lateBooking: bool(fd, "lateBooking"),
      note: str(fd, "note"),
    });
    return "Exception saved.";
  });
}

export async function joinWaitlistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await joinWaitlist(await requireUser(), str(fd, "assignmentId"));
    return "We'll let you know when a slot frees up.";
  });
}

export async function leaveWaitlistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await leaveWaitlist(await requireUser(), str(fd, "assignmentId"));
    return "You won't get slot alerts for this assignment.";
  });
}

export async function createRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const kind = str(fd, "kind") === "MARK_QUERY" ? "MARK_QUERY" : "BOOKING_CHANGE";
    await createRequest(await requireUser(), str(fd, "assignmentId"), { kind, message: str(fd, "message") });
    return "Sent — course staff have been notified.";
  });
}

export async function resolveRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const decision = str(fd, "decision") === "DECLINED" ? "DECLINED" : "RESOLVED";
    await resolveRequest(await requireUser(), str(fd, "requestId"), decision, str(fd, "response"));
    return decision === "RESOLVED" ? "Marked as handled; the student was notified." : "Declined; the student was notified.";
  });
}
