import { toSafeCsv } from "@/lib/csv";
import { fmtData } from "@/lib/time";
import { db } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { listAssignmentRoster } from "./evaluations";

export interface AssignmentProgress {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  /** When booking opens, if set. */
  opensAt: Date | null;
  timezone: string;
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
  /** Slots that aren't cancelled. */
  slots: number;
}

/** Per-assignment counts for the course overview. */
export async function courseProgress(actor: Actor, courseId: string, now = new Date()): Promise<AssignmentProgress[]> {
  await assertCourseRole(db, actor, courseId, STAFF);
  const [students, assignments, bookingGroups, evalGroups, overdueGroups, slotGroups] = await Promise.all([
    db.enrollment.count({ where: { courseId, role: "STUDENT" } }),
    db.assignment.findMany({ where: { courseId }, include: { policy: { select: { bookingOpensAt: true } }, course: { select: { timezone: true } } }, orderBy: { createdAt: "asc" } }),
    db.booking.groupBy({ by: ["assignmentId", "status"], where: { assignment: { courseId } }, _count: true }),
    db.evaluation.groupBy({ by: ["assignmentId", "status"], where: { assignment: { courseId } }, _count: true }),
    db.booking.groupBy({
      by: ["assignmentId", "status"],
      where: { status: "BOOKED", assignment: { courseId }, slot: { endsAt: { lt: now } } },
      _count: true,
    }),
    db.slot.groupBy({ by: ["assignmentId"], where: { assignment: { courseId }, status: { not: "CANCELLED" } }, _count: true }),
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
      opensAt: a.policy?.bookingOpensAt ?? null,
      timezone: a.course.timezone,
      students,
      booked,
      completed,
      noShow,
      unbooked: Math.max(0, students - booked - completed - noShow),
      needsAttendance: count(overdueGroups, a.id, "BOOKED"),
      evaluated: drafts + submitted + finalized,
      submitted,
      finalized,
      slots: slotGroups.find((g) => g.assignmentId === a.id)?._count ?? 0,
    };
  });
}

const criterionHeader = (c: { label: string; maxPoints: number }) => `${c.label} (/${c.maxPoints})`;

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

  const headers = [
    "student_name",
    "student_email",
    "section",
    "slot_start",
    "slot_end",
    "timezone",
    "ta",
    "venue",
    "attendance",
    ...criteria.map(criterionHeader),
    `total (/${assignment.maxMarks})`,
    "evaluation_status",
    "evaluator",
    "feedback",
  ];
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  // Headers and cells are escaped so spreadsheet apps never run them as formulas.
  const rows = roster.map(({ student, section, booking, evaluation }) => [
    student.name,
    student.email,
    section ?? "",
    booking ? fmtData(booking.slot.startsAt, tz, "yyyy-MM-dd HH:mm") : "",
    booking ? fmtData(booking.slot.endsAt, tz, "yyyy-MM-dd HH:mm") : "",
    tz,
    booking?.slot.ta.name ?? "",
    booking?.slot.venue?.name ?? "",
    booking ? { BOOKED: "pending", COMPLETED: "completed", NO_SHOW: "no-show", CANCELLED: "" }[booking.status] : "not booked",
    ...criteria.map((c) => (evaluation ? (scoreBy.get(`${evaluation.id}:${c.id}`) ?? "") : "")),
    evaluation?.totalMarks ?? "",
    // Held marks aren't final yet: an export says so, so nobody copies them on as final (ADR-032).
    evaluation?.status === "SUBMITTED" && evaluation.releaseAt ? `held until ${fmtData(evaluation.releaseAt, tz, "yyyy-MM-dd HH:mm")}` : (evaluation?.status.toLowerCase() ?? "not started"),
    evaluation?.evaluator.name ?? "",
    evaluation?.feedback ?? "",
  ]);
  const csv = toSafeCsv(headers, rows);
  // Exports carry every student's marks out of Slotty, so who took which one is recorded.
  await audit(db, actor, { action: "report.export", entityType: "Assignment", entityId: assignmentId, after: { format: "csv", students: rows.length } });
  return { filename: `${safe(assignment.course.code)}-${safe(assignment.title)}.csv`, csv };
}
