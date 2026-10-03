import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  adminAssignStaff,
  adminAuditLog,
  adminGetUser,
  adminListCourses,
  adminListUsers,
  adminOverview,
  adminRetryEmails,
  adminSendAccessEmail,
  adminSetCourseArchived,
  adminUpdateUser,
} from "@/server/services/admin";
import { enroll, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

const DAY = 86_400_000;

describe("admin console", () => {
  it("is admins only", async () => {
    const ta = await makeUser("Tara TA");
    await expect(adminOverview(ta)).rejects.toThrow(/Admins only/);
    await expect(adminListUsers(ta)).rejects.toThrow(/Admins only/);
    await expect(adminRetryEmails(ta, "all-failed")).rejects.toThrow(/Admins only/);
  });

  it("flags stale invites, failed email and courses without staff", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const { course } = await setupCourse(ta);
    await db.user.create({ data: { email: "late@test.edu", name: "Late", status: "INVITED", createdAt: new Date(Date.now() - 10 * DAY) } });
    await db.user.create({ data: { email: "fresh@test.edu", name: "Fresh", status: "INVITED" } });
    await db.emailOutbox.create({ data: { to: "x@test.edu", subject: "Hi", text: "Hi", status: "FAILED", attempts: 5, lastError: "550 no such user" } });
    const orphan = await db.course.create({ data: { code: "CS999", title: "Orphan", term: "Fall", timezone: "UTC", createdById: ta.id } });

    const o = await adminOverview(admin);
    expect(o.staleInvites.count).toBe(1);
    expect(o.staleInvites.oldest[0].email).toBe("late@test.edu");
    expect(o.users.invited).toBe(2);
    expect(o.email.failed30d).toBe(1);
    expect(o.courses.withoutStaff.map((c) => c.id)).toEqual([orphan.id]);
    expect(o.courses.active).toBe(2);

    expect((await adminListUsers(admin, { filter: "stale" })).users.map((u) => u.email)).toEqual(["late@test.edu"]);
    expect((await adminListCourses(admin, { filter: "no-staff" })).map((c) => c.id)).toEqual([orphan.id]);
    const listed = (await adminListCourses(admin)).find((c) => c.id === course.id)!;
    expect(listed.tas.map((t) => t.name)).toEqual(["Tara TA"]);
  });

  it("assigns staff to a course without enrolling the admin, inviting new people", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const orphan = await db.course.create({ data: { code: "CS999", title: "Orphan", term: "Fall", timezone: "UTC", createdById: ta.id } });

    await expect(adminAssignStaff(admin, orphan.id, { email: "new@test.edu", role: "INSTRUCTOR" })).rejects.toThrow(/name/);
    const r = await adminAssignStaff(admin, orphan.id, { email: "New@Test.edu", name: "Nia New", role: "INSTRUCTOR" });
    expect(r).toEqual({ invited: true, name: "Nia New" });
    expect(await db.emailOutbox.count({ where: { to: "new@test.edu" } })).toBe(1);
    await adminAssignStaff(admin, orphan.id, { email: ta.email, role: "TA" });
    expect(await db.notification.count({ where: { userId: ta.id, type: "course.enrolled" } })).toBe(1);

    expect(await db.enrollment.count({ where: { courseId: orphan.id, userId: admin.id } })).toBe(0);
    expect((await adminOverview(admin)).courses.withoutStaff).toHaveLength(0);
    const log = await adminAuditLog(admin, { area: "course" });
    expect(log.entries.map((e) => e.entityName)).toEqual(["CS999", "CS999"]);
  });

  it("re-sends invites, sends resets, and only corrects email before activation", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const active = await makeUser("Ann Active");
    const invited = await db.user.create({ data: { email: "typo@tset.edu", name: "Ivy", status: "INVITED" } });

    expect(await adminSendAccessEmail(admin, invited.id)).toBe("invite");
    expect(await adminSendAccessEmail(admin, active.id)).toBe("reset");
    expect(await db.authToken.count({ where: { userId: active.id, type: "PASSWORD_RESET" } })).toBe(1);

    await expect(adminUpdateUser(admin, active.id, { name: "Ann", email: "other@test.edu" })).rejects.toThrow(/invited/);
    await adminUpdateUser(admin, invited.id, { name: "Ivy", email: "typo@test.edu" });
    expect(await db.emailOutbox.count({ where: { to: "typo@test.edu" } })).toBe(1);

    const detail = await adminGetUser(admin, invited.id);
    expect(detail.invite?.expired).toBe(false);
    expect(detail.history.map((h) => h.action)).toEqual(expect.arrayContaining(["user.update", "user.invite_resent"]));
  });

  it("retries failed emails and archives courses", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await db.emailOutbox.createMany({
      data: [
        { to: "a@test.edu", subject: "A", text: "A", status: "FAILED", attempts: 5 },
        { to: "b@test.edu", subject: "B", text: "B", status: "FAILED", attempts: 5 },
      ],
    });
    expect(await adminRetryEmails(admin, "all-failed")).toBe(2);
    expect(await db.emailOutbox.count({ where: { status: "PENDING", attempts: 0, to: { in: ["a@test.edu", "b@test.edu"] } } })).toBe(2);

    await adminSetCourseArchived(admin, course.id, true);
    expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).archived).toBe(true);
    expect((await adminListCourses(admin, { filter: "archived" })).map((c) => c.id)).toEqual([course.id]);
  });
});
