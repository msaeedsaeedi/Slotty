import { fmt } from "@/lib/time";
import { db } from "@/server/db";
import { announceBookingOpen } from "./assignments";
import { audit } from "./audit";
import { notify } from "./notify";

/**
 * Scheduled jobs run by the worker. Each one is idempotent: it records what it
 * has done, so running it twice (or on two workers) doesn't notify twice.
 */

/** Tell students booking is open once a future `bookingOpensAt` arrives. */
export async function announceOpenedBookings(now = new Date()): Promise<number> {
  const due = await db.demoPolicy.findMany({
    where: { openAnnouncedAt: null, bookingOpensAt: { lte: now }, assignment: { status: "PUBLISHED", course: { archived: false } } },
    include: { assignment: { include: { course: true } } },
    take: 100,
  });
  let announced = 0;
  for (const p of due) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.demoPolicy.updateMany({ where: { assignmentId: p.assignmentId, openAnnouncedAt: null }, data: { openAnnouncedAt: now } });
      if (claimed.count === 0) return;
      await announceBookingOpen(tx, p.assignment);
      announced++;
    });
  }
  return announced;
}

const HOUR = 3_600_000;
/** How long before the demo window ends unbooked students get a last-chance nudge. */
export const NUDGE_HOURS = 48;

/** Nudge students who still haven't booked, once, shortly before the demo window ends. */
export async function nudgeUnbookedStudents(now = new Date()): Promise<number> {
  const due = await db.demoPolicy.findMany({
    where: {
      nudgeSentAt: null,
      windowEnd: { gt: now, lte: new Date(now.getTime() + NUDGE_HOURS * HOUR) },
      OR: [{ bookingOpensAt: null }, { bookingOpensAt: { lte: now } }],
      assignment: { status: "PUBLISHED", course: { archived: false } },
    },
    include: { assignment: { include: { course: true } } },
    take: 100,
  });
  let nudged = 0;
  for (const p of due) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.demoPolicy.updateMany({ where: { assignmentId: p.assignmentId, nudgeSentAt: null }, data: { nudgeSentAt: now } });
      if (claimed.count === 0) return;
      const a = p.assignment;
      const [students, booked] = await Promise.all([
        tx.enrollment.findMany({ where: { courseId: a.courseId, role: "STUDENT" }, select: { userId: true } }),
        tx.booking.findMany({ where: { assignmentId: a.id, status: { not: "CANCELLED" } }, select: { studentId: true } }),
      ]);
      const done = new Set(booked.map((b) => b.studentId));
      const targets = students.map((s) => s.userId).filter((id) => !done.has(id));
      await notify(tx, targets, {
        type: "assignment.book_soon",
        title: `Last chance to book: ${a.title}`,
        body: `You haven't booked your ${a.course.code} demo for ${a.title} yet. Demos end ${fmt(p.windowEnd, a.course.timezone, "EEEE d MMMM 'at' HH:mm")}. If no time works, send a request to your TA from the assignment page.`,
        link: `/courses/${a.courseId}/assignments/${a.id}`,
      });
      nudged += targets.length;
    });
  }
  return nudged;
}

/** Close booking automatically once the demo window has ended. */
export async function closeEndedAssignments(now = new Date()): Promise<number> {
  const ended = await db.assignment.findMany({
    where: { status: "PUBLISHED", policy: { windowEnd: { lte: now } } },
    select: { id: true },
    take: 100,
  });
  for (const a of ended) {
    await db.$transaction(async (tx) => {
      const r = await tx.assignment.updateMany({ where: { id: a.id, status: "PUBLISHED" }, data: { status: "CLOSED" } });
      if (r.count === 0) return;
      await tx.waitlistEntry.deleteMany({ where: { assignmentId: a.id } });
      await audit(tx, null, { action: "assignment.auto_close", entityType: "Assignment", entityId: a.id });
    });
  }
  return ended.length;
}

/** Local hours in which the morning agenda goes out. */
const AGENDA_HOURS = [6, 11] as const;

/**
 * Email each host a morning list of the demos they're running today (in the
 * course timezone), once per local day. Hosts can turn it off on their account page.
 */
export async function sendDailyAgendas(now = new Date()): Promise<number> {
  const upcoming = await db.booking.findMany({
    where: { status: "BOOKED", slot: { status: { not: "CANCELLED" }, startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } } },
    include: {
      slot: { include: { venue: true, ta: { select: { id: true, name: true, emailAgenda: true, agendaSentAt: true } } } },
      student: { select: { name: true } },
      assignment: { include: { course: true } },
    },
    orderBy: { slot: { startsAt: "asc" } },
  });
  const byHost = new Map<string, typeof upcoming>();
  for (const b of upcoming) byHost.set(b.slot.taId, [...(byHost.get(b.slot.taId) ?? []), b]);

  let sent = 0;
  for (const [taId, all] of byHost) {
    const host = all[0].slot.ta;
    if (!host.emailAgenda) continue;
    const tz = all[0].assignment.course.timezone;
    const hour = Number(fmt(now, tz, "H"));
    const today = fmt(now, tz, "yyyy-MM-dd");
    if (hour < AGENDA_HOURS[0] || hour >= AGENDA_HOURS[1]) continue;
    if (host.agendaSentAt && fmt(host.agendaSentAt, tz, "yyyy-MM-dd") === today) continue;
    const todays = all.filter((b) => fmt(b.slot.startsAt, b.assignment.course.timezone, "yyyy-MM-dd") === today);
    if (todays.length === 0) continue;

    await db.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: taId, OR: [{ agendaSentAt: null }, { agendaSentAt: { lt: new Date(now.getTime() - 12 * HOUR) } }] },
        data: { agendaSentAt: now },
      });
      if (claimed.count === 0) return;
      const lines = todays.map(
        (b) =>
          `${fmt(b.slot.startsAt, b.assignment.course.timezone, "HH:mm")}–${fmt(b.slot.endsAt, b.assignment.course.timezone, "HH:mm")}  ${b.student.name} · ${b.assignment.course.code} ${b.assignment.title} · ${b.slot.venue?.name ?? "no venue"}`,
      );
      await notify(tx, [taId], {
        type: "agenda.daily",
        title: `Today: ${todays.length} demo${todays.length === 1 ? "" : "s"}`,
        body: `Your demos today (${tz}):\n\n${lines.join("\n")}`,
        link: `/courses/${todays[0].assignment.courseId}/manage/today`,
        inApp: false,
      });
      sent++;
    });
  }
  return sent;
}
