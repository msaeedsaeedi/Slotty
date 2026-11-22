import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot, markAttendance } from "@/server/services/bookings";
import { importRoster } from "@/server/services/courses";
import { getOrCreateEvaluation, saveEvaluation } from "@/server/services/evaluations";
import { exportAssignmentCsv } from "@/server/services/reports";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

async function markingSetup() {
  const ta = await makeUser("Tara TA");
  const ann = await makeUser("Ann");
  const { course, assignment, slots } = await setupCourse(ta);
  await enroll(course.id, [ann]);
  const booking = await bookSlot(ann, slots[0].id);
  await markAttendance(ta, booking!.id, "COMPLETED", inHours(1, slots[0].startsAt));
  const ev = await getOrCreateEvaluation(ta, assignment.id, ann.id);
  const [functionality, quality] = ev.assignment.criteria;
  return { ta, ann, course, assignment, ev, functionality, quality };
}

const writes = (evaluationId: string) => db.auditLog.findMany({ where: { action: "evaluation.write", entityId: evaluationId }, orderBy: { createdAt: "asc" } });

describe("audit coverage for marks", () => {
  it("records every change to a draft, with before and after, and nothing for a save that changes nothing", async () => {
    const { ta, ev, functionality, quality } = await markingSetup();
    const draft = { scores: [{ criterionId: functionality.id, points: 4 }], totalMarks: null, feedback: "Good start" };
    await saveEvaluation(ta, ev.id, draft);
    await saveEvaluation(ta, ev.id, draft); // autosave with nothing new
    await saveEvaluation(ta, ev.id, { ...draft, scores: [...draft.scores, { criterionId: quality.id, points: 3 }] });

    const rows = await writes(ev.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ actorId: ta.id, entityType: "Evaluation", before: { total: null, scores: {} }, after: { total: 4, feedback: "Good start" } });
    expect(rows[1]).toMatchObject({ before: { total: 4 }, after: { total: 7, scores: { [quality.id]: { points: 3 } } } });
  });

  it("records that private notes were edited, never their text", async () => {
    const { ta, ev, functionality } = await markingSetup();
    await saveEvaluation(ta, ev.id, { scores: [{ criterionId: functionality.id, points: 4 }], totalMarks: null, privateNotes: "Struggled with recursion" });
    await saveEvaluation(ta, ev.id, { scores: [{ criterionId: functionality.id, points: 4 }], totalMarks: null, privateNotes: "Struggled with recursion, then fixed it" });

    const rows = await writes(ev.id);
    expect(rows).toHaveLength(2);
    expect(rows[1].after).toMatchObject({ privateNotesEdited: true });
    expect(JSON.stringify(rows)).not.toContain("recursion");
  });
});

describe("audit coverage for exports and imports", () => {
  it("records who exported which assignment's marks", async () => {
    const { ta, assignment } = await markingSetup();
    await exportAssignmentCsv(ta, assignment.id);
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "report.export" } });
    expect(row).toMatchObject({ actorId: ta.id, entityType: "Assignment", entityId: assignment.id, after: { format: "csv", students: 1 } });
  });

  it("records each person added or changed by a roster import, by account id", async () => {
    const ta = await makeUser("Tara TA");
    const { course } = await setupCourse(ta);
    await importRoster(ta, course.id, "email,name,section\nnew.one@uni.edu,New One,A\nnew.two@uni.edu,New Two,");
    await importRoster(ta, course.id, "email,section\nnew.one@uni.edu,B\nnew.two@uni.edu,");

    const [first, second] = await db.auditLog.findMany({ where: { action: "roster.import" }, orderBy: { createdAt: "asc" } });
    const one = await db.user.findUniqueOrThrow({ where: { email: "new.one@uni.edu" } });
    const two = await db.user.findUniqueOrThrow({ where: { email: "new.two@uni.edu" } });
    expect(first.after).toMatchObject({
      enrolled: 2,
      changes: expect.arrayContaining([
        { userId: one.id, change: "added", role: "STUDENT", section: "A" },
        { userId: two.id, change: "added", role: "STUDENT", section: null },
      ]),
    });
    // Only the section change is listed; the unchanged person isn't.
    expect(second.after).toMatchObject({ updated: 1, unchanged: 1, changes: [{ userId: one.id, change: "updated", section: "B", previousSection: "A", previousRole: "STUDENT" }] });
    expect(JSON.stringify([first.after, second.after])).not.toContain("@uni.edu");
  });
});
