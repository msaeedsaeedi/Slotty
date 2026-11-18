import type { CourseRole } from "@/generated/prisma/client";
import { assertRule, DomainError } from "@/domain/result";
import { canManageCourse } from "@/domain/roles";
import type { Tx } from "@/server/db";

/** The authenticated user a service call acts on behalf of. */
export interface Actor {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  /** Product team (usage insights and feedback). Never set together with isAdmin. */
  isPlatform?: boolean;
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
  if (!actor.isAdmin || actor.isPlatform) throw new DomainError("Admins only.", "FORBIDDEN");
}

/** Usage insights and feedback: the product team's dedicated account only, never an admin. */
export function assertPlatform(actor: Actor): void {
  if (!actor.isPlatform || actor.isAdmin) throw new DomainError("Platform team only.", "FORBIDDEN");
}

/** Platform accounts never join courses; refuse wherever someone is added to one. */
export function assertCanJoinCourses(user: { platformAccess: boolean }): void {
  if (user.platformAccess) throw new DomainError("That account can't join courses.", "FORBIDDEN");
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

/**
 * Course settings and archiving: the instructor manages the course, a TA only
 * when it has no instructor (`canManageCourse`). Admins count as instructors.
 */
export async function assertCourseManager(tx: Tx, actor: Actor, courseId: string, opts: AccessOptions = {}): Promise<CourseRole> {
  const role = await assertStaff(tx, actor, courseId, opts);
  assertRule(canManageCourse(role, role === "INSTRUCTOR" || (await courseHasInstructor(tx, courseId))), "FORBIDDEN");
  return role;
}

/** Can the actor change course settings? For hiding Settings and Archive in the UI. */
export async function canManageCourseFor(tx: Tx, actor: Actor, courseId: string): Promise<boolean> {
  const role = await courseRoleOf(tx, actor, courseId);
  return canManageCourse(role, role === "INSTRUCTOR" || (await courseHasInstructor(tx, courseId))).ok;
}
