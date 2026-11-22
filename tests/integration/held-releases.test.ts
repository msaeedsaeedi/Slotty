import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot, markAttendance } from "@/server/services/bookings";
import {
  adminListHeldMarks,
  adminWithdrawEvaluation,
  getMyResult,
  getOrCreateEvaluation,
  releaseHeldMarks,
  reviewEvaluation,
  saveEvaluation,
  submitEvaluations,
  withdrawEvaluation,
} from "@/server/services/evaluations";
import { exportAssignmentCsv } from "@/server/services/reports";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

/** A course without an instructor: two TAs, an admin and one student with complete marks (issue #35, ADR-032). */
async function setup() {
  const ta = await makeUser("Tara TA");
  const ta2 = await makeUser("Theo TA");
  const admin = await makeUser("Ada Admin", { isAdmin: true });
  const ann = await makeUser("Ann");
  const { course, assignment, slots } = await setupCourse(ta);
  await enroll(course.id, [ann]);
  await enroll(course.id, [ta2], "TA");
  const booking = await bookSlot(ann, slots[0].id);
  await markAttendance(ta, booking!.id, "COMPLETED", inHours(1, slots[0].startsAt));
  const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
  await saveEvaluation(ta, ev.id, { scores: ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: 2 })), totalMarks: null, feedback: "Solid" });
  return { ta, ta2, admin, ann, course, assignment, ev };
}

const T0 = new Date("2030-03-04T09:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const studentNotices = (userId: string) => db.notification.findMany({ where: { userId, type: { in: ["evaluation.finalized", "evaluation.updated"] } } });
const statusOf = async (id: string) => db.evaluation.findUniqueOrThrow({ where: { id } });

describe("held mark releases (ADR-032)", () => {
  it("holds a TA's release for 24 hours: nothing for the student until the worker releases it, once", async () => {
    const { ta, ann, assignment, ev } = await setup();
    const [r] = await submitEvaluations(ta, [ev.id], T0);
    expect(r).toMatchObject({ status: "SUBMITTED", releaseAt: at(24) });
    expect(await statusOf(ev.id)).toMatchObject({ submittedById: ta.id, releaseAt: at(24) });
    expect(await getMyResult(ann, assignment.id)).toBeNull();
    expect(await studentNotices(ann.id)).toHaveLength(0);
    expect((await exportAssignmentCsv(ta, assignment.id)).csv).toMatch(/held until 2030-03-05 09:00/);

    expect(await releaseHeldMarks(at(23.9))).toBe(0);
    expect(await releaseHeldMarks(at(24))).toBe(1);
    // A second run, or a second worker, finds nothing left to release.
    expect(await releaseHeldMarks(at(24))).toBe(0);

    expect(await statusOf(ev.id)).toMatchObject({ status: "FINALIZED", releaseAt: null, reviewedById: ta.id });
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 4, feedback: "Solid" });
    expect(await studentNotices(ann.id)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "evaluation.release", entityId: ev.id, actorId: null } })).toBe(1);
  });

  it("lets the submitting TA withdraw before the release, not a co-TA, and not afterwards", async () => {
    const { ta, ta2, ann, assignment, ev } = await setup();
    await submitEvaluations(ta, [ev.id], T0);
    await expect(withdrawEvaluation(ta2, ev.id, at(1))).rejects.toThrow(/Only the TA who submitted/);
    await withdrawEvaluation(ta, ev.id, at(1));
    expect(await statusOf(ev.id)).toMatchObject({ status: "DRAFT", releaseAt: null, submittedById: null });
    expect(await releaseHeldMarks(at(30))).toBe(0);
    expect(await getMyResult(ann, assignment.id)).toBeNull();
    expect(await db.auditLog.count({ where: { action: "evaluation.withdraw", entityId: ev.id, actorId: ta.id } })).toBe(1);

    // Resubmitting starts a new hold; once it has passed, withdrawing is refused.
    await submitEvaluations(ta, [ev.id], at(2));
    await expect(withdrawEvaluation(ta, ev.id, at(26))).rejects.toThrow(/already been released/);
  });

  it("lets an admin withdraw from the console with a reason, and tells the TA", async () => {
    const { ta, ta2, admin, ev } = await setup();
    await submitEvaluations(ta, [ev.id], T0);
    expect((await adminListHeldMarks(admin)).map((e) => e.id)).toEqual([ev.id]);
    await expect(adminListHeldMarks(ta)).rejects.toThrow(/Admins only/);
    await expect(adminWithdrawEvaluation(ta2, ev.id, "nope", at(1))).rejects.toThrow(/Admins only/);
    await expect(adminWithdrawEvaluation(admin, ev.id, "  ", at(1))).rejects.toThrow(/Say why/);

    await adminWithdrawEvaluation(admin, ev.id, "Totals look swapped with another student", at(1));
    expect(await statusOf(ev.id)).toMatchObject({ status: "DRAFT", releaseAt: null });
    const [notice] = await db.notification.findMany({ where: { userId: ta.id, type: "evaluation.withdrawn" } });
    expect(notice.body).toContain("Totals look swapped");
    expect(await db.auditLog.findFirst({ where: { action: "evaluation.withdraw", actorId: admin.id } })).toMatchObject({ after: { reason: "Totals look swapped with another student", by: "admin" } });
    // Admins stay read-only on course pages: the course-side withdraw refuses them.
    await submitEvaluations(ta, [ev.id], at(2));
    await expect(withdrawEvaluation(admin, ev.id, at(3))).rejects.toThrow();
  });

  it("an instructor added during the hold can finalize early, and the worker then releases nothing", async () => {
    const { ta, ann, course, assignment, ev } = await setup();
    await submitEvaluations(ta, [ev.id], T0);
    const prof = await makeUser("Prof Ivy");
    await enroll(course.id, [prof], "INSTRUCTOR");
    await reviewEvaluation(prof, ev.id, "finalize");
    expect(await statusOf(ev.id)).toMatchObject({ status: "FINALIZED", releaseAt: null, reviewedById: prof.id });
    expect(await releaseHeldMarks(at(25))).toBe(0);
    expect(await studentNotices(ann.id)).toHaveLength(1);
    await expect(reviewEvaluation(prof, ev.id, "finalize")).rejects.toThrow();
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 4 });
  });

  it("leaves courses with an instructor, and marks an instructor submits, as they were", async () => {
    const { ta, ann, course, assignment, ev } = await setup();
    const prof = await makeUser("Prof Ivy");
    await enroll(course.id, [prof], "INSTRUCTOR");
    expect((await submitEvaluations(ta, [ev.id], T0))[0]).toMatchObject({ status: "SUBMITTED", releaseAt: null });
    await reviewEvaluation(prof, ev.id, "return", "Check the second row");
    await saveEvaluation(ta, ev.id, { scores: ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: 3 })), totalMarks: null });
    expect((await submitEvaluations(prof, [ev.id], T0))[0]).toMatchObject({ status: "FINALIZED", releaseAt: null });
    expect(await getMyResult(ann, assignment.id)).toMatchObject({ totalMarks: 6 });
  });
});
