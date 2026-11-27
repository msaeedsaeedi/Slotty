/**
 * Which pages each account keeps on its device for offline use (#162; agreed design: steps 1
 * and 2 on #160). The server builds the list, because only it knows which courses, demos and
 * students an account can see; the service worker loads them ahead of time.
 *
 * - Student: dashboard, bookings, notifications, each active course, and each assignment
 *   with an upcoming or open demo.
 * - TA: dashboard, notifications, Demo day (`/today`), each course's Today page, the marking
 *   sheet of assignments they host demos for today or in the next 7 days, and the evaluate
 *   page of each student booked with them (demos within 14 days either side).
 * - Instructor: the review queue and the student page of each mark waiting for their review
 *   (read only; #181). Demo day and a course's Today page only if they host demos there:
 *   otherwise they'd open empty. Marking sheets and booked students as a TA, for demos they host.
 * - Admin and platform accounts: nothing (they never join courses, ADR-016).
 *
 * Limits: active (not archived) courses, demos within 14 days, at most 150 pages, nearest
 * demos first. Each page has a version that changes when its data does, so the device only
 * downloads pages that changed. Pure: no I/O.
 */

/**
 * What an account keeps on its device for offline use (#179), so nothing is set up that its
 * role never uses:
 * - `pages`: saved pages, with the work that keeps them fresh (the list, background and
 *   periodic syncs, persistent storage). Every account in courses; admin and platform accounts
 *   get no pages (`offlinePages`), so they get none of that.
 * - `marks`: offline marking drafts and their upload, list, change channel and app badge.
 *   Only staff mark.
 * Sealing another account's drafts doesn't depend on this: anyone signing in on a device must
 * hide the previous account's drafts.
 */
export interface OfflineNeeds {
  pages: boolean;
  marks: boolean;
}

export function offlineNeeds(account: { outsideCourses: boolean; staff: boolean }): OfflineNeeds {
  if (account.outsideCourses) return { pages: false, marks: false };
  return { pages: true, marks: account.staff };
}

export const OFFLINE_WINDOW_DAYS = 14;
export const MARKING_WINDOW_DAYS = 7;
export const OFFLINE_PAGE_CAP = 150;
export const OFFLINE_EXPIRY_DAYS = 14;

const DAY = 86_400_000;

export type OfflineRole = "STUDENT" | "TA" | "INSTRUCTOR";

export interface OfflineCourse {
  id: string;
  role: OfflineRole;
  timezone: string;
  /** Changes whenever anything shown on this course's pages changes (see the service). */
  fingerprint: string;
  /** The account hosts demos in this course (slots of its own, not cancelled, not over). */
  hosts?: boolean;
  assignments: {
    id: string;
    status: "DRAFT" | "PUBLISHED" | "CLOSED";
    /** Start times of the assignment's bookable (published) slots. */
    slotStarts: Date[];
  }[];
}

export interface OfflineInput {
  now: Date;
  /** Admins and platform accounts get nothing. */
  outsideCourses: boolean;
  /** Changes whenever the account's own data changes (notifications). */
  userFingerprint: string;
  courses: OfflineCourse[];
  /** The account's own active bookings (as a student). */
  ownBookings: { courseId: string; assignmentId: string; startsAt: Date }[];
  /** Active bookings in slots the account hosts (as staff). */
  hostedBookings: { courseId: string; assignmentId: string; studentId: string; startsAt: Date }[];
  /** Marks submitted and waiting for review, in courses where the account is an instructor (#181). */
  awaitingReview?: { courseId: string; assignmentId: string; studentId: string; submittedAt: Date }[];
}

export interface OfflinePage {
  url: string;
  version: string;
  /** Loaded even with data saver on: dashboard, Demo day and the next 7 days of demos. */
  key: boolean;
}

interface Candidate extends OfflinePage {
  /** Lower first: core pages, then course pages, then demos by how near they are. */
  rank: number;
}

/** FNV-1a, base 36: short and stable; the version only needs to change when its parts do. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The date in a timezone, so day-dependent text ("today", "tomorrow") refreshes daily. */
function localDate(now: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function offlinePages(input: OfflineInput): OfflinePage[] {
  if (input.outsideCourses) return [];
  const { now } = input;
  const t = now.getTime();
  const inWindow = (d: Date, back: number, ahead: number) => d.getTime() >= t - back * DAY && d.getTime() <= t + ahead * DAY;
  const distance = (d: Date) => Math.abs(d.getTime() - t);
  const courses = new Map(input.courses.map((c) => [c.id, c]));
  const day = (c: OfflineCourse) => localDate(now, c.timezone);
  const everything = input.courses.map((c) => `${c.id}:${c.fingerprint}:${day(c)}`).join("|");
  const version = (...parts: string[]) => shortHash(parts.join("#"));

  const out: Candidate[] = [];
  const add = (url: string, v: string, rank: number, key = false) => out.push({ url, version: v, key, rank });

  const studies = input.courses.some((c) => c.role === "STUDENT");
  // Demo day and a course's Today page are about hosting demos: every TA, and an instructor
  // only where they host some (#181; otherwise those pages open empty).
  const hostsIn = (c: OfflineCourse) => c.role === "TA" || (c.role === "INSTRUCTOR" && Boolean(c.hosts));
  const hosts = input.courses.some(hostsIn);

  // Core pages: they show something from every course.
  add("/dashboard", version("dashboard", everything, input.userFingerprint), 0, true);
  if (hosts) add("/today", version("today", everything), 1, true);
  if (studies) add("/bookings", version("bookings", everything), 2);
  add("/notifications", version("notifications", input.userFingerprint), 3);

  for (const c of input.courses) {
    const v = (kind: string) => version(kind, c.id, c.fingerprint, day(c));
    if (c.role === "STUDENT") {
      add(`/courses/${c.id}`, v("course"), 10);
      for (const a of c.assignments) {
        if (a.status === "DRAFT") continue;
        const booked = input.ownBookings.filter((b) => b.assignmentId === a.id && inWindow(b.startsAt, OFFLINE_WINDOW_DAYS, OFFLINE_WINDOW_DAYS));
        const upcoming = a.status === "PUBLISHED" ? a.slotStarts.filter((s) => inWindow(s, 0, OFFLINE_WINDOW_DAYS)) : [];
        const when = [...booked.map((b) => b.startsAt), ...upcoming].sort((x, y) => distance(x) - distance(y))[0];
        if (!when) continue;
        const soon = inWindow(when, 1, MARKING_WINDOW_DAYS);
        add(`/courses/${c.id}/assignments/${a.id}`, version("assignment", a.id, c.fingerprint, day(c)), 100 + distance(when) / DAY, soon && booked.length > 0);
      }
    } else {
      if (hostsIn(c)) add(`/courses/${c.id}/manage/today`, v("course-today"), 11, true);
      if (c.role === "INSTRUCTOR") add(`/courses/${c.id}/manage/review`, v("review"), 12, !hostsIn(c));
    }
  }

  // Instructors: the student page of each mark waiting for their review (#181), newest first,
  // ahead of demo pages: reading submissions is what an instructor does away from demos.
  for (const r of input.awaitingReview ?? []) {
    const c = courses.get(r.courseId);
    if (c?.role !== "INSTRUCTOR") continue;
    add(
      `/courses/${c.id}/manage/assignments/${r.assignmentId}/evaluate/${r.studentId}`,
      version("evaluate", r.assignmentId, r.studentId, c.fingerprint, day(c)),
      60 + distance(r.submittedAt) / DAY,
    );
  }

  // Staff: marking sheets and the students booked with them.
  const marking = new Map<string, Date>();
  for (const b of input.hostedBookings) {
    const c = courses.get(b.courseId);
    if (!c || c.role === "STUDENT") continue;
    if (inWindow(b.startsAt, 0, MARKING_WINDOW_DAYS) || localDate(b.startsAt, c.timezone) === day(c)) {
      const seen = marking.get(b.assignmentId);
      if (!seen || distance(b.startsAt) < distance(seen)) marking.set(b.assignmentId, b.startsAt);
    }
    if (!inWindow(b.startsAt, OFFLINE_WINDOW_DAYS, OFFLINE_WINDOW_DAYS)) continue;
    const soon = inWindow(b.startsAt, 1, MARKING_WINDOW_DAYS);
    add(
      `/courses/${c.id}/manage/assignments/${b.assignmentId}/evaluate/${b.studentId}`,
      version("evaluate", b.assignmentId, b.studentId, c.fingerprint, day(c)),
      100 + distance(b.startsAt) / DAY,
      soon,
    );
  }
  for (const [assignmentId, when] of marking) {
    const courseId = input.hostedBookings.find((b) => b.assignmentId === assignmentId)!.courseId;
    const c = courses.get(courseId)!;
    add(`/courses/${courseId}/manage/assignments/${assignmentId}/mark`, version("mark", assignmentId, c.fingerprint, day(c)), 50 + distance(when) / DAY, true);
  }

  const unique = new Map<string, Candidate>();
  for (const p of out) if (!unique.has(p.url)) unique.set(p.url, p);
  return [...unique.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, OFFLINE_PAGE_CAP)
    .map(({ url, version: v, key }) => ({ url, version: v, key }));
}
