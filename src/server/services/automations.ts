import { db } from "@/server/db";
import { announceBookingOpen } from "./assignments";

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
