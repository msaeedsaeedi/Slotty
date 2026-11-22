import { describe, expect, it } from "vitest";
import { canReadPrivateNote, canSubmit, canTransition, canWithdraw, computeTotal, isHeld, nextStatus, RELEASE_HOLD_HOURS, releaseAtFor, submitRoute, validateScores } from "@/domain/evaluation";

const criteria = [
  { id: "c1", label: "Functionality", maxPoints: 6 },
  { id: "c2", label: "Code quality", maxPoints: 4 },
];

describe("evaluation state machine", () => {
  it("routes a submit to review, a 24-hour hold, or straight to final (ADR-032)", () => {
    expect(submitRoute("TA", true)).toBe("review");
    expect(submitRoute("TA", false)).toBe("hold");
    expect(submitRoute("INSTRUCTOR", true)).toBe("final");
    expect(submitRoute("INSTRUCTOR", false)).toBe("final");
  });
  it("keeps reviewed and held submissions SUBMITTED; only an instructor's submit is final at once", () => {
    expect(nextStatus("DRAFT", "submit", { route: "review" })).toBe("SUBMITTED");
    expect(nextStatus("DRAFT", "submit", { route: "hold" })).toBe("SUBMITTED");
    expect(nextStatus("RETURNED", "submit", { route: "hold" })).toBe("SUBMITTED");
    expect(nextStatus("DRAFT", "submit", { route: "final" })).toBe("FINALIZED");
  });
  it("supports instructor finalize / return, unlock, withdraw and release", () => {
    expect(nextStatus("SUBMITTED", "finalize")).toBe("FINALIZED");
    expect(nextStatus("SUBMITTED", "return")).toBe("RETURNED");
    expect(nextStatus("FINALIZED", "unlock")).toBe("RETURNED");
    expect(nextStatus("SUBMITTED", "withdraw")).toBe("DRAFT");
    expect(nextStatus("SUBMITTED", "release")).toBe("FINALIZED");
    expect(() => nextStatus("FINALIZED", "withdraw")).toThrow();
  });
  it("locks submitted and finalized evaluations against edits", () => {
    expect(canTransition("SUBMITTED", "save").ok).toBe(false);
    expect(canTransition("FINALIZED", "save").ok).toBe(false);
    expect(canTransition("FINALIZED", "submit").ok).toBe(false);
    expect(() => nextStatus("DRAFT", "finalize")).toThrow();
  });
});

describe("scores", () => {
  it("validates ranges and unknown criteria", () => {
    expect(validateScores([{ criterionId: "c1", points: 6 }], criteria).ok).toBe(true);
    expect(validateScores([{ criterionId: "c1", points: 7 }], criteria).ok).toBe(false);
    expect(validateScores([{ criterionId: "c1", points: -1 }], criteria).ok).toBe(false);
    expect(validateScores([{ criterionId: "zz", points: 1 }], criteria).ok).toBe(false);
    expect(
      validateScores(
        [
          { criterionId: "c1", points: 1 },
          { criterionId: "c1", points: 2 },
        ],
        criteria,
      ).ok,
    ).toBe(false);
  });
  it("sums totals", () => {
    expect(computeTotal([{ criterionId: "c1", points: 5.5 }, { criterionId: "c2", points: 3.25 }])).toBe(8.75);
  });
  it("requires every criterion and a valid total to submit", () => {
    expect(canSubmit({ criteria, scores: [{ criterionId: "c1", points: 5 }], totalMarks: 5, maxMarks: 10 }).ok).toBe(false);
    expect(canSubmit({ criteria: [], scores: [], totalMarks: null, maxMarks: 10 }).ok).toBe(false);
    expect(canSubmit({ criteria: [], scores: [], totalMarks: 11, maxMarks: 10 }).ok).toBe(false);
    expect(
      canSubmit({
        criteria,
        scores: [
          { criterionId: "c1", points: 5 },
          { criterionId: "c2", points: 4 },
        ],
        totalMarks: 9,
        maxMarks: 10,
      }).ok,
    ).toBe(true);
  });
});

describe("private notes", () => {
  const note = { authorId: "ta1" };
  it("lets the author read their own note", () => {
    expect(canReadPrivateNote(note, { id: "ta1", enrolledRole: "TA" }).ok).toBe(true);
  });
  it("lets enrolled instructors read every note, including ones without an author", () => {
    expect(canReadPrivateNote(note, { id: "inst", enrolledRole: "INSTRUCTOR" }).ok).toBe(true);
    expect(canReadPrivateNote({ authorId: null }, { id: "inst", enrolledRole: "INSTRUCTOR" }).ok).toBe(true);
  });
  it("hides a note from other TAs, and notes without an author from every TA", () => {
    expect(canReadPrivateNote(note, { id: "ta2", enrolledRole: "TA" }).ok).toBe(false);
    expect(canReadPrivateNote({ authorId: null }, { id: "ta1", enrolledRole: "TA" }).ok).toBe(false);
  });
  it("hides notes from admins (not enrolled) and students", () => {
    expect(canReadPrivateNote(note, { id: "admin", enrolledRole: null }).ok).toBe(false);
    expect(canReadPrivateNote(note, { id: "ta1", enrolledRole: "STUDENT" }).ok).toBe(false);
  });
});

describe("held releases (ADR-032)", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const held = { status: "SUBMITTED" as const, releaseAt: releaseAtFor(now), submittedById: "ta1" };
  it("holds for exactly 24 hours", () => {
    expect(RELEASE_HOLD_HOURS).toBe(24);
    expect(releaseAtFor(now).toISOString()).toBe("2026-11-24T10:00:00.000Z");
    expect(isHeld(held)).toBe(true);
    expect(isHeld({ status: "SUBMITTED", releaseAt: null })).toBe(false);
  });
  it("lets the submitting TA or an admin withdraw before the release, nobody else", () => {
    expect(canWithdraw(held, { kind: "staff", id: "ta1" }, now).ok).toBe(true);
    expect(canWithdraw(held, { kind: "admin" }, now).ok).toBe(true);
    expect(canWithdraw(held, { kind: "staff", id: "ta2" }, now).ok).toBe(false);
  });
  it("refuses once the release time has passed, and for marks that aren't held", () => {
    expect(canWithdraw(held, { kind: "staff", id: "ta1" }, held.releaseAt).ok).toBe(false);
    expect(canWithdraw({ ...held, releaseAt: null }, { kind: "admin" }, now).ok).toBe(false);
    expect(canWithdraw({ ...held, status: "FINALIZED" }, { kind: "admin" }, now).ok).toBe(false);
  });
});
