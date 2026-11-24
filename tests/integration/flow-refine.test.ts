import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminAssignStaff, adminCreateCourse, adminInviteUser } from "@/server/services/admin";
import { createAssignment, updateAssignment } from "@/server/services/assignments";
import { bookSlot, cancelBooking, isMyBookingMarked, staffCancelBooking } from "@/server/services/bookings";
import { addMember, createCourse, importRoster, removeMember, setCourseArchived, updateCourse } from "@/server/services/courses";
import { clearMarks, getMyResult, saveDraft, submitEvaluations, unlockEvaluation, releaseHeldMarks } from "@/server/services/evaluations";
import { addAvailability, cancelSlot } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

async function scoreAll(actor: Parameters<typeof saveDraft>[0], assignmentId: string, studentId: string, now: Date, extra: { earlyMarkReason?: string } = {}) {
  const criteria = await db.rubricCriterion.findMany({ where: { assignmentId } });
  return saveDraft(actor, assignmentId, studentId, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints - 1 })), totalMarks: null, feedback: "Nice", ...extra }, now);
}

describe("who can hold which role", () => {
  it("never makes an instructor a TA or a student, or a TA or student an instructor", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const prof = await makeUser("Prof");
    const ta = await makeUser("Tara TA");
    const sam = await makeUser("Sam Student");
    const cs1 = await adminCreateCourse(admin, { code: "CS1", title: "One", term: "T", timezone: "Asia/Karachi", staff: { email: prof.email, role: "INSTRUCTOR" } });
    const lead = await makeUser("Lead");
    const { course } = await setupCourse(ta);
    await enroll(course.id, [sam]);
    await adminAssignStaff(admin, course.id, { email: lead.email, role: "INSTRUCTOR" });

    const r = await importRoster(lead, course.id, `email,role\n${prof.email},ta\n${prof.email.replace("prof", "x")},ta`);
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, message: expect.stringMatching(/instructor in CS1/) })]);
    await expect(adminAssignStaff(admin, course.id, { email: prof.email, role: "TA" })).rejects.toThrow(/instructors can't also be TAs/);
    await expect(adminAssignStaff(admin, cs1.course.id, { email: ta.email, role: "INSTRUCTOR" })).rejects.toThrow(/TAs can't also be instructors/);
    // Students are never instructors: not elsewhere, and not promoted in their own course.
    await expect(adminAssignStaff(admin, cs1.course.id, { email: sam.email, role: "INSTRUCTOR" })).rejects.toThrow(/students can't be instructors/);
    await expect(adminAssignStaff(admin, course.id, { email: sam.email, role: "INSTRUCTOR" })).rejects.toThrow(/student in this course/);
    // ...and instructors never students.
    await expect(importRoster(ta, course.id, `email,role\n${prof.email},student`)).rejects.toThrow(/instructors can't also be students/);
    // A TA can still study in another course.
    expect((await importRoster(prof, cs1.course.id, `email,role\n${ta.email},student`)).enrolled).toBe(1);
  });

  it("lets only TAs and new staff create a course, and always as its TA", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const fresh = await makeUser("Fresh Staff");
    const ta = await makeUser("Tara TA");
    const sam = await makeUser("Sam Student");
    const prof = await makeUser("Prof");
    const { course } = await setupCourse(ta);
    await enroll(course.id, [sam]);
    await adminCreateCourse(admin, { code: "CS9", title: "Nine", term: "T", timezone: "UTC", staff: { email: prof.email, role: "INSTRUCTOR" } });

    await expect(createCourse(sam, { code: "QA", title: "Q", term: "T", timezone: "UTC" })).rejects.toThrow(/Students can't create courses/);
    await expect(createCourse(prof, { code: "QA", title: "Q", term: "T", timezone: "UTC" })).rejects.toThrow(/admin/);
    // Even a crafted form can't pick a role: the creator is the TA.
    const mine = await createCourse(fresh, { code: "NEW", title: "N", term: "T", timezone: "UTC", myRole: "INSTRUCTOR" } as never);
    expect(await db.enrollment.findMany({ where: { courseId: mine.id }, select: { userId: true, role: true } })).toEqual([{ userId: fresh.id, role: "TA" }]);
    expect((await createCourse(ta, { code: "CS2", title: "Two", term: "T", timezone: "UTC" })).id).toBeTruthy();
  });

  it("leaves instructors to admins, and course settings to the instructor when there is one", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const prof = await makeUser("Prof");
    const { course } = await setupCourse(ta);
    await updateCourse(ta, course.id, { code: "CS101", title: "Renamed", term: "T", timezone: "UTC" });

    await expect(importRoster(ta, course.id, "email,role\nboss@uni.edu,instructor")).rejects.toThrow(/Only a Uniflow admin/);
    await expect(addMember(ta, course.id, { email: "boss@uni.edu", name: "Boss", role: "INSTRUCTOR" })).rejects.toThrow(/Only a Uniflow admin/);
    await adminAssignStaff(admin, course.id, { email: prof.email, role: "INSTRUCTOR" });
    // Instructors don't add instructors either, and a TA can't demote one by re-adding them.
    await expect(addMember(prof, course.id, { email: "co@uni.edu", name: "Co", role: "INSTRUCTOR" })).rejects.toThrow(/Only a Uniflow admin/);
    await expect(importRoster(ta, course.id, `email,role\n${prof.email},ta`)).rejects.toThrow(/Only a Uniflow admin/);
    await expect(removeMember(ta, course.id, prof.id)).rejects.toThrow(/Only a Uniflow admin/);
    await expect(removeMember(prof, course.id, prof.id)).rejects.toThrow();
    // With an instructor, the TA no longer runs the course's settings.
    await expect(updateCourse(ta, course.id, { code: "CS101", title: "X", term: "T", timezone: "UTC" })).rejects.toThrow(/instructor/);
    await expect(setCourseArchived(ta, course.id, true)).rejects.toThrow(/instructor/);
    // Admins read courses but change nothing inside them; staff go through the console.
    await expect(addMember(admin, course.id, { email: "co@uni.edu", name: "Co", role: "INSTRUCTOR" })).rejects.toThrow(/read-only/);
    await expect(setCourseArchived(admin, course.id, true)).rejects.toThrow(/read-only/);
    await adminAssignStaff(admin, course.id, { email: "co@uni.edu", name: "Co", role: "INSTRUCTOR" });
    await setCourseArchived(prof, course.id, true);
  });
});

describe("admin invites", () => {
  it("invites someone without a course, once", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const u = await adminInviteUser(admin, { email: "New@Uni.edu", name: "Nora" });
    expect(u.status).toBe("INVITED");
    expect(await db.emailOutbox.count({ where: { to: "new@uni.edu", subject: "You're invited to Uniflow" } })).toBe(1);
    await expect(adminInviteUser(admin, { email: "new@uni.edu", name: "Nora" })).rejects.toThrow(/already has an account/);
  });
});

describe("notifications", () => {
  it("emails only people who have activated their account", async () => {
    const ta = await makeUser("Tara TA");
    const { course, assignment, slots } = await setupCourse(ta, { publish: false });
    await importRoster(ta, course.id, "email,name\nfresh@uni.edu,Fresh");
    await db.emailOutbox.deleteMany();
    await addAvailability(ta, assignment.id, { taId: ta.id, venueId: null, startsAt: inHours(3, slots[0].startsAt), endsAt: inHours(4, slots[0].startsAt) });
    const { publishAssignment } = await import("@/server/services/assignments");
    await publishAssignment(ta, assignment.id);
    const fresh = await db.user.findUniqueOrThrow({ where: { email: "fresh@uni.edu" } });
    expect(await db.notification.count({ where: { userId: fresh.id, type: "assignment.published" } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { to: "fresh@uni.edu" } })).toBe(0);
  });

  it("tells unbooked students about new slots, and says when the opening time moves", async () => {
    const ta = await makeUser("Tara TA");
    const [ann, bob] = await Promise.all([makeUser("Ann"), makeUser("Bob")]);
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann, bob]);
    await bookSlot(ann, slots[0].id);
    await addAvailability(ta, assignment.id, { taId: ta.id, venueId: null, startsAt: inHours(24, slots[0].startsAt), endsAt: inHours(25, slots[0].startsAt) });
    const added = await db.notification.findMany({ where: { type: "slots.added" } });
    expect(added.map((n) => n.userId)).toEqual([bob.id]);
    expect(added[0].body).toMatch(/4 new slots/);

    const a = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { policy: true, criteria: true } });
    const p = a.policy!;
    const policy = {
      windowStart: p.windowStart,
      windowEnd: p.windowEnd,
      slotDurationMin: p.slotDurationMin,
      bufferMin: p.bufferMin,
      capacityPerSlot: p.capacityPerSlot,
      freezeHours: p.freezeHours,
      maxReschedules: p.maxReschedules,
      allowStudentCancel: p.allowStudentCancel,
    };
    await updateAssignment(ta, assignment.id, {
      title: a.title,
      maxMarks: a.maxMarks,
      criteria: a.criteria.map((c) => ({ label: c.label, maxPoints: c.maxPoints })),
      policy: { ...policy, bookingOpensAt: inHours(30) },
    });
    const moved = await db.notification.findFirstOrThrow({ where: { userId: bob.id, type: "assignment.opening_moved" } });
    expect(moved.title).toMatch(/^New booking time/);
  });

  it("keeps marks out of the release message, and calls a correction an update", async () => {
    const prof = await makeUser("Prof");
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [prof], "INSTRUCTOR");
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);
    const during = inHours(0.1, slots[0].startsAt);
    const draft = await scoreAll(ta, assignment.id, ann.id, during);
    const [submitted] = await submitEvaluations(ta, [draft.evaluationId]);
    expect(submitted.status).toBe("SUBMITTED");

    // The instructor is the reviewer: what they submit is final.
    const { reviewEvaluation } = await import("@/server/services/evaluations");
    await reviewEvaluation(prof, draft.evaluationId, "finalize");
    const released = await db.notification.findFirstOrThrow({ where: { userId: ann.id, type: "evaluation.finalized" } });
    // Marks, scores and feedback stay in Uniflow: the message only says they're out and links there.
    expect(released.body).toMatch(/are released\. Open Uniflow/);
    expect(released.link).toBe(`/courses/${course.id}/assignments/${assignment.id}`);
    for (const secret of ["8 / 10", "5/6", "Nice", "Total"]) expect(released.body).not.toContain(secret);
    const email = await db.emailOutbox.findFirstOrThrow({ where: { to: ann.email, subject: { startsWith: "Marks released" } } });
    for (const secret of ["8 / 10", "5/6", "Nice"]) expect(email.text + (email.html ?? "")).not.toContain(secret);

    await unlockEvaluation(prof, draft.evaluationId, "Recount");
    const criteria = await db.rubricCriterion.findMany({ where: { assignmentId: assignment.id } });
    await saveDraft(prof, assignment.id, ann.id, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints })), totalMarks: null }, during);
    const [again] = await submitEvaluations(prof, [draft.evaluationId]);
    expect(again.status).toBe("FINALIZED");
    // Corrected before Ann saw the first release: one item and one (still pending) email, with the final marks.
    const items = await db.notification.findMany({ where: { userId: ann.id, groupKey: { startsWith: "marks:" } } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "evaluation.finalized", title: expect.stringMatching(/^Marks released/) });
    expect(items[0].body).not.toContain("10 / 10");
    expect(await db.emailOutbox.count({ where: { to: ann.email, subject: { startsWith: "Marks" } } })).toBe(1);

    // Once she has read it, a later correction says what changed.
    await db.notification.updateMany({ where: { userId: ann.id }, data: { readAt: new Date() } });
    await unlockEvaluation(prof, draft.evaluationId, "Recount again");
    await saveDraft(prof, assignment.id, ann.id, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints - 1 })), totalMarks: null }, during);
    await submitEvaluations(prof, [draft.evaluationId]);
    const updated = await db.notification.findFirstOrThrow({ where: { userId: ann.id, type: "evaluation.updated" } });
    expect(updated.title).toMatch(/^Marks updated/);
    expect(updated.body).toMatch(/were corrected\. Open Uniflow/);
    expect(updated.body).not.toMatch(/\d+ \/ 10/);
  });
});

describe("marks pin the booking", () => {
  it("needs a reason to mark before the demo, and then the booking can't change until the marks are cleared", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const booking = await bookSlot(ann, slots[0].id);
    const before = inHours(-1, slots[0].startsAt);

    await expect(scoreAll(ta, assignment.id, ann.id, before)).rejects.toThrow(/hasn't started/);
    const r = await scoreAll(ta, assignment.id, ann.id, before, { earlyMarkReason: "Demoed early by arrangement" });
    expect(r.bookingStatus).toBe("BOOKED");
    expect(await db.auditLog.count({ where: { action: "evaluation.early" } })).toBe(1);

    await expect(cancelBooking(ann, booking.id, inHours(-48, slots[0].startsAt))).rejects.toThrow(/already been marked/);
    await expect(staffCancelBooking(ta, booking.id, "clash")).rejects.toThrow(/Clear the marks/);
    await expect(cancelSlot(ta, slots[0].id, "room closed")).rejects.toThrow(/already has marks/);

    await clearMarks(ta, r.evaluationId, "Wrong student");
    await staffCancelBooking(ta, booking.id, "clash");
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
  });
});

describe("QA fixes (Nov 2026)", () => {
  it("refuses a rubric that doesn't add up to the max marks (B1)", async () => {
    const ta = await makeUser("Tara TA");
    const { course, assignment } = await setupCourse(ta);
    const a = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { policy: true } });
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
    const input = { title: "Viva", description: "", maxMarks: 10, policy, criteria: [{ label: "Working code", maxPoints: 6 }, { label: "Explanation", maxPoints: 3 }] };
    await expect(createAssignment(ta, course.id, input)).rejects.toThrow(/add up to 9.*full marks would be impossible/);
    await expect(createAssignment(ta, course.id, { ...input, criteria: [{ label: "All", maxPoints: 11 }] })).rejects.toThrow(/more than the max marks/);
    expect((await createAssignment(ta, course.id, { ...input, criteria: [{ label: "All", maxPoints: 10 }] })).maxMarks).toBe(10);
    // No rubric: marked as one total.
    expect((await createAssignment(ta, course.id, { ...input, criteria: [] })).id).toBeTruthy();
  });

  it("keeps released marks (and the student's question) visible while staff correct them (B5), and pins the booking (B6)", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);
    expect(await isMyBookingMarked(ann, assignment.id)).toBe(false);
    const during = inHours(0.1, slots[0].startsAt);
    const draft = await scoreAll(ta, assignment.id, ann.id, during);
    expect(await isMyBookingMarked(ann, assignment.id)).toBe(true);
    // Draft marks stay hidden from the student.
    expect(await getMyResult(ann, assignment.id)).toBeNull();
    await submitEvaluations(ta, [draft.evaluationId]);
    await releaseHeldMarks(inHours(25));
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 8, underReview: false });

    await unlockEvaluation(ta, draft.evaluationId, "Recount");
    const criteria = await db.rubricCriterion.findMany({ where: { assignmentId: assignment.id } });
    await saveDraft(ta, assignment.id, ann.id, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints })), totalMarks: null }, during);
    // Ann still sees what she was given, flagged as being corrected, not the new draft.
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 8, underReview: true, scores: [expect.objectContaining({ points: 5 }), expect.anything()] });
    await submitEvaluations(ta, [draft.evaluationId]);
    // The correction is held too: Ann keeps seeing the earlier marks until it's released.
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 8, underReview: true });
    await releaseHeldMarks(inHours(25));
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 10, underReview: false });
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: draft.evaluationId } })).released).toBeNull();
  });
});
