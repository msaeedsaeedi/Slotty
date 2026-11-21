import { describe, expect, it } from "vitest";
import { checkDemoWindow } from "@/domain/assignments";
import { checkTotalMarks, hasMarkPrecision, validateScores } from "@/domain/evaluation";
import { canScheduleBlock } from "@/domain/slots";
import { checkReason, REASON_MAX_LENGTH } from "@/domain/text";
import { fieldProps } from "@/lib/field-props";
import { assignmentFields, policyFields, requestInput, venueInput } from "@/lib/form-schemas";

const now = new Date("2026-12-01T10:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe("checkDemoWindow (creating an assignment)", () => {
  it("accepts a window that hasn't ended", () => {
    expect(checkDemoWindow({ windowStart: h(-2), windowEnd: h(2), now }).ok).toBe(true);
    expect(checkDemoWindow({ windowStart: h(24), windowEnd: h(48), now }).ok).toBe(true);
  });
  it("refuses a window that is already over", () => {
    expect(checkDemoWindow({ windowStart: h(-48), windowEnd: h(-24), now })).toMatchObject({ ok: false, reason: expect.stringMatching(/already ended/) });
    expect(checkDemoWindow({ windowStart: h(-1), windowEnd: now, now }).ok).toBe(false);
  });
  it("refuses an end before the start", () => {
    expect(checkDemoWindow({ windowStart: h(5), windowEnd: h(4), now }).ok).toBe(false);
  });
});

describe("canScheduleBlock", () => {
  it("accepts hours later than now", () => {
    expect(canScheduleBlock({ startsAt: h(0.5), now }).ok).toBe(true);
  });
  it("refuses hours that have already started, today included", () => {
    expect(canScheduleBlock({ startsAt: now, now }).ok).toBe(false);
    expect(canScheduleBlock({ startsAt: h(-3), now }).ok).toBe(false);
    expect(canScheduleBlock({ startsAt: h(-72), now }).ok).toBe(false);
  });
});

describe("mark precision", () => {
  it.each([8, 8.5, 8.25, 0.1 + 0.2, 9.99])("accepts %s", (n) => expect(hasMarkPrecision(n)).toBe(true));
  it.each([8.253, 5.123456, 0.001])("refuses %s", (n) => expect(hasMarkPrecision(n)).toBe(false));

  it("applies to rubric scores and totals", () => {
    const criteria = [{ id: "a", label: "Code", maxPoints: 6 }];
    expect(validateScores([{ criterionId: "a", points: 5.25 }], criteria).ok).toBe(true);
    expect(validateScores([{ criterionId: "a", points: 5.125 }], criteria)).toMatchObject({ ok: false, reason: expect.stringMatching(/2 decimals/) });
    expect(checkTotalMarks(7.5, 10).ok).toBe(true);
    expect(checkTotalMarks(7.555, 10).ok).toBe(false);
    expect(checkTotalMarks(11, 10).ok).toBe(false);
  });
});

describe("checkReason", () => {
  it("requires text unless optional", () => {
    expect(checkReason("  ").ok).toBe(false);
    expect(checkReason("", { required: false }).ok).toBe(true);
    expect(checkReason(null, { missing: "Tell the student why." })).toEqual({ ok: false, reason: "Tell the student why." });
  });
  it(`caps reasons at ${REASON_MAX_LENGTH} characters`, () => {
    expect(checkReason("x".repeat(REASON_MAX_LENGTH)).ok).toBe(true);
    expect(checkReason("x".repeat(REASON_MAX_LENGTH + 1)).ok).toBe(false);
    expect(checkReason("x".repeat(REASON_MAX_LENGTH + 1), { required: false }).ok).toBe(false);
  });
});

describe("fieldProps mirrors the server's schemas", () => {
  it("reads number limits", () => {
    expect(fieldProps(policyFields, "slotDurationMin")).toEqual({ required: true, min: 5, max: 480, step: 1 });
    expect(fieldProps(policyFields, "freezeHours")).toEqual({ required: true, min: 0, max: 336, step: 1 });
    expect(fieldProps(assignmentFields, "maxMarks", { step: 0.01 })).toMatchObject({ required: true, max: 10_000, step: 0.01 });
  });
  it("reads text limits and optional fields", () => {
    expect(fieldProps(venueInput, "name")).toEqual({ required: true, maxLength: 120 });
    expect(fieldProps(venueInput, "location")).toEqual({ maxLength: 200 });
    expect(fieldProps(venueInput, "meetingUrl")).toEqual({ maxLength: 500 });
    expect(fieldProps(requestInput, "message")).toEqual({ required: true, minLength: 5, maxLength: REASON_MAX_LENGTH });
  });
});

describe("venue meeting links", () => {
  it("accepts http(s) web addresses only", () => {
    expect(venueInput.safeParse({ name: "Lab", meetingUrl: "https://meet.google.com/abc" }).success).toBe(true);
    expect(venueInput.safeParse({ name: "Lab", meetingUrl: "ftp://files.example.com" }).success).toBe(false);
    expect(venueInput.safeParse({ name: "Lab", meetingUrl: "https://" }).success).toBe(false);
    expect(venueInput.safeParse({ name: "Lab", meetingUrl: "" }).success).toBe(true);
  });
});
