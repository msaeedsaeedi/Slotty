import { z } from "zod";
import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, assertCourseWritable, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";

export const requestInput = z.object({
  kind: z.enum(["BOOKING_CHANGE", "MARK_QUERY"]),
  message: z.string().trim().min(5, "Tell staff a bit more (at least a few words).").max(2000),
});

const KIND_LABEL = { BOOKING_CHANGE: "booking change", MARK_QUERY: "question about marks" } as const;

/**
 * A student asks course staff for help: a different time (e.g. inside the freeze
 * window or after running out of changes) or a question about released marks.
 * One open request per kind per assignment.
 */
export async function createRequest(actor: Actor, assignmentId: string, input: z.input<typeof requestInput>) {
  const data = requestInput.parse(input);
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, ["STUDENT"]);
    assertCourseWritable(assignment.course);
    const open = await tx.studentRequest.findFirst({ where: { assignmentId, studentId: actor.id, kind: data.kind, status: "OPEN" } });
    if (open) throw new DomainError("You already have an open request — staff will reply to that one.", "CONFLICT");

    const booking = await tx.booking.findFirst({
      where: { assignmentId, studentId: actor.id, status: { not: "CANCELLED" } },
      include: { slot: true },
    });
    if (data.kind === "MARK_QUERY") {
      const ev = await tx.evaluation.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actor.id } } });
      if (ev?.status !== "FINALIZED") throw new DomainError("You can ask about your marks once they've been released.");
    }
    const request = await tx.studentRequest.create({
      data: { kind: data.kind, assignmentId, studentId: actor.id, bookingId: booking?.id, message: data.message },
    });

    // The student's host sees it first; instructors oversee everything. Fall back to all staff.
    const staff = await tx.enrollment.findMany({ where: { courseId: assignment.courseId, role: { in: STAFF } }, select: { userId: true, role: true } });
    const host = booking?.slot.taId;
    const targets = staff.filter((s) => s.role === "INSTRUCTOR" || s.userId === host).map((s) => s.userId);
    await notify(tx, targets.length ? targets : staff.map((s) => s.userId), {
      type: "request.created",
      title: `New ${KIND_LABEL[data.kind]}: ${actor.name}`,
      body: `${actor.name} (${assignment.title}):\n"${data.message}"`,
      link: `/courses/${assignment.courseId}/manage/requests`,
    });
    return request;
  });
}

/** Close a request with a reply to the student. */
export async function resolveRequest(actor: Actor, requestId: string, decision: "RESOLVED" | "DECLINED", response: string) {
  return db.$transaction(async (tx) => {
    const request = await tx.studentRequest.findUnique({ where: { id: requestId }, include: { assignment: { include: { course: true } } } });
    if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
    await assertCourseRole(tx, actor, request.assignment.courseId, STAFF);
    assertCourseWritable(request.assignment.course);
    if (request.status !== "OPEN") throw new DomainError("This request has already been answered.");
    if (decision === "DECLINED" && !response.trim()) throw new DomainError("Tell the student why.");
    await tx.studentRequest.update({
      where: { id: requestId },
      data: { status: decision, response: response.trim() || null, resolvedById: actor.id, resolvedAt: new Date() },
    });
    await notify(tx, [request.studentId], {
      type: "request.answered",
      title: `Your request was ${decision === "RESOLVED" ? "handled" : "declined"}: ${request.assignment.title}`,
      body: `${actor.name} replied to your ${KIND_LABEL[request.kind]}${response.trim() ? `:\n"${response.trim()}"` : "."}`,
      link: `/courses/${request.assignment.courseId}/assignments/${request.assignmentId}`,
    });
    await audit(tx, actor, { action: `request.${decision.toLowerCase()}`, entityType: "StudentRequest", entityId: requestId, after: { response } });
  });
}

/** Staff inbox of requests for a course. */
export async function listRequests(actor: Actor, courseId: string, status: "OPEN" | "CLOSED" = "OPEN") {
  await assertCourseRole(db, actor, courseId, STAFF);
  return db.studentRequest.findMany({
    where: { assignment: { courseId }, status: status === "OPEN" ? "OPEN" : { not: "OPEN" } },
    include: {
      student: { select: { id: true, name: true, email: true } },
      assignment: { select: { id: true, title: true } },
      booking: { include: { slot: { include: { ta: { select: { name: true } } } } } },
      resolvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 200,
  });
}

export function openRequestCount(courseId: string) {
  return db.studentRequest.count({ where: { status: "OPEN", assignment: { courseId } } });
}

/** A student's own requests for one assignment, newest first. */
export function listMyRequests(actor: Actor, assignmentId: string) {
  return db.studentRequest.findMany({
    where: { assignmentId, studentId: actor.id },
    include: { resolvedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
