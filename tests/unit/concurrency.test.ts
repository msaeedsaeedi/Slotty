import { describe, expect, it } from "vitest";
import { mapLimit } from "@/lib/concurrency";

describe("mapLimit", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10, 2], 3, async (ms) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return ms * 2;
    });
    expect(out).toEqual([60, 10, 40, 2, 20, 4]);
    expect(peak).toBe(3);
  });
  it("handles an empty list", async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([]);
  });
});
