import type { CourseRole } from "@/generated/prisma/client";
import { DomainError } from "@/domain/result";
import type { Tx } from "@/server/db";

/** The authenticated user a service call acts on behalf of. */
export interface Actor {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export const STAFF: CourseRole[] = ["INSTRUCTOR", "TA"];

/** The actor's role in a course; admins are treated as instructors (moderation). */
export async function courseRoleOf(tx: Tx, actor: Actor, courseId: string): Promise<CourseRole | null> {
  const enrollment = await tx.enrollment.findUnique({
    where: { courseId_userId: { courseId, userId: actor.id } },
    select: { role: true },
  });
  if (enrollment) return enrollment.role;
  return actor.isAdmin ? "INSTRUCTOR" : null;
}

export interface AccessOptions {
  /** The call changes course data, so archived (read-only) courses are refused. */
  write?: boolean;
}

export const ARCHIVED_MESSAGE = "This course is archived and read-only. Restore it in Settings to make changes.";

/** Archived courses are read-only. */
export function assertCourseWritable(course: { archived: boolean }): void {
  if (course.archived) throw new DomainError(ARCHIVED_MESSAGE, "CONFLICT");
}

export async function assertCourseRole(
  tx: Tx,
  actor: Actor,
  courseId: string,
  roles: CourseRole[],
  opts: AccessOptions = {},
): Promise<CourseRole> {
  const role = await courseRoleOf(tx, actor, courseId);
  if (!role) throw new DomainError("Course not found.", "NOT_FOUND");
  if (!roles.includes(role)) throw new DomainError("You don't have permission to do that.", "FORBIDDEN");
  if (opts.write) {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { archived: true } });
    if (course) assertCourseWritable(course);
  }
  return role;
}

export const assertStaff = (tx: Tx, actor: Actor, courseId: string, opts?: AccessOptions) =>
  assertCourseRole(tx, actor, courseId, STAFF, opts);

export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) throw new DomainError("Admins only.", "FORBIDDEN");
}

/** Does the course have an instructor to review TA submissions? */
export async function courseHasInstructor(tx: Tx, courseId: string): Promise<boolean> {
  const count = await tx.enrollment.count({ where: { courseId, role: "INSTRUCTOR" } });
  return count > 0;
}

/** Resolve an assignment's course and check the actor's role in it. */
export async function assertAssignmentRole(tx: Tx, actor: Actor, assignmentId: string, roles: CourseRole[], opts: AccessOptions = {}) {
  const assignment = await tx.assignment.findUnique({
    where: { id: assignmentId },
    include: { course: true, policy: true },
  });
  if (!assignment) throw new DomainError("Assignment not found.", "NOT_FOUND");
  const role = await assertCourseRole(tx, actor, assignment.courseId, roles);
  if (opts.write) assertCourseWritable(assignment.course);
  return { assignment, role };
}
