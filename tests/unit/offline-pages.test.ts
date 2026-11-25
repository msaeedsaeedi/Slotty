import { describe, expect, it } from "vitest";
import { OFFLINE_PAGE_CAP, offlinePages, type OfflineCourse, type OfflineInput } from "@/domain/offline-pages";

const now = new Date("2026-12-01T09:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

function course(over: Partial<OfflineCourse> & Pick<OfflineCourse, "id" | "role">): OfflineCourse {
  return { timezone: "UTC", fingerprint: "f1", assignments: [], ...over };
}

function input(over: Partial<OfflineInput>): OfflineInput {
  return { now, outsideCourses: false, userFingerprint: "u1", courses: [], ownBookings: [], hostedBookings: [], ...over };
}

const urls = (i: OfflineInput) => offlinePages(i).map((p) => p.url);

describe("offlinePages (#162)", () => {
  it("gives admin and platform accounts nothing", () => {
    expect(offlinePages(input({ outsideCourses: true, courses: [course({ id: "c", role: "STUDENT" })] }))).toEqual([]);
  });

  it("gives a student the core pages, their course and assignments with an upcoming or booked demo", () => {
    const pages = urls(
      input({
        courses: [
          course({
            id: "c",
            role: "STUDENT",
            assignments: [
              { id: "open", status: "PUBLISHED", slotStarts: [inDays(3)] },
              { id: "far", status: "PUBLISHED", slotStarts: [inDays(30)] },
              { id: "draft", status: "DRAFT", slotStarts: [inDays(1)] },
              { id: "closed-booked", status: "CLOSED", slotStarts: [] },
            ],
          }),
        ],
        ownBookings: [{ courseId: "c", assignmentId: "closed-booked", startsAt: inDays(2) }],
      }),
    );
    expect(pages).toEqual(["/dashboard", "/bookings", "/notifications", "/courses/c", "/courses/c/assignments/closed-booked", "/courses/c/assignments/open"]);
    expect(pages).not.toContain("/today");
  });

  it("gives a TA Demo day, the course's Today page, marking sheets and their own students only", () => {
    const pages = urls(
      input({
        courses: [course({ id: "c", role: "TA" })],
        hostedBookings: [
          { courseId: "c", assignmentId: "a", studentId: "s1", startsAt: inDays(1) },
          { courseId: "c", assignmentId: "a", studentId: "s2", startsAt: inDays(-3) },
          { courseId: "c", assignmentId: "b", studentId: "s3", startsAt: inDays(20) },
        ],
      }),
    );
    expect(pages).toContain("/today");
    expect(pages).toContain("/courses/c/manage/today");
    expect(pages).toContain("/courses/c/manage/assignments/a/mark");
    expect(pages).toContain("/courses/c/manage/assignments/a/evaluate/s1");
    expect(pages).toContain("/courses/c/manage/assignments/a/evaluate/s2");
    // Outside 14 days, and no marking sheet for demos only in the past or beyond 7 days.
    expect(pages).not.toContain("/courses/c/manage/assignments/b/evaluate/s3");
    expect(pages).not.toContain("/courses/c/manage/assignments/b/mark");
    expect(pages).not.toContain("/courses/c/manage/review");
    expect(pages).not.toContain("/courses/c");
    expect(pages).not.toContain("/bookings");
  });

  it("adds the review queue for an instructor", () => {
    expect(urls(input({ courses: [course({ id: "c", role: "INSTRUCTOR" })] }))).toContain("/courses/c/manage/review");
  });

  it("keeps at most the cap, leaving out the furthest-off demos first", () => {
    const hostedBookings = Array.from({ length: 200 }, (_, i) => ({ courseId: "c", assignmentId: "a", studentId: `s${i}`, startsAt: new Date(now.getTime() + i * 60_000) }));
    const pages = urls(input({ courses: [course({ id: "c", role: "TA" })], hostedBookings }));
    expect(pages).toHaveLength(OFFLINE_PAGE_CAP);
    expect(pages).toContain("/courses/c/manage/assignments/a/evaluate/s0");
    expect(pages).not.toContain("/courses/c/manage/assignments/a/evaluate/s199");
  });

  it("marks the data-saver set: dashboard, Demo day and the next 7 days of demos", () => {
    const pages = offlinePages(
      input({
        courses: [course({ id: "c", role: "TA" })],
        hostedBookings: [
          { courseId: "c", assignmentId: "a", studentId: "soon", startsAt: inDays(2) },
          { courseId: "c", assignmentId: "a", studentId: "later", startsAt: inDays(10) },
        ],
      }),
    );
    const key = pages.filter((p) => p.key).map((p) => p.url);
    expect(key).toEqual(expect.arrayContaining(["/dashboard", "/today", "/courses/c/manage/assignments/a/evaluate/soon"]));
    expect(key).not.toContain("/courses/c/manage/assignments/a/evaluate/later");
    expect(key).not.toContain("/notifications");
  });

  it("changes a page's version only when its data or day changes", () => {
    const base = input({ courses: [course({ id: "c", role: "STUDENT" })] });
    const v = (i: OfflineInput, url: string) => offlinePages(i).find((p) => p.url === url)!.version;
    expect(v(base, "/courses/c")).toBe(v({ ...base }, "/courses/c"));
    expect(v({ ...base, courses: [course({ id: "c", role: "STUDENT", fingerprint: "f2" })] }, "/courses/c")).not.toBe(v(base, "/courses/c"));
    expect(v({ ...base, now: inDays(1) }, "/courses/c")).not.toBe(v(base, "/courses/c"));
    // Notifications follow the account's own data, not the course's.
    expect(v({ ...base, courses: [course({ id: "c", role: "STUDENT", fingerprint: "f2" })] }, "/notifications")).toBe(v(base, "/notifications"));
    expect(v({ ...base, userFingerprint: "u2" }, "/notifications")).not.toBe(v(base, "/notifications"));
  });
});
