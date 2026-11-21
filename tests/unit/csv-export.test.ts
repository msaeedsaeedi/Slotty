import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { safeCell, toSafeCsv } from "@/lib/csv";

describe("safeCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "=HYPERLINK(\"http://x\")"])("prefixes a formula: %s", (v) => {
    expect(safeCell(v)).toBe(`'${v}`);
  });

  it.each(["  =1+1", " +cmd", " -1", "   @x"])("prefixes a formula after leading spaces: %j", (v) => {
    expect(safeCell(v)).toBe(`'${v}`);
  });

  it.each(["\tvalue", "\rvalue", "\t=1+1"])("prefixes a leading tab or carriage return: %j", (v) => {
    expect(safeCell(v)).toBe(`'${v}`);
  });

  it.each(["Ada Lovelace", "ada@uni.edu", "a-b", "Total = 5", "", "pending"])("leaves plain text alone: %j", (v) => {
    expect(safeCell(v)).toBe(v);
  });

  it("leaves numbers and empty values alone", () => {
    expect(safeCell(-3)).toBe(-3);
    expect(safeCell(7.5)).toBe(7.5);
    expect(safeCell(null)).toBeNull();
    expect(safeCell(undefined)).toBeUndefined();
  });
});

describe("toSafeCsv", () => {
  it("escapes header cells built from rubric labels", () => {
    const csv = toSafeCsv(["student_name", "=cmd() (/5)", " +x (/5)"], [["Ada", 3, 2]]);
    const [header] = Papa.parse<string[]>(csv).data;
    expect(header).toEqual(["student_name", "'=cmd() (/5)", "' +x (/5)"]);
  });

  it("escapes data cells and keeps the column order", () => {
    const csv = toSafeCsv(["name", "score", "feedback"], [["@evil", 4, "\t=1"], ["Bob", null, "good"]]);
    expect(Papa.parse<string[]>(csv).data).toEqual([
      ["name", "score", "feedback"],
      ["'@evil", "4", "'\t=1"],
      ["Bob", "", "good"],
    ]);
  });

  it("writes the header row even with no students", () => {
    expect(toSafeCsv(["a", "b"], []).trim()).toBe("a,b");
  });
});
