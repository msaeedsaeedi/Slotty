import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminAssignStaff, adminCreateCourse, adminSetAdmin } from "@/server/services/admin";
import { bookSlot, markAttendance } from "@/server/services/bookings";
import { addMember, createCourse, importRoster } from "@/server/services/courses";
import { getMarkingSheet, saveDraft } from "@/server/services/evaluations";
import { getHome } from "@/server/services/home";
import { addAvailability } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

describe("admins are only admins", () => {
  it("never become course members, but can create a course and hand it over", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const { course } = await setupCourse(ta);

    await expect(createCourse(admin, { code: "X1", title: "X", term: "T", timezone: "Asia/Karachi", myRole: "TA" })).rejects.toThrow(/admin console/);
    await expect(adminAssignStaff(admin, course.id, { email: admin.email, role: "TA" })).rejects.toThrow(/is an admin/);

    const r = await importRoster(ta, course.id, `email,role\n${admin.email},ta\nnew@test.edu,student`);
    expect(r.enrolled).toBe(1);
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, message: expect.stringMatching(/admin/) })]);
    expect(await db.enrollment.count({ where: { userId: admin.id } })).toBe(0);

    await expect(adminSetAdmin(admin, ta.id, true)).rejects.toThrow(/CS101/);

    const made = await adminCreateCourse(admin, {
      code: "MATH 210",
      title: "Linear Algebra",
      term: "Fall",
      timezone: "Asia/Karachi",
      staff: { email: "prof@test.edu", name: "Prof New", role: "INSTRUCTOR" },
    });
    expect(made.invited).toBe(true);
    const members = await db.enrollment.findMany({ where: { courseId: made.course.id }, include: { user: true } });
    expect(members.map((m) => [m.user.email, m.role])).toEqual([["prof@test.edu", "INSTRUCTOR"]]);
  });
});

describe("adding slots", () => {
  it("lets TAs schedule only themselves, and skips times the host already has", async () => {
    const ta = await makeUser("Tara TA");
    const other = await makeUser("Omar TA");
    const prof = await makeUser("Prof");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [other], "TA");
    await enroll(course.id, [prof], "INSTRUCTOR");
    const start = slots[0].startsAt;

    await expect(addAvailability(ta, assignment.id, { taId: other.id, venueId: null, startsAt: start, endsAt: inHours(1, start) })).rejects.toThrow(/for themselves/);
    // Instructors schedule anyone.
    expect((await addAvailability(prof, assignment.id, { taId: other.id, venueId: null, startsAt: start, endsAt: inHours(0.5, start) })).slots).toBe(2);

    // The same hour again plus the next one: the four taken slots are skipped, four new ones added, across two days.
    const nextDay = inHours(24, start);
    const r = await addAvailability(ta, assignment.id, {
      taId: ta.id,
      venueId: null,
      blocks: [
        { startsAt: start, endsAt: inHours(2, start) },
        { startsAt: nextDay, endsAt: inHours(1, nextDay) },
      ],
    });
    expect(r).toMatchObject({ slots: 8, skipped: 4, status: "PUBLISHED" });
    await expect(addAvailability(ta, assignment.id, { taId: ta.id, venueId: null, startsAt: start, endsAt: inHours(1, start) })).rejects.toThrow(/already has slots/);
  });
});

describe("marking sheet", () => {
  it("autosaves drafts, records attendance from the first score, and lists what's left to mark", async () => {
    const ta = await makeUser("Tara TA");
    const [ann, bob] = await Promise.all([makeUser("Ann"), makeUser("Bob")]);
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann, bob]);
    await bookSlot(ann, slots[0].id);
    const criteria = await db.rubricCriterion.findMany({ where: { assignmentId: assignment.id }, orderBy: { order: "asc" } });
    const during = inHours(0.1, slots[0].startsAt);

    const saved = await saveDraft(ta, assignment.id, ann.id, { scores: [{ criterionId: criteria[0].id, points: 5 }], totalMarks: null }, during);
    expect(saved).toMatchObject({ status: "DRAFT", totalMarks: 5, bookingStatus: "COMPLETED" });
    await expect(saveDraft(ta, assignment.id, ann.id, { scores: [{ criterionId: criteria[0].id, points: 99 }], totalMarks: null }, during)).rejects.toThrow(/between 0 and 6/);

    const day = slots[0].startsAt.toISOString().slice(0, 10);
    const sheet = await getMarkingSheet(ta, assignment.id, { day });
    expect(sheet.rows.map((r) => [r.student.name, r.booking?.status, r.evaluation?.totalMarks])).toEqual([["Ann", "COMPLETED", 5]]);
    expect((await getMarkingSheet(ta, assignment.id, { todo: true })).rows.map((r) => r.student.name)).toEqual(["Ann"]);
  });

  it("needs a reason to mark a student who never booked, and records it", async () => {
    const ta = await makeUser("Tara TA");
    const bob = await makeUser("Bob");
    const { course, assignment } = await setupCourse(ta);
    await enroll(course.id, [bob]);

    await expect(saveDraft(ta, assignment.id, bob.id, { scores: [], totalMarks: null })).rejects.toThrow(/no demo booking/);
    const r = await saveDraft(ta, assignment.id, bob.id, { scores: [], totalMarks: null, noBookingReason: "Demoed in class on Monday" });
    const ev = await db.evaluation.findUniqueOrThrow({ where: { id: r.evaluationId } });
    expect(ev.noBookingReason).toBe("Demoed in class on Monday");
    expect(await db.auditLog.count({ where: { action: "evaluation.no_booking", entityId: ev.id } })).toBe(1);
    const sheet = await getMarkingSheet(ta, assignment.id, { studentId: bob.id });
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].booking).toBeNull();
  });

  it("won't mark a no-show until the no-show is undone", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const booking = await bookSlot(ann, slots[0].id);
    const during = inHours(0.1, slots[0].startsAt);
    await markAttendance(ta, booking.id, "NO_SHOW", during);
    await expect(saveDraft(ta, assignment.id, ann.id, { scores: [], totalMarks: null }, during)).rejects.toThrow(/no-show/);
  });
});

describe("home", () => {
  it("splits teaching and studying tasks for someone who does both", async () => {
    const ta = await makeUser("Tara TA");
    const sam = await makeUser("Sam Both");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [sam]);
    // Sam teaches another course, where a past demo still needs attendance.
    const other = await setupCourse(sam);
    const kid = await makeUser("Kid");
    await enroll(other.course.id, [kid]);
    await bookSlot(kid, other.slots[0].id);

    const home = await getHome(sam, inHours(1, other.slots[0].endsAt));
    expect(home.teaching?.tasks.map((t) => t.key)).toContain("attendance");
    expect(home.studying?.tasks.map((t) => t.title)).toEqual([expect.stringMatching(/Book your demo/)]);
    expect(home.studying?.courses.map((c) => c.id)).toEqual([course.id]);

    const onlyStudent = await getHome(kid, inHours(-1, slots[0].startsAt));
    expect(onlyStudent.teaching).toBeNull();
    expect(onlyStudent.studying?.upcoming).toHaveLength(1);
  });
});

describe("adding one person", () => {
  it("invites new people, needs a name for them, and refuses duplicates", async () => {
    const ta = await makeUser("Tara TA");
    const { course } = await setupCourse(ta);
    await expect(addMember(ta, course.id, { email: "new@test.edu", role: "STUDENT" })).rejects.toThrow(/name/);
    expect(await addMember(ta, course.id, { email: "New@Test.edu", name: "Nia", role: "TA" })).toMatchObject({ invited: 1, name: "Nia" });
    await expect(addMember(ta, course.id, { email: "new@test.edu", role: "TA" })).rejects.toThrow(/already/);
    await expect(addMember(ta, course.id, { email: "boss@test.edu", name: "Boss", role: "INSTRUCTOR" })).rejects.toThrow(/Only instructors/);
  });
});
