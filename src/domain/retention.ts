/**
 * How long Slotty keeps messages and sign-in records (docs ch. 11). Emails and push messages
 * carry links and course details, so their content goes once it has done its job; the rows
 * themselves stay a little longer for the admin email log and support questions.
 */
const DAY = 86_400_000;

export const RETENTION = {
  /** A sent email's body (text and HTML) is cleared after this; subject, recipient and status stay. */
  sentEmailBodyDays: 30,
  /** Sent and failed emails are deleted after this. */
  emailRowDays: 180,
  /** Delivered or failed push messages are deleted after this (they're shown on arrival only). */
  pushDays: 7,
  /** Read notifications are deleted after this. */
  readNotificationDays: 90,
  /** Any notification, read or not, is deleted after this. */
  notificationDays: 180,
  /** Used or expired invite and reset links are deleted this long after they stop working. */
  spentTokenDays: 7,
} as const;

/** The instants before which each kind of record is pruned. */
export function retentionCutoffs(now: Date) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  return {
    sentEmailBody: ago(RETENTION.sentEmailBodyDays),
    emailRow: ago(RETENTION.emailRowDays),
    push: ago(RETENTION.pushDays),
    readNotification: ago(RETENTION.readNotificationDays),
    notification: ago(RETENTION.notificationDays),
    spentToken: ago(RETENTION.spentTokenDays),
    /** Sessions are deleted as soon as they expire. */
    session: now,
  };
}
