import { describe, expect, it } from "vitest";
import { canSubmit, canTransition, computeTotal, nextStatus, validateScores } from "@/domain/evaluation";

const criteria = [
  { id: "c1", label: "Functionality", maxPoints: 6 },
  { id: "c2", label: "Code quality", maxPoints: 4 },
];

describe("evaluation state machine", () => {
  it("submits to the instructor when the course has one", () => {
    expect(nextStatus("DRAFT", "submit", { courseHasInstructor: true })).toBe("SUBMITTED");
  });
  it("finalizes directly when the TA runs the course alone", () => {
    expect(nextStatus("DRAFT", "submit", { courseHasInstructor: false })).toBe("FINALIZED");
    expect(nextStatus("RETURNED", "submit", { courseHasInstructor: false })).toBe("FINALIZED");
  });
  it("supports instructor finalize / return and unlock", () => {
    expect(nextStatus("SUBMITTED", "finalize", { courseHasInstructor: true })).toBe("FINALIZED");
    expect(nextStatus("SUBMITTED", "return", { courseHasInstructor: true })).toBe("RETURNED");
    expect(nextStatus("FINALIZED", "unlock", { courseHasInstructor: true })).toBe("RETURNED");
  });
  it("locks submitted and finalized evaluations against edits", () => {
    expect(canTransition("SUBMITTED", "save").ok).toBe(false);
    expect(canTransition("FINALIZED", "save").ok).toBe(false);
    expect(canTransition("FINALIZED", "submit").ok).toBe(false);
    expect(() => nextStatus("DRAFT", "finalize", { courseHasInstructor: true })).toThrow();
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
