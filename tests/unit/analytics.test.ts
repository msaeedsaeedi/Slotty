import { describe, expect, it } from "vitest";
import {
  allowedWithoutConsent,
  canAnswerSurvey,
  canPromptSurvey,
  canSendFeedback,
  clientEventSchema,
  deviceClass,
  eventTime,
  FEEDBACK_PER_HOUR,
  retentionCutoffs,
  roleKind,
  routeTemplate,
  scrubErrorMessage,
  startOfHour,
  startOfUtcDay,
  SURVEY_INTERVAL_DAYS,
} from "@/domain/analytics";

const now = new Date("2026-11-17T10:30:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("routeTemplate", () => {
  it("replaces ids and tokens with :id and drops the query", () => {
    expect(routeTemplate("/courses/cmhx1y2z30000abcd1234efgh/assignments/cmhx1y2z30001abcd1234efgh?reschedule=1")).toBe("/courses/:id/assignments/:id");
    expect(routeTemplate("/invite/Xk9_3hQ2pLmN8vR4tY6wZ1aB5cD7eF0g")).toBe("/invite/:id");
    expect(routeTemplate("/reset-password/abcdefghijklmnopqrstuvwxyzabcdef")).toBe("/reset-password/:id");
  });
  it("keeps plain words and the root", () => {
    expect(routeTemplate("/")).toBe("/");
    expect(routeTemplate("/admin/insights")).toBe("/admin/insights");
    expect(routeTemplate("/courses/new")).toBe("/courses/new");
  });
  it("rejects anything that isn't an app path", () => {
    expect(routeTemplate("https://evil.example/x")).toBeNull();
    expect(routeTemplate("//evil.example")).toBeNull();
    expect(routeTemplate("/a/%E0%A4%A")).toBeNull();
    expect(routeTemplate("/" + "a/".repeat(13))).toBeNull();
  });
  it("never keeps an email or name typed into a path", () => {
    expect(routeTemplate("/search/ann.lee@uni.edu")).toBe("/search/:id");
  });
});

describe("deviceClass", () => {
  it("tells phones, tablets and computers apart", () => {
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("desktop");
    expect(deviceClass(null)).toBe("desktop");
  });
});

describe("scrubErrorMessage", () => {
  it("removes emails, links, long numbers and tokens", () => {
    const m = scrubErrorMessage("Failed for ann.lee@uni.edu at https://slotty.example/courses/abc?x=1 id cmhx1y2z30000abcd1234 code 123456");
    expect(m).toBe("Failed for <email> at <url> id <id> code <n>");
  });
  it("keeps ordinary words and caps the length", () => {
    expect(scrubErrorMessage("Cannot read properties of undefined (reading 'useReportWebVitals')")).toContain("useReportWebVitals");
    expect(scrubErrorMessage("x".repeat(500)).length).toBe(200);
  });
});

describe("event catalog", () => {
  it("accepts known events and rejects unknown names and free text", () => {
    expect(clientEventSchema.safeParse({ name: "page_view", path: "/", at: 1 }).success).toBe(true);
    expect(clientEventSchema.safeParse({ name: "funnel", path: "/", at: 1, props: { flow: "booking", step: "done" } }).success).toBe(true);
    expect(clientEventSchema.safeParse({ name: "search", path: "/", at: 1, props: { q: "ann" } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ name: "funnel", path: "/", at: 1, props: { flow: "booking", step: "typed anything" } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ name: "web_vital", path: "/", at: 1, props: { metric: "LCP", value: -1, rating: "good" } }).success).toBe(false);
  });
  it("only errors pass without consent", () => {
    expect(allowedWithoutConsent("client_error")).toBe(true);
    expect(allowedWithoutConsent("page_view")).toBe(false);
    expect(allowedWithoutConsent("funnel")).toBe(false);
  });
});

describe("eventTime", () => {
  it("trusts the client clock only within the last hour", () => {
    expect(eventTime(now.getTime() - 5_000, now).getTime()).toBe(now.getTime() - 5_000);
    expect(eventTime(now.getTime() + 60_000, now)).toBe(now);
    expect(eventTime(now.getTime() - 2 * 3_600_000, now)).toBe(now);
  });
});

describe("roleKind", () => {
  it("maps enrolments to one role", () => {
    expect(roleKind({ isAdmin: true, staff: true, student: true })).toBe("admin");
    expect(roleKind({ isAdmin: false, staff: true, student: true })).toBe("both");
    expect(roleKind({ isAdmin: false, staff: true, student: false })).toBe("staff");
    expect(roleKind({ isAdmin: false, staff: false, student: true })).toBe("student");
    expect(roleKind({ isAdmin: false, staff: false, student: false })).toBe("none");
  });
});

describe("canPromptSurvey", () => {
  it("asks the first time and again only after the interval", () => {
    expect(canPromptSurvey(null, now).ok).toBe(true);
    expect(canPromptSurvey({ shownAt: daysAgo(1) }, now).ok).toBe(false);
    expect(canPromptSurvey({ shownAt: daysAgo(SURVEY_INTERVAL_DAYS - 0.01) }, now).ok).toBe(false);
    expect(canPromptSurvey({ shownAt: daysAgo(SURVEY_INTERVAL_DAYS) }, now).ok).toBe(true);
  });
});

describe("canAnswerSurvey", () => {
  it("needs a recent, unanswered prompt", () => {
    expect(canAnswerSurvey(null, now).ok).toBe(false);
    expect(canAnswerSurvey({ shownAt: daysAgo(0.01), answered: false }, now).ok).toBe(true);
    expect(canAnswerSurvey({ shownAt: daysAgo(0.01), answered: true }, now).ok).toBe(false);
    expect(canAnswerSurvey({ shownAt: daysAgo(2), answered: false }, now).ok).toBe(false);
  });
});

describe("canSendFeedback", () => {
  it("needs a message, a valid rating and room in the hourly limit", () => {
    expect(canSendFeedback({ message: "The reschedule button is hard to find", rating: 3 }, 0).ok).toBe(true);
    expect(canSendFeedback({ message: "Fine", rating: null }, 0).ok).toBe(true);
    expect(canSendFeedback({ message: "   ", rating: null }, 0).ok).toBe(false);
    expect(canSendFeedback({ message: "ok", rating: 6 }, 0).ok).toBe(false);
    expect(canSendFeedback({ message: "ok", rating: 2.5 }, 0).ok).toBe(false);
    expect(canSendFeedback({ message: "x".repeat(2001), rating: null }, 0).ok).toBe(false);
    expect(canSendFeedback({ message: "ok", rating: null }, FEEDBACK_PER_HOUR).ok).toBe(false);
  });
});

describe("coarse times and retention", () => {
  it("rounds anonymous timestamps", () => {
    expect(startOfHour(now).toISOString()).toBe("2026-11-17T10:00:00.000Z");
    expect(startOfUtcDay(now).toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
  it("keeps raw events 90 days and totals about 13 months", () => {
    const c = retentionCutoffs(now);
    expect(c.raw.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(c.rollup.toISOString()).toBe("2025-10-13T00:00:00.000Z");
  });
});
