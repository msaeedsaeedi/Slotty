import { z } from "zod";
import type { CourseRole } from "@/generated/prisma/client";
import { assertRule, DomainError } from "@/domain/result";
import { parseRoster, type RosterError, type RosterRow } from "@/domain/csv-roster";
import { canChangeCourseData, canCreateCourse, canManageInstructors, canManageTAs, canTakeRole } from "@/domain/roles";
import { venueInput } from "@/lib/form-schemas";
import { fmtRange, isValidTimezone } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertCanJoinCourses, assertCourseManager, assertCourseRole, assertStaff, courseHasInstructor, courseRoleOf, type Actor } from "./access";
import { audit } from "./audit";
import { issueInvite } from "./accounts";
import { notify } from "./notify";

export const courseInput = z.object({
  code: z.string().trim().min(1, "Course code is required.").max(40),
  title: z.string().trim().min(1, "Title is required.").max(200),
  term: z.string().trim().min(1, "Term is required.").max(60),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone."),
});

/** May the actor create a course for themselves (as its TA)? */
export async function canCreateCourseFor(actor: Actor) {
  const roles = await db.enrollment.findMany({ where: { userId: actor.id }, select: { role: true }, distinct: ["role"] });
  return canCreateCourse(actor, roles.map((r) => r.role));
}

/**
 * Self-service course creation. The creator joins as its TA: only admins name
 * instructors (from the console), and students can't create courses.
 */
export async function createCourse(actor: Actor, input: z.input<typeof courseInput>) {
  const data = courseInput.parse(input);
  return db.$transaction(async (tx) => {
    const roles = await tx.enrollment.findMany({ where: { userId: actor.id }, select: { role: true }, distinct: ["role"] });
    assertRule(canCreateCourse(actor, roles.map((r) => r.role)), "FORBIDDEN");
    const course = await tx.course.create({ data: { ...data, createdById: actor.id } });
    await tx.enrollment.create({ data: { courseId: course.id, userId: actor.id, role: "TA" } });
    await audit(tx, actor, { action: "course.create", entityType: "Course", entityId: course.id, after: data });
    return course;
  });
}

export async function updateCourse(actor: Actor, courseId: string, input: z.input<typeof courseInput>) {
  const data = courseInput.parse(input);
  return db.$transaction(async (tx) => {
    await assertCourseManager(tx, actor, courseId, { write: true });
    const before = await tx.course.findUniqueOrThrow({ where: { id: courseId } });
    const course = await tx.course.update({ where: { id: courseId }, data });
    await audit(tx, actor, { action: "course.update", entityType: "Course", entityId: courseId, before, after: data });
    return course;
  });
}

export async function setCourseArchived(actor: Actor, courseId: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    // Not `write: true`: restoring an archived course must stay possible.
    await assertCourseManager(tx, actor, courseId);
    assertRule(canChangeCourseData(actor), "FORBIDDEN");
    await tx.course.update({ where: { id: courseId }, data: { archived } });
    await audit(tx, actor, { action: archived ? "course.archive" : "course.unarchive", entityType: "Course", entityId: courseId });
  });
}

export async function listMyCourses(actor: Actor) {
  const enrollments = await db.enrollment.findMany({
    where: { userId: actor.id },
    include: { course: { include: { _count: { select: { enrollments: { where: { role: "STUDENT" } } } } } } },
    orderBy: { course: { createdAt: "desc" } },
  });
  return enrollments.map((e) => ({ ...e.course, role: e.role, studentCount: e.course._count.enrollments }));
}

/** Which kinds of course roles the user holds, for navigation (admin rights don't count). */
export async function myRoleKinds(actor: Actor) {
  const roles = await db.enrollment.findMany({ where: { userId: actor.id, course: { archived: false } }, select: { role: true }, distinct: ["role"] });
  const hasBookings = roles.some((r) => r.role === "STUDENT") || (await db.booking.count({ where: { studentId: actor.id }, take: 1 })) > 0;
  // Instructors usually review rather than take demos: "Demo day" is for TAs and anyone hosting slots.
  const hosts =
    roles.some((r) => r.role === "TA") ||
    (roles.some((r) => r.role === "INSTRUCTOR") && (await db.slot.count({ where: { taId: actor.id, status: { not: "CANCELLED" }, endsAt: { gt: new Date() } }, take: 1 })) > 0);
  return { staff: roles.some((r) => r.role !== "STUDENT"), student: hasBookings, hosts };
}

/** Course + the actor's role in it; throws NOT_FOUND when the actor has no access. */
export async function getCourseForActor(actor: Actor, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new DomainError("Course not found.", "NOT_FOUND");
  const role = await courseRoleOf(db, actor, courseId);
  if (!role) throw new DomainError("Course not found.", "NOT_FOUND");
  return { course, role };
}

export async function listMembers(actor: Actor, courseId: string) {
  await assertStaff(db, actor, courseId);
  return db.enrollment.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });
}

export async function listCourseStaff(actor: Actor, courseId: string) {
  await assertStaff(db, actor, courseId);
  return db.enrollment.findMany({
    where: { courseId, role: { in: ["TA", "INSTRUCTOR"] } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

// ─── Roster import ────────────────────────────────────────────────────────────

export interface RosterPreviewRow extends RosterRow {
  status: "new-user" | "new-enrollment" | "role-change" | "unchanged";
  currentRole?: CourseRole;
}

/** A person's roles in their other courses, for `canTakeRole`. */
export async function rolesElsewhere(tx: Tx, userId: string, courseId: string) {
  const rows = await tx.enrollment.findMany({ where: { userId, courseId: { not: courseId } }, select: { role: true, course: { select: { code: true } } } });
  return rows.map((r) => ({ role: r.role, course: r.course.code }));
}

/**
 * What each user (not currently enrolled) once did in this course: "student"
 * if they booked or were marked, "staff" if they hosted or marked demos. Used
 * by `canTakeRole` so removing and re-adding someone can't switch them
 * between student and staff.
 */
export async function pastRolesHere(tx: Tx, userIds: string[], courseId: string) {
  const past = new Map<string, "student" | "staff">();
  if (userIds.length === 0) return past;
  const inCourse = { assignment: { courseId } };
  const booked = await tx.booking.findMany({ where: { studentId: { in: userIds }, ...inCourse }, select: { studentId: true }, distinct: ["studentId"] });
  const marked = await tx.evaluation.findMany({ where: { studentId: { in: userIds }, ...inCourse }, select: { studentId: true }, distinct: ["studentId"] });
  const hosted = await tx.slot.findMany({ where: { taId: { in: userIds }, ...inCourse }, select: { taId: true }, distinct: ["taId"] });
  const marker = await tx.evaluation.findMany({ where: { evaluatorId: { in: userIds }, ...inCourse }, select: { evaluatorId: true }, distinct: ["evaluatorId"] });
  for (const r of hosted) past.set(r.taId, "staff");
  for (const r of marker) past.set(r.evaluatorId, "staff");
  for (const r of [...booked, ...marked]) past.set(r.studentId, "student");
  return past;
}

/**
 * Rows that can't be added become skipped lines: admins (never course members)
 * and people whose role would clash with their role here or in another course.
 * Only call it after the actor's access is checked: the reasons name other
 * courses.
 */
async function screenRows(tx: Tx, courseId: string, parsed: { rows: RosterRow[]; errors: RosterError[] }) {
  const users = await tx.user.findMany({
    where: { email: { in: parsed.rows.map((r) => r.email) } },
    select: { id: true, email: true, isAdmin: true, platformAccess: true, enrollments: { select: { courseId: true, role: true, course: { select: { code: true } } } } },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const past = await pastRolesHere(
    tx,
    users.filter((u) => !u.enrollments.some((e) => e.courseId === courseId)).map((u) => u.id),
    courseId,
  );
  const rows: RosterRow[] = [];
  const errors = [...parsed.errors];
  for (const r of parsed.rows) {
    const u = byEmail.get(r.email);
    if (u?.isAdmin) {
      errors.push({ line: r.line, message: `${r.email} is a Uniflow admin, so can't be added to a course.` });
      continue;
    }
    if (u?.platformAccess) {
      errors.push({ line: r.line, message: `${r.email} can't be added to a course.` });
      continue;
    }
    const enrollments = u?.enrollments ?? [];
    const here = enrollments.find((e) => e.courseId === courseId)?.role;
    const fits = canTakeRole(
      r.role,
      enrollments.filter((e) => e.courseId !== courseId).map((e) => ({ role: e.role, course: e.course.code })),
      here,
      u ? past.get(u.id) : null,
    );
    if (!fits.ok) {
      errors.push({ line: r.line, message: `${r.email} ${fits.reason}` });
      continue;
    }
    rows.push(r);
  }
  return { rows, errors: errors.sort((a, b) => a.line - b.line) };
}

export async function previewRoster(actor: Actor, courseId: string, csv: string) {
  await assertStaff(db, actor, courseId);
  const { rows, errors } = await screenRows(db, courseId, parseRoster(csv));
  const users = await db.user.findMany({
    where: { email: { in: rows.map((r) => r.email) } },
    include: { enrollments: { where: { courseId } } },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const preview: RosterPreviewRow[] = rows.map((row) => {
    const user = byEmail.get(row.email);
    if (!user) return { ...row, status: "new-user" };
    const enrollment = user.enrollments[0];
    if (!enrollment) return { ...row, status: "new-enrollment" };
    const section = row.section ?? enrollment.section;
    if (enrollment.role !== row.role) return { ...row, section, status: "role-change", currentRole: enrollment.role };
    return { ...row, section, status: section === enrollment.section ? "unchanged" : "role-change", currentRole: enrollment.role };
  });
  return { rows: preview, errors };
}

/**
 * Add everyone in the CSV to the course by email. Unknown emails become invited
 * accounts and receive a set-password link; existing users are notified.
 */
export async function importRoster(actor: Actor, courseId: string, csv: string) {
  return importRows(actor, courseId, parseRoster(csv));
}

const memberInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["STUDENT", "TA", "INSTRUCTOR"]),
  section: z.string().trim().max(40).optional().transform((v) => v || null),
});

/** Add one person by email (the quick alternative to a CSV). */
export async function addMember(actor: Actor, courseId: string, input: z.input<typeof memberInput>) {
  const data = memberInput.parse(input);
  const existing = await db.user.findUnique({
    where: { email: data.email },
    select: { name: true, enrollments: { where: { courseId }, select: { role: true, section: true } } },
  });
  const before = existing?.enrollments[0];
  const name = data.name || existing?.name;
  if (!name) throw new DomainError("This email has no Uniflow account yet. Add their name so we can invite them.");
  const r = await importRows(actor, courseId, { rows: [{ line: 1, email: data.email, name, role: data.role, section: data.section }], errors: [] });
  if (r.errors.length) throw new DomainError(r.errors[0].message);
  if (r.unchanged) throw new DomainError(`${name} is already in this course as ${data.role === "TA" ? "a TA" : data.role.toLowerCase()}.`);
  const roleChanged = Boolean(before && before.role !== data.role);
  return { ...r, name, roleChanged };
}

async function importRows(actor: Actor, courseId: string, parsed: { rows: RosterRow[]; errors: RosterError[] }) {
  return db.$transaction(
    async (tx) => {
      // Access first: the screening below names people's other courses.
      const role = await assertStaff(tx, actor, courseId, { write: true });
      const { rows, errors } = await screenRows(tx, courseId, parsed);
      if (rows.length === 0) throw new DomainError(errors[0]?.message ?? "The list has no valid rows.");
      // Rows that add or change staff: only admins name instructors (from the
      // console), and only instructors add, promote or demote TAs.
      const current = new Map(
        (
          await tx.enrollment.findMany({
            where: { courseId, user: { email: { in: rows.map((r) => r.email) } } },
            select: { role: true, user: { select: { email: true } } },
          })
        ).map((e) => [e.user.email, e.role]),
      );
      const changes = rows.filter((r) => current.get(r.email) !== r.role).map((r) => [r.role, current.get(r.email)]);
      if (changes.some((c) => c.includes("INSTRUCTOR"))) assertRule(canManageInstructors(actor), "FORBIDDEN");
      if (changes.some((c) => c.includes("TA"))) assertRule(canManageTAs(role, role === "INSTRUCTOR" || (await courseHasInstructor(tx, courseId))), "FORBIDDEN");
      const course = await tx.course.findUniqueOrThrow({ where: { id: courseId } });
      const summary = { invited: 0, enrolled: 0, updated: 0, unchanged: 0 };
      // Per person, by account id: who was added or had their role or section changed.
      const changed: { userId: string; change: "added" | "updated"; role: string; section: string | null; previousRole?: string; previousSection?: string | null }[] = [];
      // Students joining after demos opened are told what they still need to book.
      const open = await tx.assignment.findMany({ where: { courseId, status: "PUBLISHED" }, select: { title: true }, orderBy: { createdAt: "asc" } });
      const openNote = open.length
        ? `\n\n${open.length === 1 ? "A demo is" : `${open.length} demos are`} open for booking: ${open.map((a) => a.title).join(", ")}.`
        : "";

      for (const row of rows) {
        let user = await tx.user.findUnique({ where: { email: row.email } });
        const isNew = !user;
        if (!user) {
          user = await tx.user.create({ data: { email: row.email, name: row.name, status: "INVITED" } });
        }
        const existing = await tx.enrollment.findUnique({
          where: { courseId_userId: { courseId, userId: user.id } },
        });
        if (existing) {
          // A blank section keeps the one they have: re-adding someone never wipes it.
          const section = row.section ?? existing.section;
          if (existing.role === row.role && existing.section === section) {
            summary.unchanged++;
            continue;
          }
          await tx.enrollment.update({ where: { id: existing.id }, data: { role: row.role, section } });
          changed.push({ userId: user.id, change: "updated", role: row.role, section, previousRole: existing.role, previousSection: existing.section });
          summary.updated++;
          continue;
        }
        assertCanJoinCourses(user);
        await tx.enrollment.create({ data: { courseId, userId: user.id, role: row.role, section: row.section } });
        changed.push({ userId: user.id, change: "added", role: row.role, section: row.section });
        summary.enrolled++;
        const context = `${actor.name} added you to ${course.code} — ${course.title} (${course.term}) as ${row.role.toLowerCase()}.${
          row.role === "STUDENT" ? openNote : ""
        }`;
        if (isNew || user.status === "INVITED") {
          await issueInvite(tx, user, context);
          summary.invited++;
        } else {
          await notify(tx, [user.id], {
            type: "course.enrolled",
            title: `Added to ${course.code}`,
            body: context,
            link: `/courses/${courseId}`,
          });
        }
      }
      await audit(tx, actor, { action: "roster.import", entityType: "Course", entityId: courseId, after: { ...summary, changes: changed } });
      return { ...summary, errors };
    },
    { timeout: 60_000 },
  );
}

/**
 * Remove someone from a course. A student's upcoming bookings are released (and
 * they're told); staff who still host upcoming slots must hand them over first.
 */
export async function removeMember(actor: Actor, courseId: string, userId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const role = await assertStaff(tx, actor, courseId, { write: true });
    const target = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: { user: { select: { name: true } }, course: true },
    });
    if (!target) throw new DomainError("Member not found.", "NOT_FOUND");
    if (userId === actor.id) throw new DomainError("You can't remove yourself.");
    if (target.role === "INSTRUCTOR") assertRule(canManageInstructors(actor), "FORBIDDEN");
    if (target.role === "TA") assertRule(canManageTAs(role, role === "INSTRUCTOR" || (await courseHasInstructor(tx, courseId))), "FORBIDDEN");
    return dropEnrollment(tx, actor, target, now);
  });
}

type EnrollmentToDrop = {
  id: string;
  userId: string;
  courseId: string;
  role: CourseRole;
  user: { name: string };
  course: { code: string; title: string; timezone: string };
};

/**
 * Remove an enrollment once access is checked (course roster or admin console).
 * A student's upcoming bookings are released and they're told; staff who host
 * upcoming slots are refused until those are handed over.
 */
export async function dropEnrollment(tx: Tx, actor: Actor, target: EnrollmentToDrop, now = new Date()) {
  const { userId, courseId } = target;
  let released = 0;
  if (target.role === "STUDENT") {
    const upcoming = await tx.booking.findMany({
      where: { studentId: userId, status: "BOOKED", assignment: { courseId }, slot: { startsAt: { gt: now } } },
      include: { slot: true },
    });
    if (upcoming.length) {
      await tx.booking.updateMany({
        where: { id: { in: upcoming.map((b) => b.id) } },
        data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
      });
      await notify(tx, [userId], {
        type: "course.removed",
        title: `Removed from ${target.course.code}`,
        body: `You were removed from ${target.course.code} — ${target.course.title}, so your upcoming demo${upcoming.length === 1 ? " was" : "s were"} cancelled:\n${upcoming
          .map((b) => fmtRange(b.slot.startsAt, b.slot.endsAt, target.course.timezone))
          .join("\n")}`,
      });
      released = upcoming.length;
    }
  } else {
    const hosted = await tx.slot.count({
      where: { taId: userId, status: { not: "CANCELLED" }, startsAt: { gt: now }, assignment: { courseId } },
    });
    if (hosted > 0) {
      throw new DomainError(
        `${target.user.name} hosts ${hosted} upcoming slot${hosted === 1 ? "" : "s"}. Reassign them to another host on the assignment's Slots tab first.`,
        "CONFLICT",
      );
    }
  }
  await tx.enrollment.delete({ where: { id: target.id } });
  await audit(tx, actor, { action: "enrollment.remove", entityType: "Enrollment", entityId: target.id, before: target, after: { releasedBookings: released } });
  return { released };
}

export async function resendInvite(actor: Actor, courseId: string, userId: string) {
  return db.$transaction(async (tx) => {
    await assertStaff(tx, actor, courseId, { write: true });
    const enrollment = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: { user: true, course: true },
    });
    if (!enrollment) throw new DomainError("Member not found.", "NOT_FOUND");
    if (enrollment.user.status !== "INVITED") throw new DomainError("This person has already activated their account.");
    await issueInvite(tx, enrollment.user, `Reminder: you've been added to ${enrollment.course.code} — ${enrollment.course.title}.`);
  });
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export { venueInput };

export async function listVenues(actor: Actor, courseId: string) {
  await assertCourseRole(db, actor, courseId, ["INSTRUCTOR", "TA", "STUDENT"]);
  return db.venue.findMany({ where: { courseId }, orderBy: { name: "asc" } });
}

export async function createVenue(actor: Actor, courseId: string, input: z.input<typeof venueInput>) {
  const data = venueInput.parse(input);
  return db.$transaction(async (tx) => {
    await assertStaff(tx, actor, courseId, { write: true });
    return tx.venue.create({ data: { ...data, courseId } });
  });
}

export async function deleteVenue(actor: Actor, venueId: string) {
  return db.$transaction(async (tx) => {
    const venue = await tx.venue.findUnique({ where: { id: venueId }, include: { _count: { select: { slots: { where: { status: { not: "CANCELLED" } } } } } } });
    if (!venue) throw new DomainError("Venue not found.", "NOT_FOUND");
    await assertStaff(tx, actor, venue.courseId, { write: true });
    if (venue._count.slots > 0) throw new DomainError("This venue is used by active slots. Move those slots first.", "CONFLICT");
    await tx.venue.delete({ where: { id: venueId } });
  });
}
