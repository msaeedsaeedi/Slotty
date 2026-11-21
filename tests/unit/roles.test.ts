import { describe, expect, it } from "vitest";
import { canChangeCourseData, canManageCourse, canManageInstructors, canManageTAs, canTakeRole } from "@/domain/roles";

describe("canTakeRole", () => {
  const none: { role: "INSTRUCTOR" | "TA" | "STUDENT"; course: string }[] = [];

  it("keeps instructors apart from TAs and students across courses", () => {
    expect(canTakeRole("TA", [{ role: "INSTRUCTOR", course: "CS1" }]).ok).toBe(false);
    expect(canTakeRole("INSTRUCTOR", [{ role: "TA", course: "CS1" }]).ok).toBe(false);
    expect(canTakeRole("STUDENT", [{ role: "TA", course: "CS1" }]).ok).toBe(true);
  });

  it("never moves someone between student and staff in the same course", () => {
    expect(canTakeRole("TA", none, "STUDENT")).toMatchObject({ ok: false, reason: expect.stringMatching(/students can't become staff/) });
    expect(canTakeRole("INSTRUCTOR", none, "STUDENT")).toMatchObject({ ok: false, reason: expect.stringMatching(/students can't be instructors/) });
    expect(canTakeRole("STUDENT", none, "TA")).toMatchObject({ ok: false, reason: expect.stringMatching(/staff can't become students/) });
    expect(canTakeRole("STUDENT", none, "INSTRUCTOR").ok).toBe(false);
    expect(canTakeRole("INSTRUCTOR", none, "TA").ok).toBe(true);
    expect(canTakeRole("STUDENT", none, "STUDENT").ok).toBe(true);
  });

  it("uses what someone did here before when they're added back", () => {
    expect(canTakeRole("TA", none, null, "student")).toMatchObject({ ok: false, reason: expect.stringMatching(/was a student/) });
    expect(canTakeRole("STUDENT", none, null, "staff")).toMatchObject({ ok: false, reason: expect.stringMatching(/hosted or marked/) });
    expect(canTakeRole("STUDENT", none, null, "student").ok).toBe(true);
    expect(canTakeRole("TA", none, null, "staff").ok).toBe(true);
    expect(canTakeRole("TA", none, null, null).ok).toBe(true);
  });
});

describe("who manages whom", () => {
  it("leaves instructors to admins", () => {
    expect(canManageInstructors({ isAdmin: true }).ok).toBe(true);
    expect(canManageInstructors({ isAdmin: false }).ok).toBe(false);
  });

  it("leaves TAs to the instructor, or to an admin when there is none", () => {
    expect(canManageTAs("INSTRUCTOR", true).ok).toBe(true);
    expect(canManageTAs("TA", true)).toMatchObject({ ok: false, reason: expect.stringMatching(/course instructor/) });
    expect(canManageTAs("TA", false)).toMatchObject({ ok: false, reason: expect.stringMatching(/Slotty admin/) });
    expect(canManageTAs("STUDENT", true).ok).toBe(false);
    expect(canManageTAs(null, false).ok).toBe(false);
  });

  it("lets a TA run course settings only without an instructor", () => {
    expect(canManageCourse("INSTRUCTOR", true).ok).toBe(true);
    expect(canManageCourse("TA", false).ok).toBe(true);
    expect(canManageCourse("TA", true).ok).toBe(false);
    expect(canManageCourse("STUDENT", false).ok).toBe(false);
  });

  it("keeps admins read-only inside courses", () => {
    expect(canChangeCourseData({ isAdmin: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/read-only/) });
    expect(canChangeCourseData({ isAdmin: false }).ok).toBe(true);
  });
});
