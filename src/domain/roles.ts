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
