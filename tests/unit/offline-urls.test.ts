import { describe, expect, it } from "vitest";
import { savedPageKey } from "@/lib/offline-urls";

const key = (address: string) => savedPageKey(new URL(address, "https://uniflow.test"));
const mark = "/courses/c/manage/assignments/a/mark";
const evaluate = "/courses/c/manage/assignments/a/evaluate/s";

describe("savedPageKey: which saved page an address opens offline (#173)", () => {
  it("is the path for an address without a query", () => {
    expect(key("/today")).toBe("/today");
    expect(key("/courses/c/assignments/a")).toBe("/courses/c/assignments/a");
  });

  it("refuses parameters that show different content: another day, everyone, the picker", () => {
    expect(key("/today?day=2026-11-28")).toBeNull();
    expect(key("/today?scope=everyone")).toBeNull();
    expect(key("/courses/c/manage/today?day=2026-11-28")).toBeNull();
    expect(key(`${mark}?day=2026-11-27`)).toBeNull();
    expect(key(`${mark}?day=2026-11-26&scope=everyone`)).toBeNull();
    expect(key(`${mark}?student=s`)).toBeNull();
    expect(key(`${mark}?todo=1`)).toBeNull();
    expect(key("/courses/c/assignments/a?reschedule=1")).toBeNull();
  });

  it("keeps parameters that only focus a row or set the back link", () => {
    expect(key(`${mark}?booking=b`)).toBe(mark);
    expect(key(`${mark}?booking=b&back=%2Ftoday`)).toBe(mark);
    expect(key(`${evaluate}?returnTo=%2Ftoday`)).toBe(evaluate);
    // Only on the page they belong to.
    expect(key("/today?booking=b")).toBeNull();
    expect(key(`${mark}?booking=b&day=2026-11-27`)).toBeNull();
  });

  it("ignores the fragment", () => {
    expect(key("/notifications#latest")).toBe("/notifications");
  });
});
