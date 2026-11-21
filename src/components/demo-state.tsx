import { StatusBadge } from "@/components/status-badge";
import type { StudentDemoState } from "@/domain/student-demo";

/** The student's demo state as a badge (see `studentDemoState`). */
export function DemoStateBadge({ state, maxMarks }: { state: StudentDemoState; maxMarks: number }) {
  switch (state.kind) {
    case "BOOKED":
      return <StatusBadge status="BOOKED" />;
    case "IN_PROGRESS":
      return <StatusBadge status="IN_PROGRESS" label="In progress" tone="info" />;
    case "AWAITING_ATTENDANCE":
      return <StatusBadge status="AWAITING_ATTENDANCE" label="Done: waiting for attendance" tone="neutral" />;
    case "MARKS_PENDING":
      return <StatusBadge status="MARKS_PENDING" label="Completed: marks pending" tone="success" />;
    case "MARKED":
      return <StatusBadge status="FINALIZED" label={`Marked: ${state.total ?? "–"} / ${maxMarks}`} tone={state.underReview ? "warning" : "success"} />;
    case "MISSED":
      return <StatusBadge status="NO_SHOW" label="Missed" />;
  }
}

/** One line under the demo card saying what happens next. */
export function demoStateHint(state: StudentDemoState): string | null {
  switch (state.kind) {
    case "IN_PROGRESS":
      return "Your demo is happening now.";
    case "AWAITING_ATTENDANCE":
      return "Your demo slot has ended. Course staff will record your attendance.";
    case "MARKS_PENDING":
      return "Your demo is done. You'll be notified when your marks are released.";
    case "MISSED":
      return "Course staff recorded that you didn't attend this demo. If that's wrong, or you need another slot, send a request below.";
    default:
      return null;
  }
}
