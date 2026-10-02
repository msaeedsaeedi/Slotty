import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminAssignStaff, adminInviteUser } from "@/server/services/admin";
import { updateAssignment } from "@/server/services/assignments";
import { bookSlot, cancelBooking, staffCancelBooking } from "@/server/services/bookings";
import { createCourse, importRoster } from "@/server/services/courses";
import { clearMarks, saveDraft, submitEvaluations, unlockEvaluation } from "@/server/services/evaluations";
import { addAvailability, cancelSlot } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

async function scoreAll(actor: Parameters<typeof saveDraft>[0], assignmentId: string, studentId: string, now: Date, extra: { earlyMarkReason?: string } = {}) {
  const criteria = await db.rubricCriterion.findMany({ where: { assignmentId } });
  return saveDraft(actor, assignmentId, studentId, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints - 1 })), totalMarks: null, feedback: "Nice", ...extra }, now);
}

describe("who can hold which role", () => {
  it("never makes an instructor a TA, or a TA an instructor, in another course", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const prof = await makeUser("Prof");
    const ta = await makeUser("Tara TA");
    await createCourse(prof, { code: "CS1", title: "One", term: "T", timezone: "Asia/Karachi", myRole: "INSTRUCTOR" });
    const { course } = await setupCourse(ta);

    const r = await importRoster(ta, course.id, `email,role\n${prof.email},ta\n${prof.email.replace("prof", "x")},ta`);
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, message: expect.stringMatching(/instructor in CS1/) })]);
    await expect(adminAssignStaff(admin, course.id, { email: prof.email, role: "TA" })).rejects.toThrow(/instructors can't also be TAs/);
    await expect(createCourse(ta, { code: "CS2", title: "Two", term: "T", timezone: "Asia/Karachi", myRole: "INSTRUCTOR" })).rejects.toThrow(/TA in CS101/);
    // A TA can still study in another course.
    const other = await createCourse(prof, { code: "CS3", title: "Three", term: "T", timezone: "Asia/Karachi", myRole: "INSTRUCTOR" });
    expect((await importRoster(prof, other.id, `email,role\n${ta.email},student`)).enrolled).toBe(1);
  });
});

describe("admin invites", () => {
  it("invites someone without a course, once", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const u = await adminInviteUser(admin, { email: "New@Uni.edu", name: "Nora" });
    expect(u.status).toBe("INVITED");
    expect(await db.emailOutbox.count({ where: { to: "new@uni.edu", subject: "You're invited to Slotty" } })).toBe(1);
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

  it("puts the full result in the marks email, and calls a correction an update", async () => {
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
    expect(released.body).toContain("Total: 8 / 10");
    expect(released.body).toContain("• Functionality: 5/6");
    expect(released.body).toContain("Feedback: Nice");

    await unlockEvaluation(prof, draft.evaluationId, "Recount");
    const criteria = await db.rubricCriterion.findMany({ where: { assignmentId: assignment.id } });
    await saveDraft(prof, assignment.id, ann.id, { scores: criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints })), totalMarks: null }, during);
    const [again] = await submitEvaluations(prof, [draft.evaluationId]);
    expect(again.status).toBe("FINALIZED");
    const updated = await db.notification.findFirstOrThrow({ where: { userId: ann.id, type: "evaluation.updated" } });
    expect(updated.title).toMatch(/^Marks updated/);
    expect(updated.body).toContain("Total: 10 / 10 (was 8)");
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
