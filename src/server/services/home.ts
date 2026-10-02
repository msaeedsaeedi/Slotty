import { fmt } from "@/lib/time";
import { db } from "@/server/db";
import type { Actor } from "./access";
import { ACTIVE_BOOKING } from "./slots";

const DAY = 86_400_000;

/** Something on the user's plate, most urgent first. */
export interface Task {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail?: string;
  href: string;
  action: string;
}

const TONE_ORDER: Record<Task["tone"], number> = { danger: 0, warning: 1, info: 2 };
const byUrgency = (a: Task, b: Task) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The dashboard, split by what the user does in each course: what they have to
 * do as staff (Teaching) and as a student (Studying). Someone who only studies
 * never sees teaching tasks, and the other way round.
 */
export async function getHome(actor: Actor, now = new Date()) {
  const enrollments = await db.enrollment.findMany({
    where: { userId: actor.id },
    include: { course: { include: { _count: { select: { enrollments: { where: { role: "STUDENT" } } } } } } },
    orderBy: { course: { code: "asc" } },
  });
  const courses = enrollments.map((e) => ({ ...e.course, role: e.role, studentCount: e.course._count.enrollments }));
  const active = courses.filter((c) => !c.archived);
  const teach = active.filter((c) => c.role !== "STUDENT");
  const study = active.filter((c) => c.role === "STUDENT");
  const [teaching, studying] = await Promise.all([
    teach.length ? teachingTasks(actor, teach, now) : null,
    study.length ? studyingTasks(actor, study.map((c) => c.id), now) : null,
  ]);
  return {
    teaching: teaching && { courses: teach, tasks: teaching },
    studying: studying && { courses: study, ...studying },
    archived: courses.filter((c) => c.archived),
    hasAnyCourse: courses.length > 0,
  };
}

async function teachingTasks(actor: Actor, courses: { id: string; code: string; role: string }[], now: Date): Promise<Task[]> {
  const ids = courses.map((c) => c.id);
  const instructorOf = courses.filter((c) => c.role === "INSTRUCTOR").map((c) => c.id);
  const inCourses = { assignment: { courseId: { in: ids } } };
  const assignmentSelect = { select: { id: true, title: true, courseId: true, course: { select: { code: true, timezone: true } } } } as const;

  const [overdue, toMark, returned, review, requests, drafts] = await Promise.all([
    db.booking.findMany({
      where: { ...inCourses, status: "BOOKED", slot: { taId: actor.id, status: { not: "CANCELLED" }, endsAt: { lt: now } } },
      select: { slot: { select: { startsAt: true } }, assignment: assignmentSelect },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.booking.findMany({
      where: { ...inCourses, status: "COMPLETED", slot: { taId: actor.id }, OR: [{ evaluation: null }, { evaluation: { status: "DRAFT" } }] },
      select: { assignment: assignmentSelect },
    }),
    db.evaluation.findMany({ where: { ...inCourses, evaluatorId: actor.id, status: "RETURNED" }, select: { assignment: assignmentSelect } }),
    instructorOf.length
      ? db.evaluation.findMany({ where: { status: "SUBMITTED", assignment: { courseId: { in: instructorOf } } }, select: { assignment: assignmentSelect } })
      : [],
    db.studentRequest.findMany({ where: { ...inCourses, status: "OPEN" }, select: { assignment: assignmentSelect } }),
    db.assignment.findMany({
      where: { courseId: { in: ids }, status: "DRAFT" },
      select: { id: true, title: true, courseId: true, course: { select: { code: true } }, _count: { select: { slots: { where: { status: { not: "CANCELLED" } } } } } },
    }),
  ]);

  const tasks: Task[] = [];
  const manage = (a: { courseId: string; id: string }) => `/courses/${a.courseId}/manage/assignments/${a.id}`;

  if (overdue.length) {
    const first = overdue[0];
    const tz = first.assignment.course.timezone;
    tasks.push({
      key: "attendance",
      tone: "danger",
      title: `Record attendance for ${plural(overdue.length, "past demo")}`,
      detail: `Oldest: ${fmt(first.slot.startsAt, tz, "EEE d MMM")} · ${first.assignment.course.code} ${first.assignment.title}`,
      href: `/today?day=${fmt(first.slot.startsAt, tz, "yyyy-MM-dd", "24h")}`,
      action: "Open that day",
    });
  }
  for (const [, group] of groupByAssignment(returned)) {
    const a = group[0].assignment;
    tasks.push({
      key: `returned-${a.id}`,
      tone: "danger",
      title: `${plural(group.length, "evaluation")} returned for changes`,
      detail: `${a.course.code} · ${a.title}`,
      href: `${manage(a)}?tab=students&filter=toMark`,
      action: "Fix",
    });
  }
  for (const [, group] of groupByAssignment(toMark)) {
    const a = group[0].assignment;
    tasks.push({
      key: `mark-${a.id}`,
      tone: "warning",
      title: `Finish marking ${plural(group.length, "demo")}`,
      detail: `${a.course.code} · ${a.title}`,
      href: `${manage(a)}/mark?todo=1`,
      action: "Mark",
    });
  }
  const requestsByCourse = groupBy(requests, (r) => r.assignment.courseId);
  for (const [courseId, group] of requestsByCourse) {
    tasks.push({
      key: `requests-${courseId}`,
      tone: "warning",
      title: `Answer ${plural(group.length, "student request")}`,
      detail: group[0].assignment.course.code,
      href: `/courses/${courseId}/manage/requests`,
      action: "Answer",
    });
  }
  for (const [courseId, group] of groupBy(review, (r) => r.assignment.courseId)) {
    tasks.push({
      key: `review-${courseId}`,
      tone: "info",
      title: `Review ${plural(group.length, "submitted mark")}`,
      detail: group[0].assignment.course.code,
      href: `/courses/${courseId}/manage/review`,
      action: "Review",
    });
  }
  for (const a of drafts) {
    const hasSlots = a._count.slots > 0;
    tasks.push({
      key: `draft-${a.id}`,
      tone: "info",
      title: hasSlots ? `Open booking for ${a.title}` : `Add demo slots to ${a.title}`,
      detail: `${a.course.code} · ${hasSlots ? `${plural(a._count.slots, "slot")} ready; students can't book until you open booking` : "students can't see it yet"}`,
      href: `${manage(a)}${hasSlots ? "" : "?tab=slots"}`,
      action: hasSlots ? "Review & open" : "Add slots",
    });
  }
  return tasks.sort(byUrgency);
}

async function studyingTasks(actor: Actor, courseIds: string[], now: Date) {
  const [assignments, bookings, released] = await Promise.all([
    db.assignment.findMany({
      where: { courseId: { in: courseIds }, status: "PUBLISHED" },
      include: { policy: true, course: { select: { code: true, timezone: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.booking.findMany({
      where: { studentId: actor.id, assignment: { courseId: { in: courseIds } } },
      include: {
        slot: { include: { venue: true, ta: { select: { name: true } } } },
        assignment: { select: { id: true, title: true, courseId: true, course: { select: { code: true, timezone: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.evaluation.findMany({
      where: { studentId: actor.id, status: "FINALIZED", reviewedAt: { gte: new Date(now.getTime() - 14 * DAY) }, assignment: { courseId: { in: courseIds } } },
      select: { totalMarks: true, assignment: { select: { id: true, title: true, maxMarks: true, courseId: true, course: { select: { code: true } } } } },
      orderBy: { reviewedAt: "desc" },
    }),
  ]);

  const tasks: Task[] = [];
  const studentPage = (a: { courseId: string; id: string }) => `/courses/${a.courseId}/assignments/${a.id}`;
  for (const a of assignments) {
    const p = a.policy;
    if (!p || p.windowEnd <= now) continue;
    const mine = bookings.filter((b) => b.assignmentId === a.id);
    if (mine.some((b) => (ACTIVE_BOOKING as readonly string[]).includes(b.status) && b.status !== "NO_SHOW")) continue;
    const tz = a.course.timezone;
    if (mine[0]?.status === "NO_SHOW") {
      tasks.push({
        key: `noshow-${a.id}`,
        tone: "danger",
        title: `You missed your demo for ${a.title}`,
        detail: `${a.course.code} · send your TA a request if you need a new time`,
        href: studentPage(a),
        action: "Open",
      });
      continue;
    }
    if (p.bookingOpensAt && p.bookingOpensAt > now) {
      tasks.push({
        key: `opens-${a.id}`,
        tone: "info",
        title: `Booking for ${a.title} opens ${fmt(p.bookingOpensAt, tz, "EEE d MMM 'at' HH:mm")}`,
        detail: a.course.code,
        href: studentPage(a),
        action: "View",
      });
      continue;
    }
    const closingSoon = p.windowEnd.getTime() - now.getTime() < 3 * DAY;
    tasks.push({
      key: `book-${a.id}`,
      tone: closingSoon ? "danger" : "warning",
      title: `Book your demo for ${a.title}`,
      detail: `${a.course.code} · demos end ${fmt(p.windowEnd, tz, "EEE d MMM")}`,
      href: studentPage(a),
      action: "Book",
    });
  }
  for (const r of released) {
    tasks.push({
      key: `marks-${r.assignment.id}`,
      tone: "info",
      title: `Marks released for ${r.assignment.title}: ${r.totalMarks ?? "–"}/${r.assignment.maxMarks}`,
      detail: r.assignment.course.code,
      href: studentPage(r.assignment),
      action: "See feedback",
    });
  }
  const upcoming = bookings
    .filter((b) => b.status === "BOOKED" && b.slot.endsAt > now)
    .sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime());
  return { tasks: tasks.sort(byUrgency), upcoming };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

const groupByAssignment = <T extends { assignment: { id: string } }>(items: T[]) => groupBy(items, (i) => i.assignment.id);

export type Home = Awaited<ReturnType<typeof getHome>>;
