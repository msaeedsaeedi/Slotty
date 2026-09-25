import { describe, expect, it } from "vitest";
import { generateSlots, overlaps } from "@/domain/slots";

const d = (iso: string) => new Date(iso);
const window = { windowStart: d("2026-10-01T00:00:00Z"), windowEnd: d("2026-10-31T00:00:00Z") };

describe("generateSlots", () => {
  it("slices a block into back-to-back slots", () => {
    const slots = generateSlots({
      ...window,
      blockStart: d("2026-10-05T09:00:00Z"),
      blockEnd: d("2026-10-05T10:00:00Z"),
      slotDurationMin: 15,
      bufferMin: 0,
    });
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-05T09:15:00.000Z",
      "2026-10-05T09:30:00.000Z",
      "2026-10-05T09:45:00.000Z",
    ]);
    expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-10-05T10:00:00.000Z");
  });

  it("applies buffers and drops a partial trailing slot", () => {
    const slots = generateSlots({
      ...window,
      blockStart: d("2026-10-05T09:00:00Z"),
      blockEnd: d("2026-10-05T10:00:00Z"),
      slotDurationMin: 20,
      bufferMin: 5,
    });
    // 09:00-09:20, 09:25-09:45; 09:50-10:10 would overrun the block.
    expect(slots).toHaveLength(2);
    expect(slots[1].startsAt.toISOString()).toBe("2026-10-05T09:25:00.000Z");
  });

  it("clips blocks to the demo window", () => {
    const slots = generateSlots({
      windowStart: d("2026-10-05T09:30:00Z"),
      windowEnd: d("2026-10-05T10:00:00Z"),
      blockStart: d("2026-10-05T09:00:00Z"),
      blockEnd: d("2026-10-05T11:00:00Z"),
      slotDurationMin: 15,
      bufferMin: 0,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].startsAt.toISOString()).toBe("2026-10-05T09:30:00.000Z");
  });

  it("returns nothing when the block is outside the window or too short", () => {
    expect(
      generateSlots({
        ...window,
        blockStart: d("2026-11-05T09:00:00Z"),
        blockEnd: d("2026-11-05T10:00:00Z"),
        slotDurationMin: 15,
        bufferMin: 0,
      }),
    ).toEqual([]);
    expect(
      generateSlots({
        ...window,
        blockStart: d("2026-10-05T09:00:00Z"),
        blockEnd: d("2026-10-05T09:10:00Z"),
        slotDurationMin: 15,
        bufferMin: 0,
      }),
    ).toEqual([]);
  });

  it("rejects invalid durations", () => {
    expect(() =>
      generateSlots({ ...window, blockStart: window.windowStart, blockEnd: window.windowEnd, slotDurationMin: 0, bufferMin: 0 }),
    ).toThrow();
  });
});

describe("overlaps", () => {
  it("treats touching intervals as non-overlapping", () => {
    const a = { startsAt: d("2026-10-05T09:00:00Z"), endsAt: d("2026-10-05T09:15:00Z") };
    const b = { startsAt: d("2026-10-05T09:15:00Z"), endsAt: d("2026-10-05T09:30:00Z") };
    const c = { startsAt: d("2026-10-05T09:10:00Z"), endsAt: d("2026-10-05T09:20:00Z") };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, c)).toBe(true);
  });
});
