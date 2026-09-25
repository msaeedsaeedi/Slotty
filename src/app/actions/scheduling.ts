"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/domain/result";
import { fromLocalInput } from "@/lib/time";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { bool, optStr, run, str, type ActionState } from "@/server/action-utils";
import {
  closeAssignment,
  createAssignment,
  deleteAssignment,
  publishAssignment,
  updateAssignment,
  type AssignmentInput,
} from "@/server/services/assignments";
import { addAvailability, cancelSlot, changeVenue, deleteUnbookedSlots } from "@/server/services/slots";

async function courseTimezone(courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) throw new DomainError("Course not found.", "NOT_FOUND");
  return course.timezone;
}

function localDate(fd: FormData, key: string, tz: string, label: string): Date {
  const v = str(fd, key);
  if (!v) throw new DomainError(`${label} is required.`);
  return fromLocalInput(v, tz);
}

function assignmentFields(fd: FormData, tz: string): AssignmentInput {
  let criteria: { label: string; maxPoints: number }[] = [];
  try {
    criteria = JSON.parse(str(fd, "criteria") || "[]");
  } catch {
    throw new DomainError("Rubric could not be read.");
  }
  const opens = str(fd, "bookingOpensAt");
  return {
    title: str(fd, "title"),
    description: str(fd, "description"),
    maxMarks: Number(str(fd, "maxMarks")),
    criteria,
    policy: {
      windowStart: localDate(fd, "windowStart", tz, "Demo window start"),
      windowEnd: localDate(fd, "windowEnd", tz, "Demo window end"),
      slotDurationMin: Number(str(fd, "slotDurationMin")),
      bufferMin: Number(str(fd, "bufferMin") || 0),
      capacityPerSlot: Number(str(fd, "capacityPerSlot") || 1),
      bookingOpensAt: opens ? fromLocalInput(opens, tz) : null,
      freezeHours: Number(str(fd, "freezeHours") || 0),
      maxReschedules: Number(str(fd, "maxReschedules") || 0),
      allowStudentCancel: bool(fd, "allowStudentCancel"),
    },
  };
}

export async function createAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = str(fd, "courseId");
  let id = "";
  const result = await run(async () => {
    const user = await requireUser();
    const a = await createAssignment(user, courseId, assignmentFields(fd, await courseTimezone(courseId)));
    id = a.id;
  });
  if (result?.ok) redirect(`/courses/${courseId}/manage/assignments/${id}`);
  return result;
}

export async function updateAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = str(fd, "courseId");
  const assignmentId = str(fd, "assignmentId");
  const result = await run(async () => {
    await updateAssignment(await requireUser(), assignmentId, assignmentFields(fd, await courseTimezone(courseId)));
  });
  if (result?.ok) redirect(`/courses/${courseId}/manage/assignments/${assignmentId}`);
  return result;
}

export async function publishAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await publishAssignment(await requireUser(), str(fd, "assignmentId"));
    return "Published — students have been notified.";
  });
}

export async function closeAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await closeAssignment(await requireUser(), str(fd, "assignmentId"));
    return "Booking closed.";
  });
}

export async function deleteAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = str(fd, "courseId");
  const result = await run(async () => {
    await deleteAssignment(await requireUser(), str(fd, "assignmentId"));
  });
  if (result?.ok) redirect(`/courses/${courseId}/manage`);
  return result;
}

export async function addAvailabilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const tz = await courseTimezone(str(fd, "courseId"));
    const date = str(fd, "date");
    if (!date) throw new DomainError("Pick a date.");
    const r = await addAvailability(await requireUser(), str(fd, "assignmentId"), {
      taId: str(fd, "taId"),
      venueId: optStr(fd, "venueId"),
      startsAt: fromLocalInput(`${date}T${str(fd, "startTime")}`, tz),
      endsAt: fromLocalInput(`${date}T${str(fd, "endTime")}`, tz),
    });
    return `${r.slots} slot${r.slots === 1 ? "" : "s"} created${r.status === "DRAFT" ? " as drafts" : " and published"}.`;
  });
}

export async function cancelSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await cancelSlot(await requireUser(), str(fd, "slotId"), str(fd, "reason"));
    return "Slot cancelled; booked students were notified.";
  });
}

export async function deleteSlotsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("slotId").map(String);
    const r = await deleteUnbookedSlots(await requireUser(), ids);
    return `${r.deleted} slot(s) deleted${r.skipped ? `, ${r.skipped} kept because they have bookings` : ""}.`;
  });
}

export async function changeVenueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("slotId").map(String);
    if (ids.length === 0) throw new DomainError("Select at least one slot.");
    const r = await changeVenue(await requireUser(), ids, optStr(fd, "venueId"));
    return `Moved ${r.moved} slot(s)${r.notified ? `; ${r.notified} student(s) notified` : ""}.`;
  });
}
