import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot, markAttendance } from "@/server/services/bookings";
import {
  getMarkingSheet,
  getOrCreateEvaluation,
  getStudentRecord,
  listAssignmentRoster,
  listReviewQueue,
  saveEvaluation,
  submitEvaluations,
} from "@/server/services/evaluations";
import { exportAssignmentCsv } from "@/server/services/reports";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

/** A course with two TAs, an instructor, an admin and one marked student (issue #36, ADR-031). */
async function setup() {
  const ta = await makeUser("Tara TA");
  const ta2 = await makeUser("Theo TA");
  const inst = await makeUser("Ines Instructor");
  const admin = await makeUser("Ada Admin", { isAdmin: true });
  const ann = await makeUser("Ann");
  const { course, assignment, slots } = await setupCourse(ta);
  await enroll(course.id, [ann]);
  await enroll(course.id, [ta2], "TA");
  await enroll(course.id, [inst], "INSTRUCTOR");
  const booking = await bookSlot(ann, slots[0].id);
  await markAttendance(ta, booking!.id, "COMPLETED", inHours(1, slots[0].startsAt));
  const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
  const scores = ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: 1 }));
  return { ta, ta2, inst, admin, ann, course, assignment, ev, scores };
}

const bodies = (notes: { body: string }[]) => notes.map((n) => n.body).sort();

describe("private notes (ADR-031)", () => {
  it("shows each note to its author and the enrolled instructors only, never to other TAs or admins", async () => {
    const { ta, ta2, inst, admin, ann, assignment, ev, scores } = await setup();
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null, privateNotes: "Tara's note" });
    await saveEvaluation(ta2, ev.id, { scores, totalMarks: null, privateNotes: "Theo's note" });

    const sheetNotes = async (who: typeof ta) => (await getMarkingSheet(who, assignment.id, { studentId: ann.id })).rows[0].evaluation!.notes;
    expect(bodies(await sheetNotes(ta))).toEqual(["Tara's note"]);
    expect(bodies(await sheetNotes(ta2))).toEqual(["Theo's note"]);
    expect(bodies(await sheetNotes(inst))).toEqual(["Tara's note", "Theo's note"]);
    expect(await sheetNotes(admin)).toEqual([]);

    expect((await sheetNotes(ta))[0]).toMatchObject({ mine: true, author: "Tara TA" });
    expect((await sheetNotes(inst)).every((n) => !n.mine)).toBe(true);

    const recordNotes = async (who: typeof ta) => (await getStudentRecord(who, assignment.id, ann.id)).notes;
    expect(bodies(await recordNotes(ta))).toEqual(["Tara's note"]);
    expect(bodies(await recordNotes(ta2))).toEqual(["Theo's note"]);
    expect(bodies(await recordNotes(inst))).toEqual(["Tara's note", "Theo's note"]);
    expect(await recordNotes(admin)).toEqual([]);

    // Nothing that returns a whole evaluation carries notes.
    for (const who of [ta, ta2, inst, admin]) {
      expect(JSON.stringify(await listAssignmentRoster(who, assignment.id))).not.toMatch(/'s note/);
      expect(JSON.stringify((await getStudentRecord(who, assignment.id, ann.id)).evaluation)).not.toMatch(/'s note/);
    }
    expect((await exportAssignmentCsv(inst, assignment.id)).csv).not.toMatch(/'s note/);
  });

  it("shows submitted notes in the review queue to the instructor, not to an admin", async () => {
    const { ta, inst, admin, course, ev, scores } = await setup();
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null, privateNotes: "Tara's note" });
    await submitEvaluations(ta, [ev.id]);

    const [forInstructor] = await listReviewQueue(inst, course.id);
    expect(bodies(forInstructor.notes)).toEqual(["Tara's note"]);
    const [forAdmin] = await listReviewQueue(admin, course.id);
    expect(forAdmin.notes).toEqual([]);
    expect(JSON.stringify(forAdmin)).not.toMatch(/'s note/);
  });

  it("changes only the saver's own note, so a colleague can't overwrite or wipe it", async () => {
    const { ta, ta2, inst, ann, assignment, ev, scores } = await setup();
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null, privateNotes: "Tara's note" });
    // Theo can't see Tara's note, so his sheet sends an empty box.
    await saveEvaluation(ta2, ev.id, { scores, totalMarks: null, privateNotes: "" });
    await saveEvaluation(ta2, ev.id, { scores, totalMarks: null, privateNotes: "Theo's note" });
    await saveEvaluation(ta2, ev.id, { scores, totalMarks: null, privateNotes: "Theo's note, edited" });
    // Leaving the field out keeps the note.
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null });

    const sheet = await getMarkingSheet(inst, assignment.id, { studentId: ann.id });
    expect(bodies(sheet.rows[0].evaluation!.notes)).toEqual(["Tara's note", "Theo's note, edited"]);

    // Clearing your own note removes only yours.
    await saveEvaluation(ta, ev.id, { scores, totalMarks: null, privateNotes: "" });
    expect(await db.evaluationNote.findMany({ where: { evaluationId: ev.id }, select: { authorId: true } })).toEqual([{ authorId: ta2.id }]);
  });

  it("keeps notes written before notes had an author for the instructors only", async () => {
    const { ta, ta2, inst, admin, ann, assignment, ev } = await setup();
    await db.evaluationNote.create({ data: { evaluationId: ev.id, authorId: null, body: "An earlier note" } });

    const sheetNotes = async (who: typeof ta) => (await getMarkingSheet(who, assignment.id, { studentId: ann.id })).rows[0].evaluation!.notes;
    expect(await sheetNotes(inst)).toEqual([expect.objectContaining({ body: "An earlier note", author: null, mine: false })]);
    for (const who of [ta, ta2, admin]) expect(await sheetNotes(who)).toEqual([]);
  });
});
