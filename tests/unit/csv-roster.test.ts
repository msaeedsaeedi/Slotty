import { describe, expect, it } from "vitest";
import { parseRoster } from "@/domain/csv-roster";

describe("parseRoster", () => {
  it("parses the Slotty template", () => {
    const res = parseRoster("email,name,role,section\nAda@Uni.edu,Ada Lovelace,student,A\nbob@uni.edu,Bob,TA,");
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { email: "ada@uni.edu", name: "Ada Lovelace", role: "STUDENT", section: "A" },
      { email: "bob@uni.edu", name: "Bob", role: "TA", section: null },
    ]);
  });

  it("accepts Google Classroom style headers", () => {
    const res = parseRoster("First Name,Last Name,Email Address\nGrace,Hopper,grace@uni.edu");
    expect(res.rows).toEqual([{ email: "grace@uni.edu", name: "Grace Hopper", role: "STUDENT", section: null }]);
  });

  it("reports bad emails, duplicates and unknown roles with line numbers", () => {
    const res = parseRoster("email,role\nnot-an-email,student\na@uni.edu,student\nA@uni.edu,student\nc@uni.edu,dean");
    expect(res.rows.map((r) => r.email)).toEqual(["a@uni.edu"]);
    expect(res.errors.map((e) => e.line)).toEqual([2, 4, 5]);
  });

  it("requires an email column", () => {
    const res = parseRoster("name\nAda");
    expect(res.errors[0].message).toMatch(/email/);
  });

  it("falls back to the email local part for a name", () => {
    expect(parseRoster("email\nzed@uni.edu").rows[0].name).toBe("zed");
  });
});
