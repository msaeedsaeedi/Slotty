/**
 * What a student is told about their demo for one assignment, worked out from the slot time and
 * the booking and evaluation status together (the booking status alone stays "BOOKED" until
 * staff record attendance). One state, used everywhere a student sees their demo.
 */
export type StudentDemoState =
  | { kind: "BOOKED" }
  | { kind: "IN_PROGRESS" }
  | { kind: "AWAITING_ATTENDANCE" }
  | { kind: "MARKS_PENDING" }
  | { kind: "MARKED"; total: number | null; underReview: boolean }
  | { kind: "MISSED" };

/** Marks the student may see: finalized ones, or the last released ones while staff correct them. */
export interface VisibleMarks {
  total: number | null;
  /** Staff reopened the marks to correct them; the student still sees the released ones. */
  underReview: boolean;
}

/** The marks a student may see from an evaluation, or null when none are released. */
export function visibleMarks(
  evaluation: { status: "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED"; totalMarks: number | null; released: unknown } | null,
): VisibleMarks | null {
  if (!evaluation) return null;
  if (evaluation.status === "FINALIZED") return { total: evaluation.totalMarks, underReview: false };
  if (evaluation.released && typeof evaluation.released === "object") {
    const total = (evaluation.released as { totalMarks?: unknown }).totalMarks;
    return { total: typeof total === "number" ? total : null, underReview: true };
  }
  return null;
}

/**
 * The student's demo state, or null when there's no demo to describe (nothing booked, or only
 * cancelled bookings, and no released marks). Released marks win: staff may mark a demo whose
 * booking was never completed, or a student without a booking.
 */
export function studentDemoState(args: {
  booking: { status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"; startsAt: Date; endsAt: Date } | null;
  marks: VisibleMarks | null;
  now: Date;
}): StudentDemoState | null {
  const { booking, marks, now } = args;
  if (marks) return { kind: "MARKED", total: marks.total, underReview: marks.underReview };
  if (!booking) return null;
  switch (booking.status) {
    case "CANCELLED":
      return null;
    case "NO_SHOW":
      return { kind: "MISSED" };
    case "COMPLETED":
      return { kind: "MARKS_PENDING" };
    case "BOOKED":
      if (now < booking.startsAt) return { kind: "BOOKED" };
      if (now < booking.endsAt) return { kind: "IN_PROGRESS" };
      return { kind: "AWAITING_ATTENDANCE" };
  }
}
