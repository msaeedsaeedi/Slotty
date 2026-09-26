import { describe, expect, it } from "vitest";
import { buildTimeline, formatLeft, formatUntil, type AttendanceStatus } from "@/domain/demo-day";

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
let n = 0;
const slot = (start: string, end: string, ...statuses: AttendanceStatus[]) => ({
  id: `s${++n}`,
  startsAt: at(start),
  endsAt: at(end),
  bookings: statuses.map((status) => ({ status })),
});

describe("buildTimeline", () => {
  it("splits the day into done, now, next and later", () => {
    const day = [
      slot("09:00", "09:15", "COMPLETED"),
      slot("09:15", "09:30", "BOOKED"), // ended, attendance not recorded
      slot("09:30", "09:45", "BOOKED"), // in progress at 09:35
      slot("09:45", "10:00"), // empty, upcoming
      slot("10:00", "10:15", "BOOKED"),
      slot("10:15", "10:30", "BOOKED"),
    ];
    const t = buildTimeline(day, at("09:35"));
    expect(t.items.map((i) => (i.kind === "slot" ? i.phase : "gap"))).toEqual(["done", "done", "now", "later", "next", "later"]);
    expect(t.current.map((s) => s.id)).toEqual([day[2].id]);
    expect(t.next.map((s) => s.id)).toEqual([day[4].id]);
    expect(t.idleNow).toBe(false);
    expect(t.stats).toEqual({ demos: 5, completed: 1, noShow: 0, needsAttendance: 1, remaining: 3 });
  });

  it("reports an empty slot in progress as idle and still finds the next demo", () => {
    const t = buildTimeline([slot("09:00", "09:15"), slot("09:30", "09:45", "BOOKED")], at("09:05"));
    expect(t.current).toEqual([]);
    expect(t.idleNow).toBe(true);
    expect(t.next).toHaveLength(1);
  });

  it("moves the focus on once the demo in progress has its attendance recorded", () => {
    const day = [slot("09:30", "09:45", "BOOKED"), slot("10:00", "10:15", "BOOKED")];
    expect(buildTimeline(day, at("09:35")).focus).toMatchObject({ kind: "now", slots: [day[0]] });
    day[0].bookings[0].status = "COMPLETED";
    expect(buildTimeline(day, at("09:40")).focus).toMatchObject({ kind: "next", slots: [day[1]] });
    expect(buildTimeline(day, at("11:00")).focus).toEqual({ kind: "done" });
    expect(buildTimeline([], at("11:00")).focus).toEqual({ kind: "empty" });
  });

  it("hides empty past slots but counts them", () => {
    const t = buildTimeline([slot("09:00", "09:15"), slot("09:15", "09:30", "NO_SHOW")], at("12:00"));
    expect(t.items).toHaveLength(1);
    expect(t.hiddenEmptyPast).toBe(1);
    expect(t.stats.noShow).toBe(1);
  });

  it("marks free gaps of 15 minutes or more, measured from the latest end so far", () => {
    const t = buildTimeline(
      [slot("09:00", "10:00", "BOOKED"), slot("09:30", "09:45", "BOOKED"), slot("10:10", "10:20", "BOOKED"), slot("11:00", "11:15", "BOOKED")],
      at("08:00"),
      { gaps: true },
    );
    const gaps = t.items.filter((i) => i.kind === "gap");
    expect(gaps).toEqual([{ kind: "gap", from: at("10:20"), to: at("11:00") }]);
  });

  it("treats parallel slots starting together as all next", () => {
    const t = buildTimeline([slot("10:00", "10:15", "BOOKED"), slot("10:00", "10:15", "BOOKED", "BOOKED")], at("09:00"));
    expect(t.next).toHaveLength(2);
    expect(t.stats.remaining).toBe(3);
  });
});

describe("countdown text", () => {
  it("formats time until a start", () => {
    expect(formatUntil(10_000)).toBe("now");
    expect(formatUntil(5 * 60_000)).toBe("in 5 min");
    expect(formatUntil(80 * 60_000)).toBe("in 1 h 20 min");
    expect(formatUntil(120 * 60_000)).toBe("in 2 h");
  });
  it("formats time left", () => {
    expect(formatLeft(11.2 * 60_000)).toBe("12 min left");
    expect(formatLeft(-1)).toBe("ending now");
  });
});
