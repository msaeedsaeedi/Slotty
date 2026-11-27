import { describe, expect, it } from "vitest";
import { buildCalendar, DEMO_ALARMS_MINUTES, icsDate, icsEscape, icsFold } from "@/domain/ics";

describe("ics", () => {
  it("formats UTC timestamps", () => {
    expect(icsDate(new Date("2026-10-05T09:15:00.000Z"))).toBe("20261005T091500Z");
  });
  it("escapes text values", () => {
    expect(icsEscape("Lab 1, Building A; floor 2\nbring laptop \\ charger")).toBe("Lab 1\\, Building A\\; floor 2\\nbring laptop \\\\ charger");
  });
  it("folds long lines at 75 octets", () => {
    const folded = icsFold(`DESCRIPTION:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });
  it("builds a calendar with stable UIDs and CRLF line endings", () => {
    const ics = buildCalendar({
      name: "Uniflow",
      now: new Date("2026-10-01T00:00:00Z"),
      events: [{ uid: "booking-1@slotty", start: new Date("2026-10-05T09:00:00Z"), end: new Date("2026-10-05T09:15:00Z"), summary: "CS101 demo", location: "Lab 1" }],
    });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:booking-1@slotty\r\n");
    expect(ics).toContain("DTSTART:20261005T090000Z\r\n");
    expect(ics).toContain("LOCATION:Lab 1\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("adds display alarms before the start, so the device's calendar reminds offline", () => {
    const ics = buildCalendar({
      name: "Uniflow",
      events: [{ uid: "b@x", start: new Date("2026-10-05T09:00:00Z"), end: new Date("2026-10-05T09:15:00Z"), summary: "CS101 demo", alarmsMinutesBefore: DEMO_ALARMS_MINUTES }],
    });
    expect(ics.match(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:CS101 demo\r\nTRIGGER:-PT(\d+)M\r\nEND:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-PT60M\r\n");
    expect(ics).toContain("TRIGGER:-PT10M\r\n");
    // Alarms sit inside the event.
    expect(ics.indexOf("END:VALARM")).toBeLessThan(ics.indexOf("END:VEVENT"));
  });
  it("adds no alarms unless asked", () => {
    const ics = buildCalendar({ name: "U", events: [{ uid: "b@x", start: new Date(0), end: new Date(60_000), summary: "x" }] });
    expect(ics).not.toContain("VALARM");
  });
});
