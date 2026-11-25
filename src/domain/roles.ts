import { allow, deny, type RuleResult } from "./result";

export type CourseRole = "INSTRUCTOR" | "TA" | "STUDENT";

/**
 * Which course roles one person may hold across courses. A TA can be a student
 * in another course, but an instructor is never a TA or a student anywhere (and
 * a TA or student never an instructor). `elsewhere` is the person's roles in
 * their other courses; `current` is their role in this course, if any.
 *
 * Within one course nobody moves between student and staff, in either
 * direction: a promoted student would see their classmates' marks, and a
 * demoted TA would be marked by colleagues. `pastHere` closes the same gap for
 * someone removed and added back: "student" if they booked or were marked in
 * this course, "staff" if they hosted or marked demos in it.
 */
export function canTakeRole(
  role: CourseRole,
  elsewhere: { role: CourseRole; course: string }[],
  current?: CourseRole | null,
  pastHere?: "student" | "staff" | null,
): RuleResult {
  if (role === "INSTRUCTOR" && current === "STUDENT") return deny("is a student in this course, and students can't be instructors.");
  if (current && (current === "STUDENT") !== (role === "STUDENT")) {
    return current === "STUDENT"
      ? deny("is a student in this course, and students can't become staff in the same course.")
      : deny("is staff in this course, and staff can't become students in the same course.");
  }
  if (!current && pastHere && (pastHere === "student") !== (role === "STUDENT")) {
    return pastHere === "student"
      ? deny("was a student in this course (bookings or marks), so can't join it as staff.")
      : deny("has hosted or marked demos in this course, so can't join it as a student.");
  }
  const clash = elsewhere.find(
    (e) => (role === "INSTRUCTOR" && e.role !== "INSTRUCTOR") || (e.role === "INSTRUCTOR" && role !== "INSTRUCTOR"),
  );
  if (!clash) return allow;
  if (role === "INSTRUCTOR") {
    return clash.role === "TA"
      ? deny(`is a TA in ${clash.course}, and TAs can't also be instructors.`)
      : deny(`is a student in ${clash.course}, and students can't be instructors.`);
  }
  return role === "TA"
    ? deny(`is an instructor in ${clash.course}, and instructors can't also be TAs.`)
    : deny(`is an instructor in ${clash.course}, and instructors can't also be students.`);
}

/**
 * Who may add, change or remove an instructor: only admins. Course staff
 * (instructors included) manage students and TAs.
 */
export function canManageInstructors(actor: { isAdmin: boolean }): RuleResult {
  return actor.isAdmin ? allow : deny("Only a Uniflow admin can add, change or remove instructors (under Administration → Courses).");
}

/**
 * Who may add, change or remove a TA inside a course: its instructors. TAs
 * manage students only, and in a course without an instructor co-TAs are
 * added and removed by an admin from the console.
 */
export function canManageTAs(role: CourseRole | null, hasInstructor: boolean): RuleResult {
  if (role === "INSTRUCTOR") return allow;
  return deny(
    hasInstructor
      ? "Only the course instructor can add, change or remove TAs."
      : "Only a Uniflow admin can add, change or remove TAs in a course without an instructor.",
  );
}

/**
 * Admins moderate: they can open any course and read it, but never change
 * course data (marks, bookings, slots, roster, settings) from inside it. Staff
 * and archiving are handled from the admin console.
 */
export function canChangeCourseData(actor: { isAdmin: boolean }): RuleResult {
  return actor.isAdmin ? deny("Admins view courses read-only. Staff and archiving are managed under Administration → Courses.") : allow;
}

/**
 * Self-service course creation. The creator always joins as a TA (instructors
 * are named by an admin), so it's open to TAs and to new staff not yet in any
 * course, but not to students (a student in any course who isn't a TA anywhere)
 * or to instructors, who can't also be TAs.
 */
export function canCreateCourse(actor: { isAdmin: boolean; isPlatform?: boolean }, roles: CourseRole[]): RuleResult {
  if (actor.isAdmin) return deny("Admins don't join courses. Create it from the admin console and name its instructor or TA.");
  if (actor.isPlatform) return deny("That account can't join courses.");
  if (roles.includes("INSTRUCTOR")) return deny("Instructors' courses are set up by a Uniflow admin. Ask an admin to create it and name you as instructor.");
  if (roles.length > 0 && !roles.includes("TA")) return deny("Students can't create courses. If you're joining as staff, ask a Uniflow admin.");
  return allow;
}

/**
 * Who runs a course (settings, archive): its instructors, or its TAs when it
 * has no instructor. Admins can read the settings but not change them
 * (`canChangeCourseData`).
 */
export function canManageCourse(role: CourseRole | null, hasInstructor: boolean): RuleResult {
  if (role === "INSTRUCTOR") return allow;
  if (role === "TA" && !hasInstructor) return allow;
  return deny(role === "TA" ? "This course has an instructor, who manages its settings." : "You don't have permission to do that.");
}

/**
 * Platform (product-team) access is for a dedicated account: never an admin and
 * never a member of any course, so a bug in course or admin code can't reach
 * usage data, and the platform pages can't reach course data.
 */
export function canGrantPlatform(user: { isAdmin: boolean; courses: string[] }): RuleResult {
  if (user.isAdmin) return deny("is a Uniflow admin. Platform access needs its own account.");
  if (user.courses.length > 0) return deny(`is a member of ${user.courses.join(", ")}. Platform access needs an account that isn't in any course.`);
  return allow;
}
