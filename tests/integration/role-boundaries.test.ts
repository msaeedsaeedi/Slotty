import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminAssignStaff, adminRemoveStaff } from "@/server/services/admin";
import { createAssignment } from "@/server/services/assignments";
import { bookSlot, markAttendance, setAllowance, staffPlaceStudent } from "@/server/services/bookings";
import {
  addMember,
  createVenue,
  importRoster,
  listCourseStaff,
  listMembers,
  previewRoster,
  removeMember,
  resendInvite,
  setCourseArchived,
  updateCourse,
} from "@/server/services/courses";
import {
  getMarkingSheet,
  getOrCreateEvaluation,
  listAssignmentRoster,
  listReviewQueue,
  markingSheetFocus,
  pendingReviewCount,
  saveDraft,
} from "@/server/services/evaluations";
import { createRequest, listRequests, openRequestCount, resolveRequest } from "@/server/services/requests";
import { addAvailability, cancelSlot } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

/** A course with an instructor (Lead), a TA (Tara) and a student (Sam) who has booked the first slot. */
async function staffedCourse() {
  const admin = await makeUser("Ada Admin", { isAdmin: true });
  const ta = await makeUser("Tara TA");
  const lead = await makeUser("Lead");
  const sam = await makeUser("Sam Student");
  const setup = await setupCourse(ta);
  await adminAssignStaff(admin, setup.course.id, { email: lead.email, role: "INSTRUCTOR" });
  await enroll(setup.course.id, [sam]);
  const booking = await bookSlot(sam, setup.slots[0].id);
  return { admin, ta, lead, sam, booking, ...setup };
}

describe("admins read courses but never change them", () => {
  it("lets an admin open the roster, slots, marks and review queue", async () => {
    const { admin, course, assignment } = await staffedCourse();
    expect((await listMembers(admin, course.id)).length).toBe(3);
    expect((await listAssignmentRoster(admin, assignment.id)).length).toBe(1);
    await expect(getMarkingSheet(admin, assignment.id, { scope: "everyone" })).resolves.toBeTruthy();
    await expect(listReviewQueue(admin, course.id)).resolves.toEqual([]);
    await expect(listRequests(admin, course.id)).resolves.toEqual([]);
    expect(await pendingReviewCount(admin, course.id)).toBe(0);
  });

  it("refuses every kind of change from inside a course", async () => {
    const { admin, sam, course, assignment, venue, slots, booking } = await staffedCourse();
    const request = await createRequest(sam, assignment.id, { kind: "BOOKING_CHANGE", message: "Can I move?" });
    const refusals = [
      updateCourse(admin, course.id, { code: "CS101", title: "Renamed", term: "T", timezone: "UTC" }),
      setCourseArchived(admin, course.id, true),
      createVenue(admin, course.id, { name: "Lab 2" }),
      addMember(admin, course.id, { email: "new@test.edu", name: "New", role: "STUDENT" }),
      importRoster(admin, course.id, "email,name\nnew@test.edu,New"),
      removeMember(admin, course.id, sam.id),
      resendInvite(admin, course.id, sam.id),
      createAssignment(admin, course.id, {
        title: "Another",
        description: "",
        maxMarks: 10,
        criteria: [],
        policy: { windowStart: inHours(24), windowEnd: inHours(48), slotDurationMin: 15, bufferMin: 0, capacityPerSlot: 1, bookingOpensAt: null, freezeHours: 12, maxReschedules: 1, allowStudentCancel: true },
      }),
      addAvailability(admin, assignment.id, { taId: admin.id, venueId: venue.id, startsAt: inHours(72), endsAt: inHours(73) }),
      cancelSlot(admin, slots[1].id, "Sick"),
      markAttendance(admin, booking.id, "NO_SHOW"),
      staffPlaceStudent(admin, { assignmentId: assignment.id, studentId: sam.id, slotId: slots[1].id }),
      setAllowance(admin, assignment.id, sam.id, { extraChanges: 1, lateBooking: false }),
      resolveRequest(admin, request.id, "DECLINED", "No"),
      saveDraft(admin, assignment.id, sam.id, { scores: [], totalMarks: 5, feedback: "x" }),
      getOrCreateEvaluation(admin, assignment.id, sam.id),
    ];
    for (const r of await Promise.allSettled(refusals)) {
      expect(r.status).toBe("rejected");
      expect((r as PromiseRejectedResult).reason.message).toMatch(/read-only/);
    }
    expect(await db.evaluation.count()).toBe(0);
    expect(await db.enrollment.count({ where: { courseId: course.id } })).toBe(3);
  });
});

describe("only instructors manage TAs", () => {
  it("lets a TA add students but not add, promote or remove TAs", async () => {
    const { admin, ta, lead, sam, course } = await staffedCourse();
    const other = await makeUser("Other TA");
    await adminAssignStaff(admin, course.id, { email: other.email, role: "TA" });

    expect((await addMember(ta, course.id, { email: "ann@test.edu", name: "Ann", role: "STUDENT" })).enrolled).toBe(1);
    await expect(addMember(ta, course.id, { email: "new.ta@test.edu", name: "New", role: "TA" })).rejects.toThrow(/Only the course instructor/);
    await expect(importRoster(ta, course.id, "email,name,role\nann2@test.edu,Ann,student\nnew.ta@test.edu,New,ta")).rejects.toThrow(/Only the course instructor/);
    await expect(removeMember(ta, course.id, other.id)).rejects.toThrow(/Only the course instructor/);
    // Re-importing a co-TA unchanged is not a change, so the class list still goes in.
    expect((await importRoster(ta, course.id, `email,name,role\nbea@test.edu,Bea,student\n${other.email},Other,ta`)).enrolled).toBe(1);

    expect((await addMember(lead, course.id, { email: "new.ta@test.edu", name: "New", role: "TA" })).enrolled).toBe(1);
    await removeMember(lead, course.id, other.id);
    expect(await db.enrollment.findUnique({ where: { courseId_userId: { courseId: course.id, userId: other.id } } })).toBeNull();
    expect(await db.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: sam.id } } })).toMatchObject({ role: "STUDENT" });
  });

  it("leaves co-TAs of a course without an instructor to an admin, from the console", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const co = await makeUser("Co TA");
    const { course } = await setupCourse(ta);
    await expect(addMember(ta, course.id, { email: co.email, role: "TA" })).rejects.toThrow(/Only a Slotty admin can add, change or remove TAs/);

    await adminAssignStaff(admin, course.id, { email: co.email, role: "TA" });
    await expect(removeMember(ta, course.id, co.id)).rejects.toThrow(/Only a Slotty admin/);
    // Tara hosts upcoming slots, so she has to hand them over first.
    await expect(adminRemoveStaff(admin, course.id, ta.id)).rejects.toThrow(/hosts 4 upcoming slots/);
    expect(await adminRemoveStaff(admin, course.id, co.id)).toMatchObject({ name: "Co TA" });
    expect(await db.auditLog.count({ where: { action: "enrollment.remove", actorId: admin.id } })).toBe(1);
  });

  it("removes only staff from the console, and only for admins", async () => {
    const { admin, ta, sam, course } = await staffedCourse();
    await expect(adminRemoveStaff(admin, course.id, sam.id)).rejects.toThrow(/Staff member not found/);
    await expect(adminRemoveStaff(ta, course.id, sam.id)).rejects.toThrow(/Admins only/);
  });
});

describe("nobody moves between student and staff in one course", () => {
  it("refuses promoting a student or demoting staff, even by the instructor or an admin", async () => {
    const { admin, ta, lead, sam, course } = await staffedCourse();
    await expect(addMember(lead, course.id, { email: sam.email, role: "TA" })).rejects.toThrow(/students can't become staff/);
    const r = await importRoster(lead, course.id, `email,role\n${sam.email},ta\nann@test.edu,student`);
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, message: expect.stringMatching(/students can't become staff/) })]);
    await expect(addMember(lead, course.id, { email: ta.email, role: "STUDENT" })).rejects.toThrow(/staff can't become students/);
    await expect(adminAssignStaff(admin, course.id, { email: sam.email, role: "TA" })).rejects.toThrow(/students can't become staff/);
    expect((await db.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: sam.id } } })).role).toBe("STUDENT");
  });

  it("remembers what someone did in the course after they're removed", async () => {
    const { admin, lead, sam, course } = await staffedCourse();
    await removeMember(lead, course.id, sam.id);
    await expect(addMember(lead, course.id, { email: sam.email, role: "TA" })).rejects.toThrow(/was a student in this course/);
    await expect(adminAssignStaff(admin, course.id, { email: sam.email, role: "TA" })).rejects.toThrow(/was a student in this course/);
    // Coming back as a student is fine.
    expect((await addMember(lead, course.id, { email: sam.email, role: "STUDENT" })).enrolled).toBe(1);
  });

  it("still lets someone with no history here join as staff", async () => {
    const { lead, course } = await staffedCourse();
    const fresh = await makeUser("Fresh");
    expect((await addMember(lead, course.id, { email: fresh.email, role: "TA" })).enrolled).toBe(1);
  });
});

describe("access is checked before anything is read", () => {
  it("tells outsiders nothing about the people in an import", async () => {
    const { admin, course } = await staffedCourse();
    const outsider = await makeUser("Outsider");
    const csv = `email,role\n${admin.email},student`;
    await expect(importRoster(outsider, course.id, csv)).rejects.toThrow(/^Course not found/);
    await expect(previewRoster(outsider, course.id, csv)).rejects.toThrow(/^Course not found/);
  });

  it("keeps staff-only counts and lists from students", async () => {
    const { sam, course, assignment, booking } = await staffedCourse();
    await expect(listCourseStaff(sam, course.id)).rejects.toThrow(/permission/);
    await expect(openRequestCount(sam, course.id)).rejects.toThrow(/permission/);
    await expect(pendingReviewCount(sam, course.id)).rejects.toThrow(/permission/);
    await expect(markingSheetFocus(sam, assignment.id, booking.id)).rejects.toThrow(/permission/);
  });

  it("only focuses the marking sheet on a booking from the same assignment", async () => {
    const { ta, lead, course, assignment, booking } = await staffedCourse();
    expect(await markingSheetFocus(ta, assignment.id, booking.id)).toMatchObject({ hostedByMe: true });
    expect(await markingSheetFocus(lead, assignment.id, booking.id)).toMatchObject({ hostedByMe: false });
    const other = await createAssignment(lead, course.id, {
      title: "Other",
      description: "",
      maxMarks: 10,
      criteria: [],
      policy: { windowStart: inHours(24), windowEnd: inHours(48), slotDurationMin: 15, bufferMin: 0, capacityPerSlot: 1, bookingOpensAt: null, freezeHours: 12, maxReschedules: 1, allowStudentCancel: true },
    });
    expect(await markingSheetFocus(ta, other.id, booking.id)).toBeNull();
  });
});
