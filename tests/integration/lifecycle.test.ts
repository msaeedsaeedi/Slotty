import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { acceptInvite, authenticate } from "@/server/services/accounts";
import { createCourse, importRoster } from "@/server/services/courses";
import { createAssignment, publishAssignment } from "@/server/services/assignments";
import { addAvailability, cancelSlot, changeVenue, listOpenSlots } from "@/server/services/slots";
import { bookSlot, cancelBooking, markAttendance, rescheduleBooking } from "@/server/services/bookings";
import {
  getMyResult,
  getOrCreateEvaluation,
  reviewEvaluation,
  saveEvaluation,
  submitEvaluations,
  unlockEvaluation,
} from "@/server/services/evaluations";
import { courseProgress, exportAssignmentCsv } from "@/server/services/reports";
import { queueDueReminders } from "@/server/services/reminders";
import { createVenue } from "@/server/services/courses";
import type { Actor } from "@/server/services/access";
import { inHours, makeUser, resetDb } from "./helpers";

async function setupCourse(ta: Actor, opts: { capacity?: number; freezeHours?: number } = {}) {
  const course = await createCourse(ta, { code: "CS101", title: "Intro", term: "Fall 2026", timezone: "UTC", myRole: "TA" });
  const venue = await createVenue(ta, course.id, { name: "Lab 1", location: "Building A" });
  const start = inHours(48);
  const assignment = await createAssignment(ta, course.id, {
    title: "Project demo",
    description: "",
    maxMarks: 10,
    criteria: [
      { label: "Functionality", maxPoints: 6 },
      { label: "Code quality", maxPoints: 4 },
    ],
    policy: {
      windowStart: inHours(24),
      windowEnd: inHours(24 * 14),
      slotDurationMin: 15,
      bufferMin: 0,
      capacityPerSlot: opts.capacity ?? 1,
      bookingOpensAt: null,
      freezeHours: opts.freezeHours ?? 12,
      maxReschedules: 1,
      allowStudentCancel: true,
    },
  });
  await addAvailability(ta, assignment.id, { taId: ta.id, venueId: venue.id, startsAt: start, endsAt: inHours(1, start) });
  await publishAssignment(ta, assignment.id);
  const slots = await db.slot.findMany({ where: { assignmentId: assignment.id }, orderBy: { startsAt: "asc" } });
  return { course, venue, assignment, slots };
}

async function enroll(courseId: string, users: Actor[], role: "STUDENT" | "TA" | "INSTRUCTOR" = "STUDENT") {
  await db.enrollment.createMany({ data: users.map((u) => ({ courseId, userId: u.id, role })) });
}

beforeEach(resetDb);

describe("roster import & invites", () => {
  it("creates invited accounts from CSV and lets them set a password", async () => {
    const ta = await makeUser("Tara TA");
    const course = await createCourse(ta, { code: "CS1", title: "C", term: "T", timezone: "UTC", myRole: "TA" });
    const existing = await makeUser("Existing Student");

    const res = await importRoster(ta, course.id, `email,name\nnew.student@uni.edu,New Student\n${existing.email},Existing Student\nbad-email`);
    expect(res).toMatchObject({ invited: 1, enrolled: 2, errors: [{ line: 4 }] });

    const invite = await db.emailOutbox.findFirstOrThrow({ where: { to: "new.student@uni.edu" } });
    const token = /\/invite\/([\w-]+)/.exec(invite.text)![1];
    await acceptInvite(token, { name: "New Student", password: "correct-horse" });
    await expect(authenticate("NEW.student@uni.edu", "correct-horse")).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(acceptInvite(token, { name: "x", password: "another-pass" })).rejects.toThrow(/expired|invalid/i);

    // Existing users get an in-app notification instead of an invite.
    expect(await db.notification.count({ where: { userId: existing.id, type: "course.enrolled" } })).toBe(1);

    // Re-importing is idempotent.
    const again = await importRoster(ta, course.id, `email\nnew.student@uni.edu\n${existing.email}`);
    expect(again).toMatchObject({ invited: 0, enrolled: 0, unchanged: 2 });
  });

  it("stops TAs adding instructors and students importing at all", async () => {
    const ta = await makeUser("Tara TA");
    const student = await makeUser("Sam Student");
    const course = await createCourse(ta, { code: "CS1", title: "C", term: "T", timezone: "UTC", myRole: "TA" });
    await enroll(course.id, [student]);
    await expect(importRoster(ta, course.id, "email,role\nboss@uni.edu,instructor")).rejects.toThrow(/instructors/);
    await expect(importRoster(student, course.id, "email\nx@uni.edu")).rejects.toThrow(/permission/);
  });
});

describe("booking", () => {
  it("books, blocks double booking, reschedules within limits and cancels", async () => {
    const ta = await makeUser("Tara TA");
    const [ann, bob] = [await makeUser("Ann"), await makeUser("Bob")];
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann, bob]);
    expect(slots).toHaveLength(4);

    const booking = await bookSlot(ann, slots[0].id);
    await expect(bookSlot(bob, slots[0].id)).rejects.toThrow("This slot is full.");
    await expect(bookSlot(ann, slots[1].id)).rejects.toThrow(/already have a booking/);

    const open = await listOpenSlots(ann, assignment.id);
    expect(open.find((s) => s.id === slots[0].id)?.seatsLeft).toBe(0);

    const moved = await rescheduleBooking(ann, booking!.id, slots[1].id);
    expect(moved!.rescheduleCount).toBe(1);
    await bookSlot(bob, slots[0].id); // freed by the reschedule
    await expect(rescheduleBooking(ann, moved!.id, slots[2].id)).rejects.toThrow(/used all 1 reschedules/);

    // Inside the freeze window the booking is locked.
    const nearSlotStart = inHours(-1, slots[1].startsAt);
    await expect(cancelBooking(ann, moved!.id, nearSlotStart)).rejects.toThrow(/locked 12h/);
    await cancelBooking(ann, moved!.id);
    expect(await db.booking.count({ where: { studentId: ann.id, status: "BOOKED" } })).toBe(0);

    const kinds = await db.notification.findMany({ where: { userId: ann.id }, select: { type: true } });
    expect(kinds.map((k) => k.type)).toEqual(
      expect.arrayContaining(["booking.confirmed", "booking.rescheduled", "booking.cancelled"]),
    );
  });

  it("gives a capacity-1 slot to exactly one of 20 simultaneous students", async () => {
    const ta = await makeUser("Tara TA");
    const { course, slots } = await setupCourse(ta);
    const students = await Promise.all(Array.from({ length: 20 }, (_, i) => makeUser(`Student ${i}`)));
    await enroll(course.id, students);

    const results = await Promise.allSettled(students.map((s) => bookSlot(s, slots[0].id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.booking.count({ where: { slotId: slots[0].id, status: "BOOKED" } })).toBe(1);
  });

  it("lets one student hold only one booking even when booking two slots at once", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const results = await Promise.allSettled([bookSlot(ann, slots[0].id), bookSlot(ann, slots[1].id), bookSlot(ann, slots[2].id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.booking.count({ where: { studentId: ann.id, status: "BOOKED" } })).toBe(1);
  });

  it("releases and notifies students when staff cancel a slot or change its venue", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);

    const room = await createVenue(ta, course.id, { name: "Room 42" });
    await changeVenue(ta, [slots[0].id], room.id);
    const venueEmail = await db.emailOutbox.findFirstOrThrow({ where: { to: ann.email, subject: { startsWith: "Venue changed" } } });
    expect(venueEmail.text).toContain("Room 42");

    await cancelSlot(ta, slots[0].id, "TA is sick");
    expect(await db.booking.count({ where: { studentId: ann.id, status: "BOOKED" } })).toBe(0);
    await bookSlot(ann, slots[1].id); // can rebook straight away
  });
});

describe("evaluation lifecycle", () => {
  it("TA running a course alone: submit finalizes, student sees marks but not private notes", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const booking = await bookSlot(ann, slots[0].id);
    await markAttendance(ta, booking!.id, "COMPLETED");

    const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
    const [functionality, quality] = ev.assignment.criteria;
    await expect(submitEvaluations(ta, [ev.id])).rejects.toThrow(/Score "Functionality"/);
    await saveEvaluation(ta, ev.id, {
      scores: [
        { criterionId: functionality.id, points: 5 },
        { criterionId: quality.id, points: 3.5 },
      ],
      totalMarks: null,
      feedback: "Nice work",
      privateNotes: "Struggled with questions on complexity",
    });
    expect(await getMyResult(ann, assignment.id)).toBeNull(); // not released yet

    const [result] = await submitEvaluations(ta, [ev.id]);
    expect(result.status).toBe("FINALIZED");
    const mine = await getMyResult(ann, assignment.id);
    expect(mine).toMatchObject({ totalMarks: 8.5, maxMarks: 10, feedback: "Nice work" });
    expect(JSON.stringify(mine)).not.toContain("Struggled");

    await expect(saveEvaluation(ta, ev.id, { scores: [], totalMarks: 1 })).rejects.toThrow(/locked/);
    await expect(markAttendance(ta, booking!.id, "NO_SHOW")).rejects.toThrow(/locked/);
    // With no instructor, the TA may unlock to fix a mistake.
    await unlockEvaluation(ta, ev.id, "typo");
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("RETURNED");

    const { csv } = await exportAssignmentCsv(ta, assignment.id);
    expect(csv).toContain("Ann");
    expect(csv).toContain("completed");
    expect(csv).toContain("Functionality (/6)");
  });

  it("with an instructor: submit → return → resubmit → finalize, and only instructors review", async () => {
    const ta = await makeUser("Tara TA");
    const prof = await makeUser("Prof Ivy");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await enroll(course.id, [prof], "INSTRUCTOR");
    const booking = await bookSlot(ann, slots[0].id);
    await markAttendance(ta, booking!.id, "COMPLETED");

    const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
    const scores = ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints }));
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null });
    expect((await submitEvaluations(ta, [ev.id]))[0].status).toBe("SUBMITTED");

    await expect(reviewEvaluation(ta, ev.id, "finalize")).rejects.toThrow(/Only instructors/);
    await expect(reviewEvaluation(prof, ev.id, "return")).rejects.toThrow(/what needs to change/);
    await reviewEvaluation(prof, ev.id, "return", "Add feedback please");
    expect(await db.notification.count({ where: { userId: ta.id, type: "evaluation.returned" } })).toBe(1);

    await saveEvaluation(ta, ev.id, { scores, totalMarks: null, feedback: "Excellent" });
    await submitEvaluations(ta, [ev.id]);
    await reviewEvaluation(prof, ev.id, "finalize");
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 10, feedback: "Excellent" });
    await expect(unlockEvaluation(ta, ev.id, "oops")).rejects.toThrow(/instructor/);

    const progress = await courseProgress(prof, course.id);
    expect(progress[0]).toMatchObject({ students: 1, completed: 1, finalized: 1, unbooked: 0 });
  });
});

describe("reminders", () => {
  it("queues the 24h and 1h reminders once each", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);

    const dayBefore = inHours(-23, slots[0].startsAt);
    expect(await queueDueReminders(dayBefore)).toBe(1);
    expect(await queueDueReminders(dayBefore)).toBe(0);
    expect(await queueDueReminders(inHours(-0.5, slots[0].startsAt))).toBe(1);
    expect(await db.emailOutbox.count({ where: { to: ann.email, subject: { startsWith: "Reminder" } } })).toBe(2);
  });
});
