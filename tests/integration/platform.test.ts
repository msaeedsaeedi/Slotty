import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminAssignStaff, adminAuditLog, adminGetUser, adminInviteUser, adminListUsers, adminOverview, adminSendAccessEmail, adminSetAdmin, adminSetUserDisabled, adminUpdateUser } from "@/server/services/admin";
import { recordEvents } from "@/server/services/analytics";
import { createCourse, previewRoster } from "@/server/services/courses";
import { claimSurvey, listFeedback, setFeedbackStatus, submitFeedback } from "@/server/services/feedback";
import { makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

describe("platform accounts are kept apart from administration and courses", () => {
  it("are invisible to the admin console and can't be changed from it", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const platform = await makeUser("Pat Platform", { isPlatform: true });
    await makeUser("Sam Student");

    const { users, total } = await adminListUsers(admin, { q: "Pat" });
    expect(total).toBe(0);
    expect(users).toEqual([]);
    expect((await adminOverview(admin)).users.active).toBe(2); // Ada and Sam
    await expect(adminGetUser(admin, platform.id)).rejects.toThrow(/not found/);
    await expect(adminSetAdmin(admin, platform.id, true)).rejects.toThrow(/not found/);
    await expect(adminSetUserDisabled(admin, platform.id, true)).rejects.toThrow(/not found/);
    await expect(adminUpdateUser(admin, platform.id, { name: "X", email: platform.email })).rejects.toThrow(/not found/);
    await expect(adminSendAccessEmail(admin, platform.id)).rejects.toThrow(/not found/);
    await expect(adminInviteUser(admin, { email: platform.email, name: "Again" })).rejects.toThrow(/^That email already has an account\.$/);
    expect(await db.user.count({ where: { id: platform.id, platformAccess: true, isAdmin: false, status: "ACTIVE" } })).toBe(1);
  });

  it("can't use the admin console", async () => {
    const platform = await makeUser("Pat Platform", { isPlatform: true });
    await expect(adminOverview(platform)).rejects.toThrow(/Admins only/);
    await expect(adminListUsers(platform)).rejects.toThrow(/Admins only/);
  });

  it("never join a course", async () => {
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const platform = await makeUser("Pat Platform", { isPlatform: true });
    const ta = await makeUser("Tara TA");
    const { course } = await setupCourse(ta);
    await expect(createCourse(platform, { code: "X1", title: "X", term: "T", timezone: "UTC", myRole: "TA" })).rejects.toThrow(/can't join courses/);
    await expect(adminAssignStaff(admin, course.id, { email: platform.email, role: "TA" })).rejects.toThrow(/can't join courses/);
    const preview = await previewRoster(ta, course.id, `email,name\n${platform.email},Pat`);
    expect(preview.errors.map((e) => e.message)).toEqual([`${platform.email} can't be added to a course.`]);
    expect(await db.enrollment.count({ where: { userId: platform.id } })).toBe(0);
  });

  it("aren't tracked or surveyed, and their activity stays out of the admin audit log", async () => {
    process.env.ANALYTICS_SECRET = "test-secret";
    try {
      const admin = await makeUser("Ada Admin", { isAdmin: true });
      const platform = await makeUser("Pat Platform", { isPlatform: true });
      const s = await makeUser("Sam");
      expect(await recordEvents(platform, { sessionId: "tab12345abc", events: [{ name: "page_view", path: "/platform", at: Date.now() }] })).toBe(0);
      expect(await claimSurvey(platform, "booking")).toBe(false);
      await expect(submitFeedback(platform, { message: "hi", rating: null, path: "/" })).rejects.toThrow(/don't send feedback/);

      await submitFeedback(s, { message: "Nice", rating: null, path: "/" });
      const [item] = (await listFeedback(platform)).items;
      await setFeedbackStatus(platform, item.id, "TRIAGED");
      await db.auditLog.create({ data: { actorId: null, action: "platform.grant", entityType: "User", entityId: platform.id } });
      const log = await adminAuditLog(admin);
      expect(log.entries.map((e) => e.action)).toEqual([]);
    } finally {
      delete process.env.ANALYTICS_SECRET;
    }
  });
});
