import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/domain/result";
import { db, type Tx } from "@/server/db";
import { canTakeRole } from "@/domain/roles";
import { courseInput, rolesElsewhere } from "./courses";
import { signalOutbox } from "@/server/outbox-signal";
import { issueInvite, requestPasswordReset } from "./accounts";
import { assertAdmin, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";
import { ACTIVE_BOOKING } from "./slots";

const DAY = 86_400_000;
/** An invite still unaccepted after this long probably went to spam or a typo'd address. */
export const STALE_INVITE_DAYS = 7;

// ─── Overview ────────────────────────────────────────────────────────────────

/**
 * What a platform admin needs to see first: is everything working (email
 * delivery), who is stuck (stale invites), and which courses need an owner.
 */
export async function adminOverview(actor: Actor, now = new Date()) {
  assertAdmin(actor);
  const staleBefore = new Date(now.getTime() - STALE_INVITE_DAYS * DAY);
  const weekAhead = new Date(now.getTime() + 7 * DAY);
  const [byStatus, admins, newUsers, staleInvites, staleInviteCount, courses, staffless, emails, oldestPending, pushFailed, demosWeek, recent] =
    await Promise.all([
      db.user.groupBy({ by: ["status"], _count: true }),
      db.user.count({ where: { isAdmin: true } }),
      db.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      db.user.findMany({
        where: { status: "INVITED", createdAt: { lt: staleBefore } },
        select: { id: true, name: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      db.user.count({ where: { status: "INVITED", createdAt: { lt: staleBefore } } }),
      db.course.groupBy({ by: ["archived"], _count: true }),
      db.course.findMany({
        where: { archived: false, enrollments: { none: { role: { in: STAFF } } } },
        select: { id: true, code: true, title: true, term: true },
        take: 10,
      }),
      db.emailOutbox.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
      db.emailOutbox.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      db.pushMessage.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      db.booking.count({ where: { status: { in: [...ACTIVE_BOOKING] }, slot: { startsAt: { gte: now, lt: weekAhead } } } }),
      adminAuditLog(actor, { take: 8 }),
    ]);
  const users = Object.fromEntries(byStatus.map((r) => [r.status, r._count])) as Partial<Record<"ACTIVE" | "INVITED" | "DISABLED", number>>;
  const mail = Object.fromEntries(emails.map((r) => [r.status, r._count])) as Partial<Record<"PENDING" | "SENT" | "FAILED", number>>;
  return {
    users: { active: users.ACTIVE ?? 0, invited: users.INVITED ?? 0, disabled: users.DISABLED ?? 0, admins, newThisWeek: newUsers },
    staleInvites: { count: staleInviteCount, oldest: staleInvites },
    courses: {
      active: courses.find((c) => !c.archived)?._count ?? 0,
      archived: courses.find((c) => c.archived)?._count ?? 0,
      withoutStaff: staffless,
    },
    email: {
      sent30d: mail.SENT ?? 0,
      failed30d: mail.FAILED ?? 0,
      pending: mail.PENDING ?? 0,
      /** A queue that isn't draining means the worker is down or SMTP is failing. */
      oldestPendingAt: oldestPending?.createdAt ?? null,
    },
    pushFailed7d: pushFailed,
    demosNext7d: demosWeek,
    recent: recent.entries,
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserFilter = "all" | "active" | "invited" | "stale" | "disabled" | "admins" | "no-courses";

export async function adminListUsers(actor: Actor, opts: { q?: string; filter?: UserFilter } | string = {}, now = new Date()) {
  assertAdmin(actor);
  const { q, filter = "all" } = typeof opts === "string" ? { q: opts } : opts;
  const term = q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(term ? { OR: [{ email: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] } : {}),
    ...(filter === "active" && { status: "ACTIVE" }),
    ...(filter === "invited" && { status: "INVITED" }),
    ...(filter === "stale" && { status: "INVITED", createdAt: { lt: new Date(now.getTime() - STALE_INVITE_DAYS * DAY) } }),
    ...(filter === "disabled" && { status: "DISABLED" }),
    ...(filter === "admins" && { isAdmin: true }),
    ...(filter === "no-courses" && { enrollments: { none: {} }, isAdmin: false }),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isAdmin: true,
        createdAt: true,
        enrollments: { select: { role: true } },
        _count: { select: { bookings: { where: { status: "BOOKED", slot: { startsAt: { gt: now } } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.user.count({ where }),
  ]);
  return {
    total,
    users: users.map(({ enrollments, ...u }) => ({
      ...u,
      courses: enrollments.length,
      teaches: enrollments.some((e) => e.role !== "STUDENT"),
      studies: enrollments.some((e) => e.role === "STUDENT"),
    })),
  };
}

/** One user's account, courses, upcoming demos and history, for the admin user page. */
export async function adminGetUser(actor: Actor, userId: string, now = new Date()) {
  assertAdmin(actor);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isAdmin: true,
      createdAt: true,
      enrollments: {
        include: { course: { select: { id: true, code: true, title: true, term: true, archived: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) throw new DomainError("User not found.", "NOT_FOUND");
  const [bookings, hosting, sessions, invite, history, actions] = await Promise.all([
    db.booking.findMany({
      where: { studentId: userId, status: "BOOKED", slot: { startsAt: { gt: now } } },
      include: { slot: { select: { startsAt: true } }, assignment: { select: { title: true, course: { select: { code: true, timezone: true } } } } },
      orderBy: { slot: { startsAt: "asc" } },
      take: 20,
    }),
    db.slot.count({ where: { taId: userId, status: { not: "CANCELLED" }, startsAt: { gt: now } } }),
    db.session.findMany({ where: { userId, expiresAt: { gt: now } }, select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
    db.authToken.findFirst({ where: { userId, type: "INVITE", usedAt: null }, orderBy: { createdAt: "desc" }, select: { createdAt: true, expiresAt: true } }),
    db.auditLog.findMany({
      where: { entityType: "User", entityId: userId },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return {
    user,
    bookings,
    hostingUpcoming: hosting,
    sessions: { count: sessions.length, lastSignIn: sessions[0]?.createdAt ?? null },
    invite: invite ? { sentAt: invite.createdAt, expiresAt: invite.expiresAt, expired: invite.expiresAt < now } : null,
    history,
    actions,
  };
}

/** Send a fresh invite (not activated yet) or a password-reset link (active account). */
export async function adminSendAccessEmail(actor: Actor, userId: string) {
  assertAdmin(actor);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new DomainError("User not found.", "NOT_FOUND");
  if (user.status === "DISABLED") throw new DomainError("Enable the account first.");
  if (user.status === "INVITED") {
    await db.$transaction(async (tx) => {
      await issueInvite(tx, user, `${actor.name} (Slotty admin) sent you a new invitation link.`);
      await audit(tx, actor, { action: "user.invite_resent", entityType: "User", entityId: userId });
    });
    return "invite" as const;
  }
  await requestPasswordReset(user.email);
  await db.$transaction((tx) => audit(tx, actor, { action: "user.reset_sent", entityType: "User", entityId: userId }));
  return "reset" as const;
}

/** Fix a typo'd address. Only before the person activates, so nobody loses access to an account they use. */
export async function adminUpdateUser(actor: Actor, userId: string, input: { name: string; email: string }) {
  assertAdmin(actor);
  const data = z
    .object({
      name: z.string().trim().min(1, "Enter a name.").max(120),
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new DomainError("User not found.", "NOT_FOUND");
    if (data.email !== user.email) {
      if (user.status !== "INVITED") throw new DomainError("Only invited (not yet activated) accounts can change email here.");
      if (await tx.user.findUnique({ where: { email: data.email } })) throw new DomainError("Another account already uses that email.", "CONFLICT");
    }
    await tx.user.update({ where: { id: userId }, data });
    if (data.email !== user.email) await issueInvite(tx, { ...user, ...data }, "Your Slotty invitation, sent to your corrected address.");
    await audit(tx, actor, { action: "user.update", entityType: "User", entityId: userId, before: { name: user.name, email: user.email }, after: data });
  });
}

/**
 * Disable or re-enable an account. Disabling can also release the user's upcoming
 * bookings so their seats go back to other students.
 */
export async function adminSetUserDisabled(actor: Actor, userId: string, disabled: boolean, opts: { releaseBookings?: boolean } = {}, now = new Date()) {
  assertAdmin(actor);
  if (userId === actor.id) throw new DomainError("You can't disable your own account.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const status = disabled ? "DISABLED" : user.passwordHash ? "ACTIVE" : "INVITED";
    await tx.user.update({ where: { id: userId }, data: { status } });
    let released = 0;
    if (disabled) {
      await tx.session.deleteMany({ where: { userId } });
      if (opts.releaseBookings) {
        const r = await tx.booking.updateMany({
          where: { studentId: userId, status: "BOOKED", slot: { startsAt: { gt: now } } },
          data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
        });
        released = r.count;
      }
    }
    await audit(tx, actor, {
      action: disabled ? "user.disable" : "user.enable",
      entityType: "User",
      entityId: userId,
      before: user.status,
      after: { status, releasedBookings: released },
    });
    return { released };
  });
}

export async function adminSetAdmin(actor: Actor, userId: string, isAdmin: boolean) {
  assertAdmin(actor);
  if (userId === actor.id && !isAdmin) throw new DomainError("You can't remove your own admin rights.");
  return db.$transaction(async (tx) => {
    if (isAdmin) {
      // Admins run the platform; they're never a student or staff member of a course.
      const courses = await tx.enrollment.findMany({ where: { userId }, select: { course: { select: { code: true } } } });
      if (courses.length > 0) {
        throw new DomainError(
          `They're a member of ${courses.map((e) => e.course.code).join(", ")}. Admins can't also be in courses — remove them from ${courses.length === 1 ? "it" : "those courses"} first.`,
          "CONFLICT",
        );
      }
    }
    await tx.user.update({ where: { id: userId }, data: { isAdmin } });
    await audit(tx, actor, { action: isAdmin ? "user.grant_admin" : "user.revoke_admin", entityType: "User", entityId: userId });
  });
}

// ─── Courses ─────────────────────────────────────────────────────────────────

export type CourseFilter = "active" | "archived" | "no-staff" | "all";

export async function adminListCourses(actor: Actor, opts: { q?: string; filter?: CourseFilter } = {}, now = new Date()) {
  assertAdmin(actor);
  const term = opts.q?.trim();
  const filter = opts.filter ?? "active";
  const where: Prisma.CourseWhereInput = {
    ...(term ? { OR: [{ code: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } }, { term: { contains: term, mode: "insensitive" } }] } : {}),
    ...(filter === "active" && { archived: false }),
    ...(filter === "archived" && { archived: true }),
    ...(filter === "no-staff" && { archived: false, enrollments: { none: { role: { in: STAFF } } } }),
  };
  const courses = await db.course.findMany({
    where,
    include: {
      enrollments: { where: { role: { in: STAFF } }, select: { role: true, user: { select: { id: true, name: true } } } },
      _count: { select: { enrollments: { where: { role: "STUDENT" } }, assignments: { where: { status: "PUBLISHED" } } } },
    },
    orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const upcoming = await db.booking.groupBy({
    by: ["assignmentId"],
    where: { status: "BOOKED", slot: { startsAt: { gt: now } }, assignment: { courseId: { in: courses.map((c) => c.id) } } },
    _count: true,
  });
  const assignmentCourse = new Map(
    (await db.assignment.findMany({ where: { id: { in: upcoming.map((u) => u.assignmentId) } }, select: { id: true, courseId: true } })).map((a) => [a.id, a.courseId]),
  );
  const upcomingByCourse = new Map<string, number>();
  for (const u of upcoming) {
    const c = assignmentCourse.get(u.assignmentId)!;
    upcomingByCourse.set(c, (upcomingByCourse.get(c) ?? 0) + u._count);
  }
  return courses.map(({ enrollments, _count, ...c }) => ({
    ...c,
    instructors: enrollments.filter((e) => e.role === "INSTRUCTOR").map((e) => e.user),
    tas: enrollments.filter((e) => e.role === "TA").map((e) => e.user),
    students: _count.enrollments,
    openAssignments: _count.assignments,
    upcomingDemos: upcomingByCourse.get(c.id) ?? 0,
  }));
}

const staffInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["INSTRUCTOR", "TA"]),
});

/**
 * Put someone in charge of a course (e.g. one left without staff) without the
 * admin enrolling themselves. New people get an invite; existing ones a notification.
 */
export async function adminAssignStaff(actor: Actor, courseId: string, input: z.input<typeof staffInput>) {
  assertAdmin(actor);
  const data = staffInput.parse(input);
  return db.$transaction(async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId } });
    if (!course) throw new DomainError("Course not found.", "NOT_FOUND");
    return assignStaff(tx, actor, course, data);
  });
}

async function assignStaff(tx: Tx, actor: Actor, course: { id: string; code: string; title: string; term: string }, data: z.output<typeof staffInput>) {
  const courseId = course.id;
  let user = await tx.user.findUnique({ where: { email: data.email } });
  if (user?.status === "DISABLED") throw new DomainError("That account is disabled. Enable it first.");
  if (user?.isAdmin) throw new DomainError(`${user.name} is a Slotty admin, so can't be course staff.`);
  if (user) {
    const fits = canTakeRole(data.role, await rolesElsewhere(tx, user.id, courseId));
    if (!fits.ok) throw new DomainError(`${user.name} ${fits.reason}`);
  }
  if (!user) {
    if (!data.name) throw new DomainError("This email has no account yet. Add their name so we can invite them.");
    user = await tx.user.create({ data: { email: data.email, name: data.name, status: "INVITED" } });
  }
  const existing = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } });
  if (existing?.role === data.role) throw new DomainError(`${user.name} is already ${data.role === "TA" ? "a TA" : "an instructor"} here.`);
  if (existing) await tx.enrollment.update({ where: { id: existing.id }, data: { role: data.role } });
  else await tx.enrollment.create({ data: { courseId, userId: user.id, role: data.role } });

  const context = `${actor.name} (Slotty admin) made you ${data.role === "TA" ? "a TA" : "the instructor"} of ${course.code} — ${course.title} (${course.term}).`;
  if (user.status === "INVITED") await issueInvite(tx, user, context);
  else await notify(tx, [user.id], { type: "course.enrolled", title: `You now help run ${course.code}`, body: context, link: `/courses/${courseId}/manage` });
  await audit(tx, actor, {
    action: "course.assign_staff",
    entityType: "Course",
    entityId: courseId,
    before: existing ? { userId: user.id, role: existing.role } : undefined,
    after: { userId: user.id, email: user.email, role: data.role },
  });
  return { invited: user.status === "INVITED", name: user.name };
}

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z.string().trim().min(1, "Enter their name.").max(120),
  isAdmin: z.boolean().default(false),
});

/**
 * Bring someone onto Slotty without putting them in a course, e.g. an
 * instructor who will set up their own course, or another admin.
 */
export async function adminInviteUser(actor: Actor, input: z.input<typeof inviteInput>) {
  assertAdmin(actor);
  const data = inviteInput.parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: data.email } });
    if (existing) throw new DomainError(`${existing.name} already has an account (${existing.status.toLowerCase()}).`, "CONFLICT");
    const user = await tx.user.create({ data: { email: data.email, name: data.name, isAdmin: data.isAdmin, status: "INVITED" } });
    await issueInvite(
      tx,
      user,
      data.isAdmin
        ? `${actor.name} invited you to help run Slotty as an administrator.`
        : `${actor.name} invited you to Slotty, where course demos are booked and marked. Once you're in, you can create your course or be added to one.`,
    );
    await audit(tx, actor, { action: "user.invite", entityType: "User", entityId: user.id, after: { email: data.email, isAdmin: data.isAdmin } });
    return user;
  });
}

const newCourseInput = courseInput.extend({ staff: staffInput });

/** Create a course and hand it to its instructor or TA (admins never join courses themselves). */
export async function adminCreateCourse(actor: Actor, input: z.input<typeof newCourseInput>) {
  assertAdmin(actor);
  const { staff, ...data } = newCourseInput.parse(input);
  return db.$transaction(async (tx) => {
    const course = await tx.course.create({ data: { ...data, createdById: actor.id } });
    await audit(tx, actor, { action: "course.create", entityType: "Course", entityId: course.id, after: data });
    const assigned = await assignStaff(tx, actor, course, staff);
    return { course, ...assigned };
  });
}

export async function adminSetCourseArchived(actor: Actor, courseId: string, archived: boolean) {
  assertAdmin(actor);
  return db.$transaction(async (tx) => {
    await tx.course.update({ where: { id: courseId }, data: { archived } });
    await audit(tx, actor, { action: archived ? "course.archive" : "course.unarchive", entityType: "Course", entityId: courseId });
  });
}

// ─── Email delivery ──────────────────────────────────────────────────────────

export async function adminEmailQueue(actor: Actor, status: "FAILED" | "PENDING" | "SENT" = "FAILED") {
  assertAdmin(actor);
  const [rows, counts] = await Promise.all([
    db.emailOutbox.findMany({
      where: { status },
      select: { id: true, to: true, subject: true, status: true, attempts: true, lastError: true, sendAfter: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.emailOutbox.groupBy({ by: ["status"], _count: true }),
  ]);
  return { rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<"FAILED" | "PENDING" | "SENT", number>> };
}

/** Queue failed emails again (e.g. after fixing SMTP settings). */
export async function adminRetryEmails(actor: Actor, ids: string[] | "all-failed") {
  assertAdmin(actor);
  return db.$transaction(async (tx) => {
    const r = await tx.emailOutbox.updateMany({
      where: { status: "FAILED", ...(ids === "all-failed" ? {} : { id: { in: ids } }) },
      data: { status: "PENDING", attempts: 0, sendAfter: new Date(), lastError: null },
    });
    if (r.count) {
      await signalOutbox(tx);
      await audit(tx, actor, { action: "email.retry", entityType: "EmailOutbox", entityId: ids === "all-failed" ? "*" : ids.join(","), after: { count: r.count } });
    }
    return r.count;
  });
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function adminAuditLog(actor: Actor, opts: { take?: number; area?: string; q?: string; before?: string } = {}) {
  assertAdmin(actor);
  const take = opts.take ?? 100;
  const term = opts.q?.trim();
  const rows = await db.auditLog.findMany({
    where: {
      ...(opts.area ? { action: { startsWith: `${opts.area}.` } } : {}),
      ...(term
        ? { OR: [{ entityId: term }, { actor: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } }] }
        : {}),
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });
  const page = rows.slice(0, take);
  // Names for the things entries point at, so the log reads as sentences.
  const ids = (type: string) => [...new Set(page.filter((e) => e.entityType === type).map((e) => e.entityId))];
  const [users, courses] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids("User") } }, select: { id: true, name: true } }),
    db.course.findMany({ where: { id: { in: ids("Course") } }, select: { id: true, code: true } }),
  ]);
  const names = new Map<string, string>([...users.map((u) => [u.id, u.name] as const), ...courses.map((c) => [c.id, c.code] as const)]);
  return {
    entries: page.map((e) => ({ ...e, entityName: names.get(e.entityId) ?? null })),
    nextBefore: rows.length > take ? page[page.length - 1].createdAt.toISOString() : null,
  };
}
