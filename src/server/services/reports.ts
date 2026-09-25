import Papa from "papaparse";
import { fmt } from "@/lib/time";
import { db } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, STAFF, type Actor } from "./access";
import { listAssignmentRoster } from "./evaluations";

export interface AssignmentProgress {
  id: string;
  title: string;
  status: string;
  students: number;
  booked: number;
  completed: number;
  noShow: number;
  unbooked: number;
  /** Demos that have ended but still have no attendance recorded. */
  needsAttendance: number;
  evaluated: number;
  submitted: number;
  finalized: number;
}

/** Per-assignment counts for the course overview. */
export async function courseProgress(actor: Actor, courseId: string, now = new Date()): Promise<AssignmentProgress[]> {
  await assertCourseRole(db, actor, courseId, STAFF);
  const [students, assignments, bookingGroups, evalGroups, overdueGroups] = await Promise.all([
    db.enrollment.count({ where: { courseId, role: "STUDENT" } }),
    db.assignment.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }),
    db.booking.groupBy({ by: ["assignmentId", "status"], where: { assignment: { courseId } }, _count: true }),
    db.evaluation.groupBy({ by: ["assignmentId", "status"], where: { assignment: { courseId } }, _count: true }),
    db.booking.groupBy({
      by: ["assignmentId", "status"],
      where: { status: "BOOKED", assignment: { courseId }, slot: { endsAt: { lt: now } } },
      _count: true,
    }),
  ]);
  const count = (groups: { assignmentId: string; status: string; _count: number }[], id: string, status: string) =>
    groups.find((g) => g.assignmentId === id && g.status === status)?._count ?? 0;

  return assignments.map((a) => {
    const booked = count(bookingGroups, a.id, "BOOKED");
    const completed = count(bookingGroups, a.id, "COMPLETED");
    const noShow = count(bookingGroups, a.id, "NO_SHOW");
    const submitted = count(evalGroups, a.id, "SUBMITTED");
    const finalized = count(evalGroups, a.id, "FINALIZED");
    const drafts = count(evalGroups, a.id, "DRAFT") + count(evalGroups, a.id, "RETURNED");
    return {
      id: a.id,
      title: a.title,
      status: a.status,
      students,
      booked,
      completed,
      noShow,
      unbooked: Math.max(0, students - booked - completed - noShow),
      needsAttendance: count(overdueGroups, a.id, "BOOKED"),
      evaluated: drafts + submitted + finalized,
      submitted,
      finalized,
    };
  });
}

/** One row per student: booking, attendance, rubric scores, total and evaluation status. */
export async function exportAssignmentCsv(actor: Actor, assignmentId: string): Promise<{ filename: string; csv: string }> {
  const { assignment } = await assertAssignmentRole(db, actor, assignmentId, STAFF);
  const tz = assignment.course.timezone;
  const [criteria, roster, scores] = await Promise.all([
    db.rubricCriterion.findMany({ where: { assignmentId }, orderBy: { order: "asc" } }),
    listAssignmentRoster(actor, assignmentId),
    db.evaluationScore.findMany({ where: { evaluation: { assignmentId } } }),
  ]);
  const scoreBy = new Map(scores.map((s) => [`${s.evaluationId}:${s.criterionId}`, s.points]));

  const rows = roster.map(({ student, section, booking, evaluation }) => {
    const row: Record<string, string | number> = {
      student_name: student.name,
      student_email: student.email,
      section: section ?? "",
      slot_start: booking ? fmt(booking.slot.startsAt, tz, "yyyy-MM-dd HH:mm") : "",
      slot_end: booking ? fmt(booking.slot.endsAt, tz, "yyyy-MM-dd HH:mm") : "",
      timezone: tz,
      ta: booking?.slot.ta.name ?? "",
      venue: booking?.slot.venue?.name ?? "",
      attendance: booking ? { BOOKED: "pending", COMPLETED: "completed", NO_SHOW: "no-show", CANCELLED: "" }[booking.status] : "not booked",
    };
    for (const c of criteria) {
      row[`${c.label} (/${c.maxPoints})`] = evaluation ? (scoreBy.get(`${evaluation.id}:${c.id}`) ?? "") : "";
    }
    row[`total (/${assignment.maxMarks})`] = evaluation?.totalMarks ?? "";
    row.evaluation_status = evaluation?.status.toLowerCase() ?? "not started";
    row.evaluator = evaluation?.evaluator.name ?? "";
    row.feedback = evaluation?.feedback ?? "";
    return row;
  });

  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  // Prefix cells that spreadsheet apps would treat as formulas.
  const csv = Papa.unparse(
    rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v]))),
  );
  return { filename: `${safe(assignment.course.code)}-${safe(assignment.title)}.csv`, csv };
}
