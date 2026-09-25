import { z } from "zod";
import type { CourseRole } from "@/generated/prisma/client";
import { DomainError } from "@/domain/result";
import { parseRoster, type RosterRow } from "@/domain/csv-roster";
import { fmtRange, isValidTimezone } from "@/lib/time";
import { db } from "@/server/db";
import { assertCourseRole, assertStaff, courseRoleOf, type Actor } from "./access";
import { audit } from "./audit";
import { issueInvite } from "./accounts";
import { notify } from "./notify";

export const courseInput = z.object({
  code: z.string().trim().min(1, "Course code is required.").max(40),
  title: z.string().trim().min(1, "Title is required.").max(200),
  term: z.string().trim().min(1, "Term is required.").max(60),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone."),
});

export async function createCourse(actor: Actor, input: z.input<typeof courseInput> & { myRole: "TA" | "INSTRUCTOR" }) {
  const data = courseInput.parse(input);
  const myRole = input.myRole === "INSTRUCTOR" ? "INSTRUCTOR" : "TA";
  return db.$transaction(async (tx) => {
    const course = await tx.course.create({ data: { ...data, createdById: actor.id } });
    await tx.enrollment.create({ data: { courseId: course.id, userId: actor.id, role: myRole } });
    await audit(tx, actor, { action: "course.create", entityType: "Course", entityId: course.id, after: data });
    return course;
  });
}

export async function updateCourse(actor: Actor, courseId: string, input: z.input<typeof courseInput>) {
  const data = courseInput.parse(input);
  return db.$transaction(async (tx) => {
    await assertStaff(tx, actor, courseId, { write: true });
    const before = await tx.course.findUniqueOrThrow({ where: { id: courseId } });
    const course = await tx.course.update({ where: { id: courseId }, data });
    await audit(tx, actor, { action: "course.update", entityType: "Course", entityId: courseId, before, after: data });
    return course;
  });
}

export async function setCourseArchived(actor: Actor, courseId: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    await assertStaff(tx, actor, courseId);
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

export async function listCourseStaff(courseId: string) {
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

export async function previewRoster(actor: Actor, courseId: string, csv: string) {
  await assertStaff(db, actor, courseId);
  const { rows, errors } = parseRoster(csv);
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
    if (enrollment.role !== row.role) return { ...row, status: "role-change", currentRole: enrollment.role };
    return { ...row, status: "unchanged", currentRole: enrollment.role };
  });
  return { rows: preview, errors };
}

/**
 * Add everyone in the CSV to the course by email. Unknown emails become invited
 * accounts and receive a set-password link; existing users are notified.
 */
export async function importRoster(actor: Actor, courseId: string, csv: string) {
  const { rows, errors } = parseRoster(csv);
  if (rows.length === 0) throw new DomainError(errors[0]?.message ?? "The CSV has no valid rows.");

  return db.$transaction(
    async (tx) => {
      const myRole = await assertStaff(tx, actor, courseId, { write: true });
      if (myRole !== "INSTRUCTOR" && rows.some((r) => r.role === "INSTRUCTOR")) {
        throw new DomainError("Only instructors can add other instructors.", "FORBIDDEN");
      }
      const course = await tx.course.findUniqueOrThrow({ where: { id: courseId } });
      const summary = { invited: 0, enrolled: 0, updated: 0, unchanged: 0 };
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
          if (existing.role === row.role && existing.section === row.section) {
            summary.unchanged++;
            continue;
          }
          // Never demote yourself out of staff by accident.
          if (user.id === actor.id && row.role === "STUDENT") {
            summary.unchanged++;
            continue;
          }
          await tx.enrollment.update({ where: { id: existing.id }, data: { role: row.role, section: row.section } });
          summary.updated++;
          continue;
        }
        await tx.enrollment.create({ data: { courseId, userId: user.id, role: row.role, section: row.section } });
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
      await audit(tx, actor, { action: "roster.import", entityType: "Course", entityId: courseId, after: summary });
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
    const myRole = await assertStaff(tx, actor, courseId, { write: true });
    const target = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: { user: { select: { name: true } }, course: true },
    });
    if (!target) throw new DomainError("Member not found.", "NOT_FOUND");
    if (target.role === "INSTRUCTOR" && myRole !== "INSTRUCTOR") {
      throw new DomainError("Only instructors can remove instructors.", "FORBIDDEN");
    }
    if (userId === actor.id) throw new DomainError("You can't remove yourself.");

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
  });
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

export const venueInput = z.object({
  name: z.string().trim().min(1, "Venue name is required.").max(120),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\//.test(v), "Meeting link must start with http(s)://"),
});

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
