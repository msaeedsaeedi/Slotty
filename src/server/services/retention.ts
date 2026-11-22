import { retentionCutoffs } from "@/domain/retention";
import { db } from "@/server/db";

/** Placeholder left in a sent email's body once it is cleared (the column is required). */
export const CLEARED_BODY = "";

/**
 * Prune messages and sign-in records past their retention (`RETENTION`, docs ch. 11). Run by the
 * worker every hour. Pending emails and pushes are never touched, and failed emails keep their
 * body until the row itself goes, so an admin retry never sends an empty email.
 */
export async function pruneMessages(now = new Date()) {
  const cut = retentionCutoffs(now);
  const [bodies, emails, pushes, read, old, sessions, tokens] = await Promise.all([
    db.emailOutbox.updateMany({
      // Rows old enough to be deleted below are left to the delete.
      where: { status: "SENT", sentAt: { lt: cut.sentEmailBody }, createdAt: { gte: cut.emailRow }, NOT: { text: CLEARED_BODY } },
      data: { text: CLEARED_BODY, html: null },
    }),
    db.emailOutbox.deleteMany({ where: { status: { in: ["SENT", "FAILED"] }, createdAt: { lt: cut.emailRow } } }),
    db.pushMessage.deleteMany({ where: { status: { in: ["SENT", "FAILED"] }, createdAt: { lt: cut.push } } }),
    db.notification.deleteMany({ where: { readAt: { lt: cut.readNotification } } }),
    db.notification.deleteMany({ where: { createdAt: { lt: cut.notification } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: cut.session } } }),
    db.authToken.deleteMany({ where: { OR: [{ usedAt: { lt: cut.spentToken } }, { expiresAt: { lt: cut.spentToken } }] } }),
  ]);
  return {
    emailBodiesCleared: bodies.count,
    emailsDeleted: emails.count,
    pushDeleted: pushes.count,
    notificationsDeleted: read.count + old.count,
    sessionsDeleted: sessions.count,
    tokensDeleted: tokens.count,
  };
}
