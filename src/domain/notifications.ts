/**
 * How much Uniflow tells people, and when. One demo used to produce a dozen
 * unread items, half of them echoing what the student had just done, so:
 *
 * - People aren't notified in-app about their own actions; the page already
 *   says what happened. They get one confirmation email for where things
 *   ended up, sent a few minutes later (`SELF_EMAIL_DELAY_MINUTES`).
 * - Changes to the same thing within `SUPERSEDE_MINUTES` replace the earlier
 *   unread item or unsent email instead of stacking (`groupKey`).
 * - The bell counts only items that need the person (`needsAction`).
 */
export const SUPERSEDE_MINUTES = 15;
export const SELF_EMAIL_DELAY_MINUTES = 10;

/** One student's booking for one assignment. */
export const bookingKey = (assignmentId: string, studentId: string) => `booking:${assignmentId}:${studentId}`;
/** One student's marks for one assignment. */
export const marksKey = (evaluationId: string) => `marks:${evaluationId}`;

/** Informational types: listed, but not counted in the bell badge. */
const FYI_TYPES = new Set(["course.enrolled", "slots.added", "assignment.rules_changed", "agenda.daily", "slot.venue_changed"]);

export function needsAction(type: string): boolean {
  return !FYI_TYPES.has(type);
}

export const FYI_NOTIFICATION_TYPES = [...FYI_TYPES];

/** The assignment a notification is about, from its link, for grouping the list. */
export function assignmentOf(link: string | null): string | null {
  return link?.match(/^\/courses\/[^/]+\/(?:manage\/)?assignments\/([^/?#]+)/)?.[1] ?? null;
}
