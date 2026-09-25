import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminSetUserDisabled } from "@/server/services/admin";
import { closeAssignment, publishAssignment, updateAssignment, type AssignmentInput } from "@/server/services/assignments";
import { announceOpenedBookings } from "@/server/services/automations";
import { bookSlot, cancelBooking, listOverdueAttendance, markAttendance, rescheduleBooking, staffCancelBooking } from "@/server/services/bookings";
import { createVenue, importRoster, removeMember, setCourseArchived } from "@/server/services/courses";
import { getOrCreateEvaluation, saveEvaluation } from "@/server/services/evaluations";
import { courseProgress } from "@/server/services/reports";
import { cancelSlot } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

/** The assignment's current settings as an update input, with overrides. */
async function editInput(
  assignmentId: string,
  patch: Partial<Omit<AssignmentInput, "policy">> & { policy?: Partial<AssignmentInput["policy"]> } = {},
): Promise<AssignmentInput> {
  const a = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { policy: true, criteria: { orderBy: { order: "asc" } } } });
  const p = a.policy!;
  const policy = {
    windowStart: p.windowStart,
    windowEnd: p.windowEnd,
    slotDurationMin: p.slotDurationMin,
    bufferMin: p.bufferMin,
    capacityPerSlot: p.capacityPerSlot,
    bookingOpensAt: p.bookingOpensAt,
    freezeHours: p.freezeHours,
    maxReschedules: p.maxReschedules,
    allowStudentCancel: p.allowStudentCancel,
  };
  return {
    title: a.title,
    description: a.description,
    maxMarks: a.maxMarks,
    criteria: a.criteria.map((c) => ({ label: c.label, maxPoints: c.maxPoints })),
    ...patch,
    policy: { ...policy, ...patch.policy },
  };
}

describe("change budget (BR-01)", () => {
  it("counts cancel → rebook against the same budget as reschedules", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta, { maxReschedules: 1 });
    await enroll(course.id, [ann]);

    const first = await bookSlot(ann, slots[0].id);
    await cancelBooking(ann, first!.id); // spends the only change
    const second = await bookSlot(ann, slots[1].id); // still allowed: 1 used of 1
    await expect(rescheduleBooking(ann, second!.id, slots[2].id)).rejects.toThrow(/used all 1 change/);
    await cancelBooking(ann, second!.id); // allowed, but now over budget
    await expect(bookSlot(ann, slots[2].id)).rejects.toThrow(/used all your changes/);
  });

  it("never charges the student for staff cancellations", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta, { maxReschedules: 0 });
    await enroll(course.id, [ann]);

    const b = await bookSlot(ann, slots[0].id);
    await expect(staffCancelBooking(ta, b!.id, "  ")).rejects.toThrow(/reason/);
    await staffCancelBooking(ta, b!.id, "Room double-booked");
    const again = await bookSlot(ann, slots[1].id);
    await expect(cancelSlot(ta, slots[1].id, "")).rejects.toThrow(/reason/);
    await cancelSlot(ta, slots[1].id, "TA is ill");
    await bookSlot(ann, slots[2].id);
    expect(again).toBeTruthy();
  });

  it("adds staff-granted extra changes", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta, { maxReschedules: 0 });
    await enroll(course.id, [ann]);
    await db.bookingAllowance.create({ data: { assignmentId: assignment.id, studentId: ann.id, extraChanges: 1, grantedById: ta.id } });

    const b = await bookSlot(ann, slots[0].id);
    const moved = await rescheduleBooking(ann, b!.id, slots[1].id);
    await expect(rescheduleBooking(ann, moved!.id, slots[2].id)).rejects.toThrow(/used all 1 change/);
  });
});

describe("closed and archived courses", () => {
  it("refuses a student cancel after booking closed (BR-02)", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    await closeAssignment(ta, assignment.id);
    await expect(cancelBooking(ann, b!.id)).rejects.toThrow(/Booking is closed/);
  });

  it("lets a student with a late-booking allowance book after close", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await closeAssignment(ta, assignment.id);
    await expect(bookSlot(ann, slots[0].id)).rejects.toThrow(/not open/);
    await db.bookingAllowance.create({ data: { assignmentId: assignment.id, studentId: ann.id, lateBooking: true, grantedById: ta.id } });
    await bookSlot(ann, slots[0].id);
  });

  it("makes archived courses read-only (BR-05)", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await setCourseArchived(ta, course.id, true);
    await expect(bookSlot(ann, slots[0].id)).rejects.toThrow(/archived/);
    await expect(createVenue(ta, course.id, { name: "Lab 9" })).rejects.toThrow(/archived/);
    await expect(importRoster(ta, course.id, "email\nx@uni.edu")).rejects.toThrow(/archived/);
    await setCourseArchived(ta, course.id, false);
    await bookSlot(ann, slots[0].id);
  });
});

describe("booking opens later (BR-03)", () => {
  it("tells students when it opens, then announces once when it does", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const opensAt = inHours(6);
    const { course, assignment } = await setupCourse(ta, { bookingOpensAt: opensAt, publish: false });
    await enroll(course.id, [ann]);
    const r = await publishAssignment(ta, assignment.id);
    expect(r.opensAt).toEqual(opensAt);

    const types = async () => (await db.notification.findMany({ where: { userId: ann.id }, orderBy: { createdAt: "asc" } })).map((n) => n.type);
    expect(await types()).toEqual(["assignment.opens_soon"]);
    expect(await announceOpenedBookings(inHours(1))).toBe(0);
    expect(await announceOpenedBookings(inHours(7))).toBe(1);
    expect(await announceOpenedBookings(inHours(8))).toBe(0);
    expect(await types()).toEqual(["assignment.opens_soon", "assignment.published"]);
  });
});

describe("removing members (BR-04)", () => {
  it("releases a removed student's upcoming bookings", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);
    expect(await removeMember(ta, course.id, ann.id)).toEqual({ released: 1 });
    expect(await db.booking.count({ where: { slotId: slots[0].id, status: "BOOKED" } })).toBe(0);
    expect(await db.notification.count({ where: { userId: ann.id, type: "course.removed" } })).toBe(1);
  });

  it("won't remove a host who still has upcoming slots", async () => {
    const ta = await makeUser("Tara TA");
    const prof = await makeUser("Prof");
    const { course } = await setupCourse(ta);
    await enroll(course.id, [prof], "INSTRUCTOR");
    await expect(removeMember(prof, course.id, ta.id)).rejects.toThrow(/hosts 4 upcoming slots/);
  });
});

describe("attendance (BR-06, BR-12)", () => {
  it("can only be recorded once the demo started, and overdue demos are flagged", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    await expect(markAttendance(ta, b!.id, "COMPLETED")).rejects.toThrow(/once the demo has started/);

    const later = inHours(2, slots[0].startsAt);
    expect(await listOverdueAttendance(ta, course.id, undefined, later)).toHaveLength(1);
    expect((await courseProgress(ta, course.id, later))[0].needsAttendance).toBe(1);

    await markAttendance(ta, b!.id, "NO_SHOW", later);
    expect(await listOverdueAttendance(ta, course.id, undefined, later)).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: ann.id, type: "booking.no_show" } })).toBe(1);
  });
});

describe("editing an assignment after bookings (BR-07)", () => {
  it("guards marks and the demo window, and tells booked students about rule changes", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);

    const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
    await saveEvaluation(ta, ev.id, { scores: ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints })), totalMarks: null });
    await expect(updateAssignment(ta, assignment.id, await editInput(assignment.id, { maxMarks: 9, criteria: [] }))).rejects.toThrow(
      /already has 10 marks/,
    );
    await expect(
      updateAssignment(ta, assignment.id, await editInput(assignment.id, { policy: { windowStart: inHours(72) } })),
    ).rejects.toThrow(/outside the new demo window/);

    const r = await updateAssignment(ta, assignment.id, await editInput(assignment.id, { policy: { freezeHours: 24 } }));
    expect(r.notified).toBe(1);
    const note = await db.notification.findFirstOrThrow({ where: { userId: ann.id, type: "assignment.rules_changed" } });
    expect(note.body).toContain("24h");
  });
});

describe("admin & roster notifications (BR-10, BR-11)", () => {
  it("can release a disabled user's upcoming bookings", async () => {
    const admin = await makeUser("Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);
    expect(await adminSetUserDisabled(admin, ann.id, true, { releaseBookings: true })).toEqual({ released: 1 });
    expect(await db.booking.count({ where: { status: "BOOKED" } })).toBe(0);
  });

  it("tells students added after publishing which demos are open", async () => {
    const ta = await makeUser("Tara TA");
    const late = await makeUser("Late Student");
    const { course } = await setupCourse(ta);
    await importRoster(ta, course.id, `email\n${late.email}`);
    const note = await db.notification.findFirstOrThrow({ where: { userId: late.id, type: "course.enrolled" } });
    expect(note.body).toContain("open for booking: Project demo");
  });
});
