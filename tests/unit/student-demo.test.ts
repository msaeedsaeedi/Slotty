import { describe, expect, it } from "vitest";
import { studentDemoState, visibleMarks } from "@/domain/student-demo";

const startsAt = new Date("2026-12-01T10:00:00Z");
const endsAt = new Date("2026-12-01T10:15:00Z");
const before = new Date("2026-12-01T09:59:59Z");
const during = new Date("2026-12-01T10:05:00Z");
const after = new Date("2026-12-01T10:15:00Z");
const booking = (status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW") => ({ status, startsAt, endsAt });

describe("studentDemoState", () => {
  it("is Booked before the slot", () => {
    expect(studentDemoState({ booking: booking("BOOKED"), marks: null, now: before })).toEqual({ kind: "BOOKED" });
  });

  it("is In progress from the start until the end", () => {
    expect(studentDemoState({ booking: booking("BOOKED"), marks: null, now: startsAt })).toEqual({ kind: "IN_PROGRESS" });
    expect(studentDemoState({ booking: booking("BOOKED"), marks: null, now: during })).toEqual({ kind: "IN_PROGRESS" });
  });

  it("waits for attendance once the slot has ended", () => {
    expect(studentDemoState({ booking: booking("BOOKED"), marks: null, now: after })).toEqual({ kind: "AWAITING_ATTENDANCE" });
  });

  it("is Completed with marks pending after attendance, whatever the time", () => {
    expect(studentDemoState({ booking: booking("COMPLETED"), marks: null, now: after })).toEqual({ kind: "MARKS_PENDING" });
    // Staff can record attendance early.
    expect(studentDemoState({ booking: booking("COMPLETED"), marks: null, now: during })).toEqual({ kind: "MARKS_PENDING" });
  });

  it("is Missed after a no-show", () => {
    expect(studentDemoState({ booking: booking("NO_SHOW"), marks: null, now: after })).toEqual({ kind: "MISSED" });
  });

  it("is Marked once marks are released, even without a completed booking", () => {
    const marks = { total: 8, underReview: false };
    expect(studentDemoState({ booking: booking("COMPLETED"), marks, now: after })).toEqual({ kind: "MARKED", total: 8, underReview: false });
    expect(studentDemoState({ booking: booking("BOOKED"), marks, now: after })).toEqual({ kind: "MARKED", total: 8, underReview: false });
    expect(studentDemoState({ booking: null, marks, now: after })).toEqual({ kind: "MARKED", total: 8, underReview: false });
  });

  it("has no state without a booking or with only a cancelled one", () => {
    expect(studentDemoState({ booking: null, marks: null, now: after })).toBeNull();
    expect(studentDemoState({ booking: booking("CANCELLED"), marks: null, now: after })).toBeNull();
  });
});

describe("visibleMarks", () => {
  it("shows finalized marks", () => {
    expect(visibleMarks({ status: "FINALIZED", totalMarks: 9, released: null })).toEqual({ total: 9, underReview: false });
  });

  it("keeps showing released marks while staff correct them", () => {
    expect(visibleMarks({ status: "RETURNED", totalMarks: 4, released: { totalMarks: 9, maxMarks: 10 } })).toEqual({ total: 9, underReview: true });
  });

  it("hides drafts and marks awaiting review", () => {
    expect(visibleMarks({ status: "DRAFT", totalMarks: 7, released: null })).toBeNull();
    expect(visibleMarks({ status: "SUBMITTED", totalMarks: 7, released: null })).toBeNull();
    expect(visibleMarks(null)).toBeNull();
  });
});
