import { allow, deny, type RuleResult } from "./result";

export type CourseRole = "INSTRUCTOR" | "TA" | "STUDENT";

/**
 * Which course roles one person may hold across courses. A TA can be a student
 * in another course, but an instructor is never a TA (and a TA never an
 * instructor) anywhere. `elsewhere` is the person's roles in their other courses.
 */
export function canTakeRole(role: CourseRole, elsewhere: { role: CourseRole; course: string }[]): RuleResult {
  const clash = elsewhere.find((e) => (role === "TA" && e.role === "INSTRUCTOR") || (role === "INSTRUCTOR" && e.role === "TA"));
  if (!clash) return allow;
  return role === "TA"
    ? deny(`is an instructor in ${clash.course}, and instructors can't also be TAs.`)
    : deny(`is a TA in ${clash.course}, and TAs can't also be instructors.`);
}

/**
 * Platform (product-team) access is for a dedicated account: never an admin and
 * never a member of any course, so a bug in course or admin code can't reach
 * usage data, and the platform pages can't reach course data.
 */
export function canGrantPlatform(user: { isAdmin: boolean; courses: string[] }): RuleResult {
  if (user.isAdmin) return deny("is a Slotty admin. Platform access needs its own account.");
  if (user.courses.length > 0) return deny(`is a member of ${user.courses.join(", ")}. Platform access needs an account that isn't in any course.`);
  return allow;
}
