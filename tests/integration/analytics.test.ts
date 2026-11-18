import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { pseudonym } from "@/server/analytics-config";
import { setShareUsageData } from "@/server/services/accounts";
import { recordEvents, rollupAndPrune } from "@/server/services/analytics";
import { bookSlot, cancelBooking, rescheduleBooking } from "@/server/services/bookings";
import { answerSurvey, claimSurvey, listFeedback, setFeedbackStatus, submitFeedback } from "@/server/services/feedback";
import { clientErrors, funnels, performance, surveys, usageOverview, workflowMetrics } from "@/server/services/insights";
import { enroll, makeUser, resetDb, setupCourse } from "./helpers";

const DAY = 86_400_000;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
const ID = "cmhx1y2z30000abcd1234efgh";

beforeEach(async () => {
  await resetDb();
  process.env.ANALYTICS_SECRET = "test-secret-for-integration";
});
afterEach(() => {
  delete process.env.ANALYTICS_SECRET;
});

const batch = (events: unknown[], sessionId = "tab12345abc") => ({ sessionId, events });

async function student() {
  const ta = await makeUser("Tara TA");
  const s = await makeUser("Sam Student");
  const setup = await setupCourse(ta);
  await enroll(setup.course.id, [s]);
  return { ta, s, ...setup };
}

describe("recording usage events", () => {
  it("records nothing when analytics is off", async () => {
    const { s } = await student();
    delete process.env.ANALYTICS_SECRET;
    expect(await recordEvents(s, batch([{ name: "page_view", path: "/dashboard", at: Date.now() }]))).toBe(0);
    expect(await db.analyticsEvent.count()).toBe(0);
  });

  it("stores catalog events under a pseudonym, with route templates and no ids", async () => {
    const { s } = await student();
    const n = await recordEvents(
      s,
      batch([
        { name: "page_view", path: `/courses/${ID}/assignments/${ID}?reschedule=1`, at: Date.now() },
        { name: "funnel", path: "/x", at: Date.now(), props: { flow: "booking", step: "done" } },
        { name: "web_vital", path: "/dashboard", at: Date.now(), props: { metric: "LCP", value: 1800, rating: "good" } },
        { name: "search", path: "/", at: Date.now(), props: { q: "ann" } },
        { name: "page_view", path: "https://evil.example/", at: Date.now() },
      ]),
      { userAgent: IPHONE },
    );
    expect(n).toBe(3);
    const rows = await db.analyticsEvent.findMany({ orderBy: { name: "asc" } });
    expect(rows.map((r) => r.name)).toEqual(["funnel", "page_view", "web_vital"]);
    for (const r of rows) {
      expect(r.visitor).toBe(pseudonym(s.id));
      expect(r.visitor).not.toContain(s.id);
      expect(r).toMatchObject({ role: "student", device: "mobile", sessionId: "tab12345abc" });
      expect(JSON.stringify(r)).not.toContain(ID);
      expect(JSON.stringify(r)).not.toContain(s.email);
    }
    expect(rows.find((r) => r.name === "page_view")!.path).toBe("/courses/:id/assignments/:id");
  });

  it("keeps only scrubbed errors, without the pseudonym, when usage data is off", async () => {
    const { s } = await student();
    await setShareUsageData(s, false);
    await recordEvents(
      s,
      batch([
        { name: "page_view", path: "/dashboard", at: Date.now() },
        { name: "client_error", path: "/dashboard", at: Date.now(), props: { kind: "error", message: `Failed for ${s.email} id ${ID}` } },
      ]),
    );
    const rows = await db.analyticsEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "client_error", visitor: null });
    expect(rows[0].props).toEqual({ kind: "error", message: "Failed for <email> id <id>" });
  });

  it("rejects a malformed batch", async () => {
    const { s } = await student();
    expect(await recordEvents(s, { sessionId: "x", events: [] })).toBe(0);
    expect(await recordEvents(s, { sessionId: "tab12345abc", events: new Array(51).fill({ name: "page_view", path: "/", at: 1 }) })).toBe(0);
  });
});

describe("daily totals and retention", () => {
  it("rolls up full days and deletes raw events after 90 days", async () => {
    const { s } = await student();
    const now = new Date("2026-11-17T10:00:00Z");
    const yesterday = new Date("2026-11-16T09:00:00Z");
    const base = { sessionId: "tab12345abc", role: "student", device: "desktop", version: "t", visitor: pseudonym(s.id) };
    await db.analyticsEvent.createMany({
      data: [
        { ...base, name: "page_view", path: "/dashboard", occurredAt: yesterday },
        { ...base, name: "page_view", path: "/dashboard", occurredAt: yesterday },
        { ...base, name: "web_vital", path: "/dashboard", occurredAt: yesterday, props: { metric: "LCP", value: 1000, rating: "good" } },
        { ...base, name: "page_view", path: "/dashboard", occurredAt: now }, // today: not rolled up yet
        { ...base, name: "page_view", path: "/old", occurredAt: new Date(now.getTime() - 120 * DAY) },
      ],
    });
    const r = await rollupAndPrune(now);
    expect(r.prunedRaw).toBe(1);
    const daily = await db.analyticsDaily.findMany({ orderBy: { name: "asc" } });
    expect(daily.map((d) => [d.name, d.events, d.visitors])).toEqual([
      ["page_view", 2, 1],
      ["visitors", 3, 1],
      ["web_vital.LCP", 1, 1],
    ]);
    expect(daily.find((d) => d.name === "web_vital.LCP")!.p75).toBe(1000);
    // Running again changes nothing.
    await rollupAndPrune(now);
    expect(await db.analyticsDaily.count()).toBe(3);
  });
});

describe("feedback", () => {
  it("is stored without the user, with the hour only", async () => {
    const { s } = await student();
    await submitFeedback(s, { message: "  The reschedule button is hard to find  ", rating: 3, path: `/courses/${ID}` }, new Date("2026-11-17T10:42:13Z"));
    const [f] = await db.feedback.findMany();
    expect(f).toMatchObject({ message: "The reschedule button is hard to find", rating: 3, path: "/courses/:id", role: "student", status: "NEW" });
    expect(f.createdAt.toISOString()).toBe("2026-11-17T10:00:00.000Z");
    expect(JSON.stringify(f)).not.toContain(s.id);
  });

  it("limits how much one person sends in an hour", async () => {
    const s = await makeUser("Chatty");
    for (let i = 0; i < 5; i++) await submitFeedback(s, { message: `note ${i}`, rating: null, path: "/" });
    await expect(submitFeedback(s, { message: "one more", rating: null, path: "/" })).rejects.toThrow(/this hour/);
    await expect(submitFeedback(s, { message: " ", rating: null, path: "/" })).rejects.toThrow(/few words/);
  });

  it("is triaged by the platform account only, with an audit entry", async () => {
    const platform = await makeUser("Pat Platform", { isPlatform: true });
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const s = await makeUser("Sam");
    await submitFeedback(s, { message: "Great", rating: 5, path: "/" });
    const { items, counts } = await listFeedback(platform);
    expect(counts.NEW).toBe(1);
    await expect(listFeedback(s)).rejects.toThrow(/Platform team only/);
    await expect(listFeedback(admin)).rejects.toThrow(/Platform team only/);
    await expect(setFeedbackStatus(admin, items[0].id, "DONE")).rejects.toThrow(/Platform team only/);
    await setFeedbackStatus(platform, items[0].id, "DONE");
    expect((await listFeedback(platform, { status: "DONE" })).items).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "platform.feedback_status" } })).toBe(1);
  });
});

describe("one-question surveys", () => {
  it("asks each survey at most once a term and one survey per fortnight, takes one anonymous answer, never asks admins", async () => {
    const { s } = await student();
    const admin = await makeUser("Ada", { isAdmin: true });
    const now = new Date();
    await expect(answerSurvey(s, "booking", 5, now)).rejects.toThrow(/no survey/);
    expect(await claimSurvey(s, "booking", now)).toBe(true);
    expect(await claimSurvey(s, "booking", now)).toBe(false);
    // Moving the demo right after booking doesn't bring a second survey.
    expect(await claimSurvey(s, "reschedule", new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(await claimSurvey(admin, "booking", now)).toBe(false);
    await answerSurvey(s, "booking", 4, now);
    await expect(answerSurvey(s, "booking", 5, now)).rejects.toThrow(/already/);
    const [r] = await db.surveyResponse.findMany();
    expect(r).toMatchObject({ prompt: "booking", score: 4, role: "student" });
    expect(r.createdAt.getUTCHours()).toBe(0);
    expect(await claimSurvey(s, "booking", new Date(now.getTime() + 14 * DAY))).toBe(false);
    expect(await claimSurvey(s, "reschedule", new Date(now.getTime() + 14 * DAY))).toBe(true);
    expect(await claimSurvey(s, "booking", new Date(now.getTime() + 104 * DAY))).toBe(true);
    await expect(answerSurvey(s, "booking", 9, now)).rejects.toThrow(/1 to 5/);
  });
});

describe("insights", () => {
  it("is for the platform account only, not admins", async () => {
    const s = await makeUser("Sam");
    const admin = await makeUser("Ada", { isAdmin: true });
    for (const who of [s, admin]) {
      await expect(usageOverview(who, 30)).rejects.toThrow(/Platform team only/);
      await expect(workflowMetrics(who, 30)).rejects.toThrow(/Platform team only/);
    }
    // A record that somehow has both flags is refused too.
    await expect(usageOverview({ ...admin, isPlatform: true }, 30)).rejects.toThrow(/Platform team only/);
  });

  it("tells reschedules from cancellations and reports every tab", async () => {
    const admin = await makeUser("Pat Platform", { isPlatform: true });
    const { s, slots } = await student();
    const b = await bookSlot(s, slots[0].id);
    await rescheduleBooking(s, b.id, slots[1].id);
    const moved = await db.booking.findFirstOrThrow({ where: { studentId: s.id, status: "BOOKED" } });
    await cancelBooking(s, moved.id);
    const w = await workflowMetrics(admin, 30);
    expect(w.changes).toMatchObject({ reschedules: 1, cancellations: 1, staffCancels: 0 });
    expect(w.bookings.created).toBe(2);

    await recordEvents(s, batch([{ name: "funnel", path: "/", at: Date.now(), props: { flow: "booking", step: "view" } }]));
    await claimSurvey(s, "marking");
    const f = await funnels(admin, 30);
    expect(f.find((r) => r.flow === "booking" && r.device === "all")!.counts.view).toBe(1);
    await expect(usageOverview(admin, 7)).resolves.toBeTruthy();
    await expect(performance(admin, 30)).resolves.toBeTruthy();
    await expect(clientErrors(admin, 90)).resolves.toEqual([]);
    expect((await surveys(admin, 30)).find((x) => x.prompt === "marking")!.shown).toBe(1);
  });
});
