import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
import { assertAdmin, type Actor } from "./access";
import { audit } from "./audit";

export async function adminListUsers(actor: Actor, query?: string) {
  assertAdmin(actor);
  const q = query?.trim();
  return db.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isAdmin: true,
      createdAt: true,
      _count: { select: { enrollments: true, bookings: { where: { status: "BOOKED", slot: { startsAt: { gt: new Date() } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
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
    await tx.user.update({ where: { id: userId }, data: { isAdmin } });
    await audit(tx, actor, { action: isAdmin ? "user.grant_admin" : "user.revoke_admin", entityType: "User", entityId: userId });
  });
}

export async function adminListCourses(actor: Actor) {
  assertAdmin(actor);
  return db.course.findMany({
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { enrollments: true, assignments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function adminAuditLog(actor: Actor, opts?: { take?: number }) {
  assertAdmin(actor);
  return db.auditLog.findMany({
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 200,
  });
}
