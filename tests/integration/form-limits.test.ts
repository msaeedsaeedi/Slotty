import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { REASON_MAX_LENGTH } from "@/domain/text";
import { createAssignment, updateAssignment } from "@/server/services/assignments";
import { bookSlot, staffCancelBooking } from "@/server/services/bookings";
import { createCourse } from "@/server/services/courses";
import { getOrCreateEvaluation, saveEvaluation, submitEvaluations, unlockEvaluation } from "@/server/services/evaluations";
import { createRequest, resolveRequest } from "@/server/services/requests";
import { addAvailability, cancelSlot } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

const policy = (windowStart: Date, windowEnd: Date) => ({
  windowStart,
  windowEnd,
  slotDurationMin: 15,
  bufferMin: 0,
  capacityPerSlot: 1,
  bookingOpensAt: null,
  freezeHours: 0,
  maxReschedules: 1,
  allowStudentCancel: true,
});
const tooLong = "x".repeat(REASON_MAX_LENGTH + 1);

describe("issue #13: the server refuses what forms no longer allow", () => {
  it("refuses to create an assignment whose demo window is already over, but edits keep working", async () => {
    const ta = await makeUser("Tara");
    const course = await createCourse(ta, { code: "X", title: "X", term: "T", timezone: "UTC" });
    await expect(
      createAssignment(ta, course.id, { title: "Old", description: "", maxMarks: 10, criteria: [], policy: policy(inHours(-72), inHours(-48)) }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/already ended/), field: "windowEnd" });

    // A running assignment can still be edited after its window ends (e.g. to fix a typo).
    const a = await createAssignment(ta, course.id, { title: "Now", description: "", maxMarks: 10, criteria: [], policy: policy(inHours(-1), inHours(1)) });
    await expect(
      updateAssignment(ta, a.id, { title: "Now (fixed)", description: "", maxMarks: 10, criteria: [], policy: policy(inHours(-72), inHours(-48)) }),
    ).resolves.toBeTruthy();
  });

  it("refuses availability that has already started, today's earlier hours included", async () => {
    const ta = await makeUser("Tara");
    const course = await createCourse(ta, { code: "X", title: "X", term: "T", timezone: "UTC" });
    const a = await createAssignment(ta, course.id, { title: "Now", description: "", maxMarks: 10, criteria: [], policy: policy(inHours(-72), inHours(72)) });
    await expect(addAvailability(ta, a.id, { taId: ta.id, venueId: null, startsAt: inHours(-5), endsAt: inHours(-3) })).rejects.toMatchObject({
      message: expect.stringMatching(/already started/),
      field: "startTime",
    });
    await expect(addAvailability(ta, a.id, { taId: ta.id, venueId: null, startsAt: inHours(-1), endsAt: inHours(2) })).rejects.toThrow(/already started/);
    expect(await db.slot.count({ where: { assignmentId: a.id } })).toBe(0);
    await expect(addAvailability(ta, a.id, { taId: ta.id, venueId: null, startsAt: inHours(1), endsAt: inHours(2) })).resolves.toMatchObject({ slots: 4 });
  });

  it(`refuses reasons and comments longer than ${REASON_MAX_LENGTH} characters`, async () => {
    const ta = await makeUser("Tara");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta, { freezeHours: 0 });
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);

    await expect(staffCancelBooking(ta, b!.id, tooLong)).rejects.toMatchObject({ field: "reason" });
    await expect(cancelSlot(ta, slots[1].id, tooLong)).rejects.toThrow(/1000 characters/);

    const request = await createRequest(ann, assignment.id, { kind: "BOOKING_CHANGE", message: "Can I move to Friday please?" });
    await expect(createRequest(ann, assignment.id, { kind: "MARK_QUERY", message: tooLong })).rejects.toThrow();
    await expect(resolveRequest(ta, request.id, "DECLINED", tooLong)).rejects.toMatchObject({ field: "response" });
    await expect(resolveRequest(ta, request.id, "DECLINED", "  ")).rejects.toThrow(/Tell the student why/);

    const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
    const [f, q] = ev.assignment.criteria;
    await saveEvaluation(ta, ev.id, { scores: [{ criterionId: f.id, points: 5 }, { criterionId: q.id, points: 3 }], totalMarks: null });
    await submitEvaluations(ta, [ev.id]);
    await expect(unlockEvaluation(ta, ev.id, tooLong)).rejects.toMatchObject({ field: "reason" });
    // Nothing was sent: the student has no cancellation or reply carrying the long text.
    expect(await db.notification.count({ where: { userId: ann.id, body: { contains: tooLong } } })).toBe(0);
  });

  it("refuses marks with more than two decimals", async () => {
    const ta = await makeUser("Tara");
    const ann = await makeUser("Ann");
    const { course, assignment } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
    const [f, q] = ev.assignment.criteria;
    await expect(
      saveEvaluation(ta, ev.id, { scores: [{ criterionId: f.id, points: 5.123456 }, { criterionId: q.id, points: 3 }], totalMarks: null }),
    ).rejects.toThrow(/2 decimals/);
    await expect(saveEvaluation(ta, ev.id, { scores: [{ criterionId: f.id, points: 5.25 }, { criterionId: q.id, points: 3.5 }], totalMarks: null })).resolves.toBeTruthy();
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).totalMarks).toBe(8.75);

    // Without a rubric, the single total follows the same rule.
    const course2 = await createCourse(ta, { code: "Y", title: "Y", term: "T", timezone: "UTC" });
    await enroll(course2.id, [ann]);
    const plain = await createAssignment(ta, course2.id, { title: "Viva", description: "", maxMarks: 10, criteria: [], policy: policy(inHours(1), inHours(48)) });
    const ev2 = await getOrCreateEvaluation(ta, plain.id, ann.id);
    await expect(saveEvaluation(ta, ev2.id, { scores: [], totalMarks: 7.555 })).rejects.toMatchObject({ field: "total" });
    await expect(saveEvaluation(ta, ev2.id, { scores: [], totalMarks: 7.55 })).resolves.toBeTruthy();
  });
});
