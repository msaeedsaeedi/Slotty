/**
 * The demo-day timeline: which slots are done, happening now, next up, or later,
 * with free gaps between them. Pure, so the TA view and tests share one rule set.
 */

export type AttendanceStatus = "BOOKED" | "COMPLETED" | "NO_SHOW";

export interface TimelineSlot {
  id: string;
  startsAt: Date;
  endsAt: Date;
  /** Active bookings only (callers leave cancelled ones out). */
  bookings: { status: string }[];
}

export type Phase = "done" | "now" | "next" | "later";

export type TimelineItem<S extends TimelineSlot> = { kind: "slot"; phase: Phase; slot: S } | { kind: "gap"; from: Date; to: Date };

export interface Timeline<S extends TimelineSlot> {
  items: TimelineItem<S>[];
  /** Slots in progress that have students (several when hosts run in parallel). */
  current: S[];
  /** The earliest upcoming slots with students (same start time). */
  next: S[];
  /** In progress, but nobody booked it. */
  idleNow: boolean;
  /**
   * What the TA should look at: a demo in progress that still needs attendance,
   * otherwise the next one (so recording a demo early moves the focus on),
   * otherwise nothing left today.
   */
  focus: { kind: "now"; slots: S[] } | { kind: "next"; slots: S[] } | { kind: "done" } | { kind: "empty" };
  /** Past slots nobody booked; left out of `items` to keep the list short. */
  hiddenEmptyPast: number;
  stats: {
    demos: number;
    completed: number;
    noShow: number;
    /** Demos that have ended without attendance recorded. */
    needsAttendance: number;
    /** Demos in progress or still to come. */
    remaining: number;
  };
}

/** Free periods shorter than this aren't worth showing. */
export const MIN_GAP_MS = 15 * 60_000;

export function buildTimeline<S extends TimelineSlot>(slots: readonly S[], now: Date, opts: { gaps?: boolean } = {}): Timeline<S> {
  const sorted = [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.endsAt.getTime() - b.endsAt.getTime());
  const t = now.getTime();
  const booked = (s: S) => s.bookings.length > 0;

  const nextStart = sorted.find((s) => s.startsAt.getTime() > t && booked(s))?.startsAt.getTime();
  const phaseOf = (s: S): Phase => {
    if (s.endsAt.getTime() <= t) return "done";
    if (s.startsAt.getTime() <= t) return "now";
    return booked(s) && s.startsAt.getTime() === nextStart ? "next" : "later";
  };

  const items: TimelineItem<S>[] = [];
  const stats = { demos: 0, completed: 0, noShow: 0, needsAttendance: 0, remaining: 0 };
  let hiddenEmptyPast = 0;
  let busyUntil: number | null = null;

  for (const slot of sorted) {
    const phase = phaseOf(slot);
    for (const b of slot.bookings) {
      stats.demos++;
      if (b.status === "COMPLETED") stats.completed++;
      else if (b.status === "NO_SHOW") stats.noShow++;
      else if (phase === "done") stats.needsAttendance++;
      else stats.remaining++;
    }
    if (phase === "done" && !booked(slot)) {
      hiddenEmptyPast++;
      continue;
    }
    const start = slot.startsAt.getTime();
    if (opts.gaps && busyUntil !== null && start - busyUntil >= MIN_GAP_MS) {
      items.push({ kind: "gap", from: new Date(busyUntil), to: slot.startsAt });
    }
    busyUntil = Math.max(busyUntil ?? 0, slot.endsAt.getTime());
    items.push({ kind: "slot", phase, slot });
  }

  const inProgress = sorted.filter((s) => phaseOf(s) === "now");
  const current = inProgress.filter(booked);
  const next = sorted.filter((s) => phaseOf(s) === "next");
  const unrecorded = current.filter((s) => s.bookings.some((b) => b.status === "BOOKED"));
  const focus: Timeline<S>["focus"] =
    unrecorded.length > 0
      ? { kind: "now", slots: unrecorded }
      : next.length > 0
        ? { kind: "next", slots: next }
        : stats.demos > 0
          ? { kind: "done" }
          : { kind: "empty" };
  return {
    items,
    current,
    next,
    idleNow: inProgress.length > 0 && !inProgress.some(booked),
    focus,
    hiddenEmptyPast,
    stats,
  };
}

/** "in 5 min", "in 1 h 20 min", "now" — for countdowns to a start time. */
export function formatUntil(ms: number): string {
  if (ms <= 30_000) return "now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `in ${h} h ${rest} min` : `in ${h} h`;
}

/** "12 min left", "ends now" — for the demo in progress. */
export function formatLeft(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  return min <= 0 ? "ending now" : `${min} min left`;
}
