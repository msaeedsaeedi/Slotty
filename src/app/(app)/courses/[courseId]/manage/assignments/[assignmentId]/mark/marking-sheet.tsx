"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, CloudOff, Loader2, MapPin, UserRound } from "lucide-react";
import { saveDraftAction, sheetAttendanceAction, submitManyAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { reportReachable, reportUnreachable, useConnection, useNetworkGuard } from "@/components/connection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrivateNotes, type VisibleNote } from "@/components/private-notes";
import { Textarea } from "@/components/ui/textarea";
import { formatLeft, formatUntil } from "@/domain/demo-day";
import { hasMarkPrecision, MARK_DECIMALS } from "@/domain/evaluation";
import { REASON_MAX_LENGTH } from "@/domain/text";
import { cn } from "@/lib/utils";
import { announceDrafts, deleteDraft, draftKey, draftsFor, putDraft, type StoredDraft } from "@/lib/draft-store";

export interface SheetRow {
  student: { id: string; name: string; email: string };
  booking: {
    id: string;
    status: "BOOKED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
    startsAt: string;
    endsAt: string;
    time: string;
    day: string;
    venue: string | null;
    host: string;
  } | null;
  evaluation: {
    id: string;
    status: "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED";
    totalMarks: number | null;
    totalOverride: boolean;
    overrideNote: string | null;
    feedback: string | null;
    /** The notes this viewer may read; theirs (editable here) is `mine`. */
    notes: VisibleNote[];
    noBookingReason: string | null;
    earlyMarkReason: string | null;
    reviewComment: string | null;
    /** When released marks waiting out their hold reach the student, in the course timezone (ADR-032). */
    releasesOn: string | null;
    scores: { criterionId: string; points: number; comment: string | null }[];
  } | null;
}

interface Criterion {
  id: string;
  label: string;
  maxPoints: number;
}

interface Props {
  /** Opaque key of the signed-in account (`offlineOwner`): unsaved drafts on this device are kept under it. */
  offlineOwner: string;
  assignment: { id: string; title: string; maxMarks: number; courseId: string; courseCode: string };
  criteria: Criterion[];
  rows: SheetRow[];
  hasInstructor: boolean;
  /** What this user submits is final (an instructor, or a course without one). */
  finalOnSubmit: boolean;
  /** Releasing holds the marks this long before students see them (a TA in a course without an instructor). */
  holdHours?: number | null;
  /** One student inside their student page: no day sheet, progress or next/back. */
  embedded?: boolean;
  mode: "day" | "todo" | "student";
  isToday: boolean;
  title: string;
  timezoneLabel: string;
  initialBookingId?: string;
  now: string;
  links: {
    back: string;
    course: string;
    assignment: string;
    details: string;
    prevDay?: string;
    nextDay?: string;
    scope?: { current: "mine" | "everyone"; mine: string; everyone: string };
  };
}

/** What's typed for one student; strings so half-typed numbers survive. */
interface Draft {
  points: Record<string, string>;
  feedback: string;
  privateNotes: string;
  total: string;
  noBookingReason: string;
  earlyMarkReason: string;
}

/**
 * One row's sync state (#161): `dirty` typed and kept on this device, `local` kept on this
 * device because Uniflow couldn't be reached, `saving` on its way, `saved` reached Uniflow,
 * `error` refused by Uniflow (needs attention; not retried by itself).
 */
type SaveState = { kind: "idle" } | { kind: "dirty" } | { kind: "local" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

interface RowState {
  bookingStatus: SheetRow["booking"] extends infer B ? (B extends { status: infer S } ? S : never) | null : never;
  evaluationId: string | null;
  evalStatus: NonNullable<SheetRow["evaluation"]>["status"] | null;
  totalMarks: number | null;
  /** A reason is on record for marking this demo before it started. */
  earlyOk: boolean;
  save: SaveState;
}

const SAVE_DELAY_MS = 800;
const TICK_MS = 10_000;

function draftOf(r: SheetRow): Draft {
  const e = r.evaluation;
  return {
    points: Object.fromEntries((e?.scores ?? []).map((s) => [s.criterionId, String(s.points)])),
    feedback: e?.feedback ?? "",
    privateNotes: e?.notes.find((n) => n.mine)?.body ?? "",
    total: e?.totalMarks?.toString() ?? "",
    noBookingReason: "",
    earlyMarkReason: "",
  };
}

/**
 * What the server has for one student, comparable with a draft typed on top of it: a draft
 * kept on this device is restored silently only while this still matches.
 */
function fingerprint(d: Draft, status: string | null, rubric: boolean): string {
  const points = Object.entries(d.points)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => [k, Number(v)])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  // With a rubric the total is computed from the points (the server sends it, typing doesn't).
  const total = !rubric && d.total.trim() ? Number(d.total) : null;
  return JSON.stringify([status, points, total, d.feedback.trim(), d.privateNotes.trim()]);
}

const round = (n: number) => Math.round(n * 100) / 100;
/** The score inputs' step: marks keep at most MARK_DECIMALS decimals. */
const MARK_STEP = 10 ** -MARK_DECIMALS;

/** Problems that stop a draft being saved, by field. */
function problems(d: Draft, criteria: Criterion[], maxMarks: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of criteria) {
    const raw = d.points[c.id]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > c.maxPoints) out[c.id] = `0–${c.maxPoints}`;
    else if (!hasMarkPrecision(n)) out[c.id] = `at most ${MARK_DECIMALS} decimals`;
  }
  if (criteria.length === 0 && d.total.trim()) {
    const n = Number(d.total);
    if (!Number.isFinite(n) || n < 0 || n > maxMarks) out.total = `0–${maxMarks}`;
    else if (!hasMarkPrecision(n)) out.total = `at most ${MARK_DECIMALS} decimals`;
  }
  return out;
}

export function MarkingSheet({ offlineOwner, assignment, criteria, rows, finalOnSubmit, holdHours = null, embedded, mode, isToday, title, timezoneLabel, initialBookingId, now: serverNow, links }: Props) {
  const { online } = useConnection();
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const [drafts, setDrafts] = useState<Draft[]>(() => rows.map(draftOf));
  const [state, setState] = useState<RowState[]>(() =>
    rows.map((r) => ({
      bookingStatus: r.booking?.status ?? null,
      evaluationId: r.evaluation?.id ?? null,
      evalStatus: r.evaluation?.status ?? null,
      totalMarks: r.evaluation?.totalMarks ?? null,
      earlyOk: Boolean(r.evaluation?.earlyMarkReason),
      save: { kind: "idle" },
    })),
  );

  const liveIndex = useCallback(
    (t: number) => {
      const live = rows.findIndex((r) => r.booking && new Date(r.booking.startsAt).getTime() <= t && t < new Date(r.booking.endsAt).getTime());
      if (live >= 0) return live;
      return rows.findIndex((r) => r.booking && new Date(r.booking.startsAt).getTime() > t);
    },
    [rows],
  );

  const [current, setCurrent] = useState(() => {
    const asked = rows.findIndex((r) => r.booking?.id === initialBookingId);
    if (asked >= 0) return asked;
    if (isToday) {
      const live = liveIndex(new Date(serverNow).getTime());
      if (live >= 0) return live;
    }
    const firstOpen = rows.findIndex((r) => !r.evaluation || r.evaluation.status === "DRAFT" || r.evaluation.status === "RETURNED");
    return Math.max(0, firstOpen);
  });
  // Following the clock: when the demo being followed ends, move on to the next one.
  const [follow, setFollow] = useState(isToday);
  const [followed, setFollowed] = useState<number | null>(isToday ? current : null);

  // ─── Autosave ─────────────────────────────────────────────────────────────
  const draftsRef = useRef(drafts);
  const stateRef = useRef(state);
  useEffect(() => {
    draftsRef.current = drafts;
    stateRef.current = state;
  });
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<number, Promise<void>>());
  const again = useRef(new Set<number>());

  // ─── Drafts kept on this device (IndexedDB) ───────────────────────────────
  // Unsaved typing is also written to this device, so it survives a closed or crashed tab
  // while offline. Each entry is deleted once the server has it.
  const base = useRef(rows.map((r) => fingerprint(draftOf(r), r.evaluation?.status ?? null, criteria.length > 0)));
  const idb = useRef<Promise<unknown>>(Promise.resolve());
  const local = useCallback(
    (fn: () => Promise<unknown>) => {
      idb.current = idb.current.then(fn, fn);
    },
    [],
  );
  const [restorable, setRestorable] = useState<{ i: number; entry: StoredDraft<Draft> }[]>([]);

  const patchState = (i: number, patch: Partial<RowState>) => setState((s) => s.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const save = useCallback(
    async (i: number): Promise<void> => {
      timers.current.delete(i);
      if (inflight.current.has(i)) {
        // Saved again once the current request finishes, with whatever is typed by then.
        again.current.add(i);
        return inflight.current.get(i);
      }
      const run = (async () => {
        do {
          const d = draftsRef.current[i];
          const row = rows[i];
          if (Object.keys(problems(d, criteria, assignment.maxMarks)).length) {
            patchState(i, { save: { kind: "error", message: "Fix the highlighted marks to save." } });
            return;
          }
          patchState(i, { save: { kind: "saving" } });
          const key = draftKey(offlineOwner, assignment.id, row.student.id);
          announceDrafts({ type: "syncing", key, on: true });
          const r = await saveDraftAction({
            assignmentId: assignment.id,
            studentId: row.student.id,
            scores: criteria.filter((c) => d.points[c.id]?.trim()).map((c) => ({ criterionId: c.id, points: Number(d.points[c.id]) })),
            totalMarks: criteria.length === 0 && d.total.trim() ? Number(d.total) : null,
            totalOverride: row.evaluation?.totalOverride ?? false,
            overrideNote: row.evaluation?.overrideNote ?? undefined,
            feedback: d.feedback,
            privateNotes: d.privateNotes,
            noBookingReason: d.noBookingReason || undefined,
            earlyMarkReason: d.earlyMarkReason || undefined,
          })
            .then((res) => {
              reportReachable();
              return res;
            })
            .catch(() => {
              reportUnreachable();
              return null;
            })
            .finally(() => announceDrafts({ type: "syncing", key, on: false }));
          if (r === null) {
            // Not an error: the marks stay on this device and save when Uniflow answers.
            patchState(i, { save: { kind: "local" } });
            return;
          }
          if (r.ok) {
            base.current[i] = fingerprint(d, r.value.status, criteria.length > 0);
            if (!timers.current.has(i) && !again.current.has(i)) local(() => deleteDraft(offlineOwner, assignment.id, row.student.id).then(() => announceDrafts({ type: "changed" })));
            patchState(i, {
              evaluationId: r.value.evaluationId,
              evalStatus: r.value.status,
              totalMarks: r.value.totalMarks,
              bookingStatus: r.value.bookingStatus ?? stateRef.current[i].bookingStatus,
              earlyOk: stateRef.current[i].earlyOk || Boolean(d.earlyMarkReason.trim()),
              // More typing may already be waiting to save.
              save: timers.current.has(i) ? { kind: "dirty" } : { kind: "saved", at: r.value.savedAt },
            });
          } else {
            patchState(i, { save: { kind: "error", message: r.error } });
            return;
          }
        } while (again.current.delete(i));
      })();
      inflight.current.set(i, run);
      await run;
      inflight.current.delete(i);
    },
    [assignment.id, assignment.maxMarks, criteria, rows, local, offlineOwner],
  );

  const schedule = (i: number) => {
    clearTimeout(timers.current.get(i));
    timers.current.set(i, setTimeout(() => void save(i), SAVE_DELAY_MS));
  };
  const flush = useCallback(async (i: number) => {
    if (!timers.current.has(i)) return inflight.current.get(i);
    clearTimeout(timers.current.get(i));
    return save(i);
  }, [save]);

  const edit = (i: number, patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d)));
    patchState(i, { save: { kind: "dirty" } });
    schedule(i);
  };

  // Save what's kept on this device once Uniflow answers again. A refusal by Uniflow
  // (`error`) needs attention and isn't retried by itself.
  useEffect(() => {
    if (!online) return;
    stateRef.current.forEach((s, i) => {
      if (s.save.kind === "local" && !Object.keys(problems(draftsRef.current[i], criteria, assignment.maxMarks)).length) void save(i);
    });
  }, [online, save, criteria, assignment.maxMarks]);

  // Write unsaved rows to this device whenever they change, with what the header's list
  // needs (state, the student's name, the link to their row).
  useEffect(() => {
    state.forEach((s, i) => {
      if (s.save.kind !== "dirty" && s.save.kind !== "local" && s.save.kind !== "error") return;
      const student = rows[i].student;
      const entry = {
        owner: offlineOwner,
        assignmentId: assignment.id,
        studentId: student.id,
        draft: drafts[i],
        base: base.current[i],
        at: Date.now(),
        state: s.save.kind === "error" ? ("error" as const) : ("waiting" as const),
        message: s.save.kind === "error" ? s.save.message : undefined,
        label: student.name,
        href: `/courses/${assignment.courseId}/manage/assignments/${assignment.id}/mark?student=${student.id}`,
      };
      local(() => putDraft(entry).then(() => announceDrafts({ type: "changed" })));
    });
  }, [state, drafts, rows, assignment.id, assignment.courseId, offlineOwner, local]);

  // On open: bring back drafts this device kept. Those typed on top of what the server still
  // has come back and save as drafts; if the marks changed since, ask first.
  const restore = useCallback(
    (i: number, d: Draft) => {
      setDrafts((ds) => ds.map((x, j) => (j === i ? d : x)));
      patchState(i, { save: { kind: "dirty" } });
      clearTimeout(timers.current.get(i));
      timers.current.set(i, setTimeout(() => void save(i), SAVE_DELAY_MS));
    },
    [save],
  );
  useEffect(() => {
    let cancelled = false;
    void draftsFor<Draft>(offlineOwner, assignment.id).then((stored) => {
      if (cancelled || stored.length === 0) return;
      const ask: { i: number; entry: StoredDraft<Draft> }[] = [];
      for (const entry of stored) {
        const i = rows.findIndex((r) => r.student.id === entry.studentId);
        if (i < 0) continue; // not on this sheet; kept for the sheet that shows them
        if (fingerprint(entry.draft, stateRef.current[i].evalStatus, criteria.length > 0) === base.current[i]) local(() => deleteDraft(offlineOwner, assignment.id, entry.studentId));
        else if (entry.base === base.current[i]) restore(i, entry.draft);
        else ask.push({ i, entry });
      }
      if (ask.length) {
        setRestorable(ask);
        // Changed elsewhere since this device kept them: the header lists them as conflicts.
        for (const { entry } of ask) local(() => putDraft({ ...entry, state: "conflict", message: undefined }).then(() => announceDrafts({ type: "changed" })));
      }
    });
    return () => {
      cancelled = true;
    };
    // Once per sheet: later changes are this tab's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't lose typing to a closed tab.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timers.current.size || inflight.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────────
  const go = useCallback(
    (i: number, opts: { auto?: boolean } = {}) => {
      if (i < 0 || i >= rows.length) return;
      void flush(current);
      setCurrent(i);
      if (!opts.auto) setFollowed(isToday && liveIndex(Date.now()) === i ? i : null);
      const b = rows[i].booking;
      const url = new URL(window.location.href);
      if (b) url.searchParams.set("booking", b.id);
      window.history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [current, flush, isToday, liveIndex, rows],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!follow || followed === null) return;
    const b = rows[followed]?.booking;
    if (!b || now < new Date(b.endsAt).getTime()) return;
    const next = liveIndex(now);
    if (next < 0 || next === followed) return;
    // Time's up for this demo: go to the one now on (the draft is saved on the way).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the clock is the point
    setFollowed(next);
    go(next, { auto: true });
    toast(`Time's up — now: ${rows[next].student.name} (${rows[next].booking?.time})`);
  }, [now, follow, followed, go, liveIndex, rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowRight") go(current + 1);
      else if (e.altKey && e.key === "ArrowLeft") go(current - 1);
      else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") go(current + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const totalOf = (i: number) => {
    const d = drafts[i];
    // An out-of-range or non-numeric mark makes any total misleading (7/6 and −1 aren't "6"): show – until fixed.
    if (Object.keys(problems(d, criteria, assignment.maxMarks)).length > 0) return null;
    if (criteria.length === 0) return d.total.trim() ? Number(d.total) : null;
    if (rows[i].evaluation?.totalOverride) return state[i].totalMarks;
    const vals = criteria.map((c) => d.points[c.id]?.trim()).filter(Boolean);
    return vals.length ? round(vals.reduce((s, v) => s + (Number(v) || 0), 0)) : null;
  };
  const complete = (i: number) => (criteria.length ? criteria.every((c) => drafts[i].points[c.id]?.trim()) : drafts[i].total.trim() !== "");
  const locked = (i: number) => state[i].evalStatus === "SUBMITTED" || state[i].evalStatus === "FINALIZED";

  const phaseOf = (r: SheetRow) => {
    if (!r.booking) return "none" as const;
    const s = new Date(r.booking.startsAt).getTime();
    const e = new Date(r.booking.endsAt).getTime();
    return now >= e ? ("past" as const) : now >= s ? ("live" as const) : ("future" as const);
  };

  const ready = useMemo(
    () => state.flatMap((s, i) => (s.evaluationId && (s.evalStatus === "DRAFT" || s.evalStatus === "RETURNED") && s.save.kind !== "error" && complete(i) ? [s.evaluationId] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, drafts],
  );
  const stillRunning = isToday && rows.some((r) => r.booking && new Date(r.booking.endsAt).getTime() > now);
  const unsaved = state.some((s) => s.save.kind === "dirty" || s.save.kind === "saving");

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <TopBar links={links} assignment={assignment} title={title} />
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {mode === "todo" ? "Nothing left to mark. Nice work." : "No demos booked on this day."}
        </p>
      </div>
    );
  }

  const row = rows[current];
  const st = state[current];
  const d = drafts[current];
  const bad = problems(d, criteria, assignment.maxMarks);
  const phase = phaseOf(row);
  const needsReason = !row.booking && !st.evaluationId;
  const needsEarlyReason = Boolean(row.booking) && phase === "future" && !st.earlyOk && !locked(current);
  const noShow = st.bookingStatus === "NO_SHOW";
  const readOnly = locked(current) || noShow || needsReason || needsEarlyReason;
  const canSubmitThis = embedded && st.evaluationId && (st.evalStatus === "DRAFT" || st.evalStatus === "RETURNED") && complete(current) && st.save.kind !== "error";

  return (
    <div className={cn("space-y-4", !embedded && "mx-auto max-w-5xl")}>
      {!embedded && <TopBar links={links} assignment={assignment} title={title} />}

      {restorable.length > 0 && (
        <div role="alert" data-sync="conflict" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          <p className="flex-1">
            <strong>Changed elsewhere:</strong> this device has unsaved marks for {restorable.map((r) => rows[r.i].student.name).join(", ")} from{" "}
            {new Date(Math.max(...restorable.map((r) => r.entry.at))).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, but the
            saved marks have changed since.
          </p>
          <Button
            size="sm"
            onClick={() => {
              restorable.forEach((r) => restore(r.i, r.entry.draft));
              setRestorable([]);
            }}
          >
            Use this device&apos;s marks
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              restorable.forEach((r) => local(() => deleteDraft(offlineOwner, assignment.id, r.entry.studentId).then(() => announceDrafts({ type: "changed" }))));
              setRestorable([]);
            }}
          >
            Discard them
          </Button>
        </div>
      )}

      {/* Progress: one segment per demo, coloured by state; the live one fills as time passes. */}
      <div className={cn("space-y-1.5", embedded && "hidden")}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {current + 1} / {rows.length}
          </span>
          {row.booking && (
            <span className="tabular-nums">
              {mode !== "day" && `${row.booking.day}, `}
              {row.booking.time}
              {phase === "live" && ` · ${formatLeft(new Date(row.booking.endsAt).getTime() - now)}`}
              {phase === "future" && ` · starts ${formatUntil(new Date(row.booking.startsAt).getTime() - now)}`}
            </span>
          )}
          <span className="ml-auto">{timezoneLabel}</span>
        </div>
        <ol className="flex h-2.5 gap-0.5" aria-label="Progress through the demos">
          {rows.map((r, i) => {
            const tone = segmentTone(r, state[i], phaseOf(r), complete(i));
            const p = phaseOf(r);
            const pct =
              p === "live" && r.booking
                ? ((now - new Date(r.booking.startsAt).getTime()) / (new Date(r.booking.endsAt).getTime() - new Date(r.booking.startsAt).getTime())) * 100
                : 0;
            return (
              <li key={r.student.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  title={`${r.booking?.time ?? "No booking"} · ${r.student.name} · ${SEGMENT_LABEL[tone]}`}
                  aria-label={`${r.student.name}, ${SEGMENT_LABEL[tone]}`}
                  aria-current={i === current ? "step" : undefined}
                  className={cn("relative block h-full w-full overflow-hidden rounded-sm", SEGMENT[tone], i === current && "outline-2 outline-offset-1 outline-foreground")}
                >
                  {p === "live" && <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* The student being marked */}
      <section aria-label={`Marking ${row.student.name}`} className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className={cn("min-w-0 flex-1", embedded && "hidden")}>
            <h2 className="text-xl font-semibold leading-tight">{row.student.name}</h2>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{row.student.email}</span>
              {row.booking?.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" /> {row.booking.venue}
                </span>
              )}
              {links.scope?.current === "everyone" && row.booking && <span>Host: {row.booking.host}</span>}
              <Link className="underline" href={`${links.details}/${row.student.id}`}>
                Booking &amp; details
              </Link>
            </p>
          </div>
          <SaveIndicator state={st.save} />
        </div>

        {needsEarlyReason && (
          <ReasonPrompt
            title="This demo hasn't happened yet."
            body="Marking before the demo is unusual, so your reason is kept with the marks and in the audit log."
            placeholder="Why? e.g. demo taken early by arrangement"
            label="Reason for marking before the demo"
            value={d.earlyMarkReason}
            onChange={(v) => setDrafts((ds) => ds.map((x, j) => (j === current ? { ...x, earlyMarkReason: v } : x)))}
            onStart={() => void save(current)}
          />
        )}
        {row.evaluation?.earlyMarkReason && <p className="text-xs text-muted-foreground">Marked before the demo: “{row.evaluation.earlyMarkReason}”</p>}

        {row.booking ? (
          <Attendance
            key={row.booking.id}
            bookingId={row.booking.id}
            name={row.student.name}
            status={st.bookingStatus!}
            started={phase !== "future"}
            locked={locked(current)}
            onChange={(s) => patchState(current, { bookingStatus: s })}
          />
        ) : (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium">{row.student.name} has no demo booking.</p>
              {st.evaluationId ? (
                <p>Marked without a booking{row.evaluation?.noBookingReason ? `: “${row.evaluation.noBookingReason}”` : ""}. This is recorded in the audit log.</p>
              ) : (
                <>
                  <p>Marking without a booking is unusual, so it&apos;s recorded with your reason in the audit log.</p>
                  <ReasonInput
                    placeholder="Why? e.g. demo taken in class on 3 Oct"
                    label="Reason for marking without a booking"
                    value={d.noBookingReason}
                    onChange={(v) => setDrafts((ds) => ds.map((x, j) => (j === current ? { ...x, noBookingReason: v } : x)))}
                    onStart={() => void save(current)}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {row.evaluation?.reviewComment && st.evalStatus === "RETURNED" && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <span className="font-medium">Reopened for changes:</span> {row.evaluation.reviewComment}
          </p>
        )}
        {locked(current) && !embedded && (
          <p className="text-sm text-muted-foreground">
            {st.evalStatus === "FINALIZED"
              ? "Marks are final and released to the student."
              : row.evaluation?.releasesOn
                ? `Released: the student sees them on ${row.evaluation.releasesOn}.`
                : "Submitted — waiting for the instructor's review."}{" "}
            Open{" "}
            <Link className="underline" href={`${links.details}/${row.student.id}`}>
              details
            </Link>{" "}
            {row.evaluation?.releasesOn && st.evalStatus === "SUBMITTED" ? "to withdraw them." : "to see or unlock them."}
          </p>
        )}

        <fieldset disabled={readOnly} className={cn("space-y-4", readOnly && "opacity-60")}>
          <legend className="sr-only">Marks</legend>
          <ScoreGrid
            key={current}
            criteria={criteria}
            maxMarks={assignment.maxMarks}
            draft={d}
            problems={bad}
            total={totalOf(current)}
            overridden={row.evaluation?.totalOverride ?? false}
            onPoints={(id, v) => edit(current, (x) => ({ points: { ...x.points, [id]: v } }))}
            onTotal={(v) => edit(current, { total: v })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Feedback for the student</span>
              <Textarea id="feedback" rows={2} value={d.feedback} onChange={(e) => edit(current, { feedback: e.target.value })} maxLength={5000} />
            </label>
            <div className="space-y-2">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Your private note</span> <span className="text-xs text-muted-foreground">(only you and the course instructors see it)</span>
                <Textarea rows={2} value={d.privateNotes} onChange={(e) => edit(current, { privateNotes: e.target.value })} maxLength={5000} />
              </label>
              <PrivateNotes notes={row.evaluation?.notes ?? []} skipMine />
            </div>
          </div>
        </fieldset>

        {embedded && !locked(current) && (
          <ActionForm
            action={submitManyAction}
            track="marking"
            compact
            className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm"
            confirm={
              finalOnSubmit
                ? holdHours
                  ? `Release these marks (${totalOf(current) ?? "–"} / ${assignment.maxMarks})? The student sees them in ${holdHours} hours and is notified then. You can withdraw them until then.`
                  : `Release these marks (${totalOf(current) ?? "–"} / ${assignment.maxMarks})? The student is notified and they become final.`
                : undefined
            }
            confirmLabel="Release marks"
          >
            <input type="hidden" name="evaluationId" value={st.evaluationId ?? ""} />
            <span className="flex-1 text-muted-foreground">
              {!canSubmitThis
                ? "Marks save as you type. Score every row to submit."
                : finalOnSubmit
                  ? holdHours
                    ? `The student sees the marks ${holdHours} hours after you release them.`
                    : "The student sees the marks as soon as you release them."
                  : "The instructor reviews the marks before the student sees them."}
            </span>
            <SubmitButton disabled={!canSubmitThis || unsaved}>
              {finalOnSubmit ? (st.evalStatus === "RETURNED" ? "Release corrected marks" : "Release marks") : "Submit for review"}
            </SubmitButton>
          </ActionForm>
        )}

        <div className={cn("flex flex-wrap items-center gap-2 border-t pt-3", embedded && "hidden")}>
          <Button type="button" variant="outline" onClick={() => go(current - 1)} disabled={current === 0}>
            <ChevronLeft /> Back
          </Button>
          <Button type="button" onClick={() => go(current + 1)} disabled={current === rows.length - 1}>
            Next {rows[current + 1] && `· ${rows[current + 1].student.name.split(" ")[0]}`} <ChevronRight />
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">Alt + ← / → or Ctrl + Enter</span>
          {isToday && (
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow the clock
            </label>
          )}
          {isToday && follow && followed === null && liveIndex(now) >= 0 && liveIndex(now) !== current && (
            <Button type="button" size="sm" variant="ghost" onClick={() => go(liveIndex(now))}>
              Jump to now
            </Button>
          )}
        </div>
      </section>

      {/* The whole day at a glance, spreadsheet-style. */}
      <section aria-label="All demos" className={cn("space-y-2", embedded && "hidden")}>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">{mode === "day" ? "Time" : "Demo"}</th>
                <th className="px-2 py-1.5 font-medium">Student</th>
                <th className="px-2 py-1.5 font-medium">Attendance</th>
                {criteria.map((c) => (
                  <th key={c.id} className="max-w-24 truncate px-2 py-1.5 text-right font-medium" title={c.label}>
                    {c.label} <span className="font-normal">/{c.maxPoints}</span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">Total /{assignment.maxMarks}</th>
                <th className="px-2 py-1.5 font-medium">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => {
                const total = totalOf(i);
                return (
                  <tr
                    key={r.student.id}
                    onClick={() => go(i)}
                    aria-current={i === current ? "true" : undefined}
                    className={cn("cursor-pointer hover:bg-muted/50", i === current && "bg-primary/10 hover:bg-primary/10")}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{r.booking ? (mode === "day" ? r.booking.time : `${r.booking.day} ${r.booking.time}`) : "—"}</td>
                    <td className="max-w-40 truncate px-2 py-1.5 font-medium">{r.student.name}</td>
                    <td className="px-2 py-1.5">{attendanceLabel(state[i].bookingStatus, phaseOf(r))}</td>
                    {criteria.map((c) => (
                      <td key={c.id} className="px-2 py-1.5 text-right tabular-nums">
                        {drafts[i].points[c.id] || <span className="text-muted-foreground">·</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{total ?? <span className="text-muted-foreground">·</span>}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{marksLabel(state[i], complete(i), Boolean(rows[i].evaluation?.releasesOn))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Submitting is a separate step, once the demos are over. */}
        {stillRunning ? (
          <p className="text-xs text-muted-foreground">Marks save as you type. {finalOnSubmit ? "Release" : "Submit"} them once today&apos;s demos are over.</p>
        ) : ready.length > 0 ? (
          <ActionForm
            action={submitManyAction}
            track="marking"
            compact
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm"
            confirm={
              finalOnSubmit
                ? holdHours
                  ? `Release ${ready.length} mark${ready.length === 1 ? "" : "s"}? Students see them in ${holdHours} hours and are notified then. You can withdraw them until then.`
                  : `Release ${ready.length} mark${ready.length === 1 ? "" : "s"}? Students are notified and the marks become final.`
                : undefined
            }
            confirmLabel="Release marks"
          >
            {ready.map((id) => (
              <input key={id} type="hidden" name="evaluationId" value={id} />
            ))}
            <span className="flex-1">
              {ready.length} complete mark{ready.length === 1 ? "" : "s"} ready.{" "}
              {finalOnSubmit
                ? holdHours
                  ? `Students see them ${holdHours} hours after you release them.`
                  : "Students see them as soon as you release them."
                : "The instructor reviews them before students see them."}
            </span>
            <SubmitButton disabled={unsaved}>{finalOnSubmit ? `Release ${ready.length} mark${ready.length === 1 ? "" : "s"}` : `Submit ${ready.length} for review`}</SubmitButton>
          </ActionForm>
        ) : null}
      </section>
    </div>
  );
}

function ReasonInput({ value, onChange, onStart, placeholder, label }: { value: string; onChange: (v: string) => void; onStart: () => void; placeholder: string; label: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="min-w-0 flex-1 bg-background" maxLength={REASON_MAX_LENGTH} />
      <Button type="button" size="sm" disabled={value.trim().length < 3} onClick={onStart}>
        Start marking
      </Button>
    </div>
  );
}

function ReasonPrompt(props: { title: string; body: string } & React.ComponentProps<typeof ReasonInput>) {
  const { title, body, ...input } = props;
  return (
    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{title}</p>
        <p>{body}</p>
        <ReasonInput {...input} />
      </div>
    </div>
  );
}

function TopBar({ links, assignment, title }: { links: Props["links"]; assignment: Props["assignment"]; title: string }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Back">
        <Link href={links.back}>
          <ChevronLeft />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">
          <Link href={links.course} className="hover:underline">
            {assignment.courseCode}
          </Link>
          {" › "}
          <Link href={links.assignment} className="hover:underline">
            {assignment.title}
          </Link>
        </p>
        <h1 className="flex items-center gap-1 text-lg font-semibold">
          {links.prevDay && (
            <Link href={links.prevDay} aria-label="Previous day" className="rounded p-0.5 text-muted-foreground hover:bg-muted">
              <ChevronLeft className="size-4" />
            </Link>
          )}
          {title}
          {links.nextDay && (
            <Link href={links.nextDay} aria-label="Next day" className="rounded p-0.5 text-muted-foreground hover:bg-muted">
              <ChevronRight className="size-4" />
            </Link>
          )}
        </h1>
      </div>
      {links.scope && (
        <div className="flex rounded-lg border p-0.5 text-xs" role="group" aria-label="Whose demos">
          {(["mine", "everyone"] as const).map((s) => (
            <Link
              key={s}
              href={links.scope![s]}
              aria-current={links.scope!.current === s ? "true" : undefined}
              className={cn("rounded-md px-2.5 py-1", links.scope!.current === s ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {s === "mine" ? "My demos" : "Everyone"}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

/** Rubric as one compact row of score cells; Enter moves to the next cell like a spreadsheet. */
function ScoreGrid({
  criteria,
  maxMarks,
  draft,
  problems,
  total,
  overridden,
  onPoints,
  onTotal,
}: {
  criteria: Criterion[];
  maxMarks: number;
  draft: Draft;
  problems: Record<string, string>;
  total: number | null;
  overridden: boolean;
  onPoints: (criterionId: string, value: string) => void;
  onTotal: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const autofocus = useRef(true);
  useEffect(() => {
    // Ready to type as soon as a student opens (but don't steal focus on a phone).
    if (autofocus.current && window.matchMedia("(pointer: fine)").matches) ref.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    autofocus.current = false;
  }, []);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const inputs = [...(ref.current?.querySelectorAll<HTMLInputElement>("input") ?? [])];
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) next.focus();
    else document.getElementById("feedback")?.focus();
  };

  if (criteria.length === 0) {
    return (
      <div ref={ref} className="flex items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Mark</span>
          <span className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={maxMarks}
              step={MARK_STEP}
              value={draft.total}
              onChange={(e) => onTotal(e.target.value)}
              onKeyDown={onKeyDown}
              aria-invalid={Boolean(problems.total)}
              className="w-24 text-right text-lg font-semibold tabular-nums"
              aria-label="Total marks"
            />
            <span className="text-muted-foreground">/ {maxMarks}</span>
          </span>
        </label>
        {problems.total && <p className="pb-2 text-xs text-destructive">Must be {problems.total}</p>}
      </div>
    );
  }

  return (
    <div ref={ref} className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
      {criteria.map((c) => (
        <label key={c.id} className={cn("rounded-lg border p-2", problems[c.id] && "border-destructive")}>
          <span className="block truncate text-xs text-muted-foreground" title={c.label}>
            {c.label}
          </span>
          <span className="mt-1 flex items-baseline gap-1">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={c.maxPoints}
              step={MARK_STEP}
              value={draft.points[c.id] ?? ""}
              onChange={(e) => onPoints(c.id, e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={c.label}
              aria-invalid={Boolean(problems[c.id])}
              className="h-9 w-full text-right text-lg font-semibold tabular-nums"
            />
            <span className="shrink-0 text-sm text-muted-foreground">/{c.maxPoints}</span>
          </span>
          {problems[c.id] && <span className="mt-1 block text-xs text-destructive">Must be {problems[c.id]}</span>}
        </label>
      ))}
      <div className="rounded-lg bg-muted p-2">
        <span className="block text-xs text-muted-foreground">Total{overridden && " (overridden)"}</span>
        <span className="mt-1 flex h-9 items-baseline justify-end gap-1">
          <span className="text-2xl font-semibold tabular-nums" aria-label="Total marks">
            {total ?? "–"}
          </span>
          <span className="text-sm text-muted-foreground">/{maxMarks}</span>
        </span>
      </div>
    </div>
  );
}

function Attendance({
  bookingId,
  name,
  status,
  started,
  locked,
  onChange,
}: {
  bookingId: string;
  name: string;
  status: RowState["bookingStatus"];
  started: boolean;
  locked: boolean;
  onChange: (s: "BOOKED" | "COMPLETED" | "NO_SHOW") => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Attendance needs Uniflow (it tells the student and changes their booking): never queued.
  const net = useNetworkGuard();
  const set = async (s: "BOOKED" | "COMPLETED" | "NO_SHOW") => {
    setPending(true);
    setConfirming(false);
    const r = await sheetAttendanceAction(bookingId, s).catch(() => ({ ok: false as const, error: "Couldn't reach Uniflow." }));
    setPending(false);
    if (r.ok) onChange(r.value);
    else toast.error(r.error);
  };
  if (!started) return <p className="text-sm text-muted-foreground">Attendance can be recorded once the demo starts.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Attendance</span>
      <div className="flex rounded-lg border p-0.5" role="group" aria-label="Attendance">
        <button
          type="button"
          disabled={pending || locked}
          aria-pressed={status === "COMPLETED"}
          {...net.props}
          onClick={net.guard(() => void set(status === "COMPLETED" ? "BOOKED" : "COMPLETED"))}
          className={cn("flex items-center gap-1 rounded-md px-3 py-1 data-[offline=blocked]:cursor-not-allowed data-[offline=blocked]:text-offline", status === "COMPLETED" ? "bg-emerald-600 text-white" : "hover:bg-muted")}
        >
          <Check className="size-3.5" /> Present
        </button>
        <button
          type="button"
          disabled={pending || locked}
          aria-pressed={status === "NO_SHOW"}
          {...net.props}
          onClick={net.guard(() => (status === "NO_SHOW" ? void set("BOOKED") : setConfirming(true)))}
          className={cn("flex items-center gap-1 rounded-md px-3 py-1 data-[offline=blocked]:cursor-not-allowed data-[offline=blocked]:text-offline", status === "NO_SHOW" ? "bg-foreground text-background" : "hover:bg-muted")}
        >
          <UserRound className="size-3.5" /> No-show
        </button>
      </div>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {status === "BOOKED" && !pending && <span className="text-xs text-muted-foreground">Entering a mark records them as present.</span>}
      {confirming && (
        <span className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-2 py-1 text-xs">
          {name} will get an email saying they missed their demo.
          <Button type="button" size="xs" variant="destructive" offline="network" onClick={() => void set("NO_SHOW")}>
            Mark no-show
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      )}
    </div>
  );
}

/**
 * One row's sync state (#161, agreed design: step 4 on #160), styled through `data-sync`:
 * Saved on this device (neutral dot), Syncing (spinner), Saved (success colour for 2 s,
 * then nothing), or the server's message when it refused the marks (needs attention).
 */
function SaveIndicator({ state }: { state: SaveState }) {
  const savedAt = state.kind === "saved" ? state.at : null;
  const [faded, setFaded] = useState<string | null>(null);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setFaded(savedAt), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);
  const fresh = savedAt !== null && faded !== savedAt;
  switch (state.kind) {
    case "dirty":
    case "local":
      return (
        <span data-sync="saved-local" className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <span className="size-1.5 rounded-full bg-offline" aria-hidden /> Saved on this device
        </span>
      );
    case "saving":
      return (
        <span data-sync="syncing" className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Syncing
        </span>
      );
    case "saved":
      return fresh ? (
        <span data-sync="synced" className="flex items-center gap-1 text-xs text-success" role="status">
          <Check className="size-3.5" aria-hidden /> Saved
        </span>
      ) : null;
    case "error":
      return (
        <span data-sync="error" className="flex max-w-xs items-center gap-1 text-xs text-destructive" role="alert">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden /> {state.message}
        </span>
      );
    default:
      return null;
  }
}

type Segment = "done" | "draft" | "noshow" | "missing" | "live" | "upcoming" | "todo";

const SEGMENT: Record<Segment, string> = {
  done: "bg-emerald-500",
  draft: "bg-amber-400",
  todo: "bg-amber-200 dark:bg-amber-900",
  noshow: "bg-muted-foreground/50",
  missing: "bg-red-500",
  live: "bg-primary/30",
  upcoming: "bg-muted",
};

const SEGMENT_LABEL: Record<Segment, string> = {
  done: "marked",
  draft: "marks started",
  todo: "to mark",
  noshow: "no-show",
  missing: "attendance missing",
  live: "in progress",
  upcoming: "coming up",
};

function segmentTone(r: SheetRow, s: RowState, phase: "past" | "live" | "future" | "none", complete: boolean): Segment {
  if (s.bookingStatus === "NO_SHOW") return "noshow";
  if (s.evalStatus === "SUBMITTED" || s.evalStatus === "FINALIZED" || (complete && s.evaluationId)) return "done";
  if (phase === "live") return "live";
  if (s.evaluationId) return "draft";
  if (phase === "past" && s.bookingStatus === "BOOKED") return "missing";
  if (phase === "future") return "upcoming";
  return "todo";
}

function attendanceLabel(status: RowState["bookingStatus"], phase: "past" | "live" | "future" | "none") {
  if (!status) return <span className="text-muted-foreground">No booking</span>;
  if (status === "COMPLETED") return <span className="text-emerald-700 dark:text-emerald-400">Present</span>;
  if (status === "NO_SHOW") return <span className="text-muted-foreground">No-show</span>;
  if (phase === "past") return <span className="text-red-700 dark:text-red-400">Missing</span>;
  if (phase === "live") return <span className="font-medium text-primary">Now</span>;
  return <span className="text-muted-foreground">Booked</span>;
}

function marksLabel(s: RowState, complete: boolean, held: boolean) {
  if (s.save.kind === "error") return <span className="text-destructive">Not saved</span>;
  if (s.evalStatus === "FINALIZED") return <span className="text-emerald-700 dark:text-emerald-400">Final</span>;
  if (s.evalStatus === "SUBMITTED") return <span className="text-emerald-700 dark:text-emerald-400">{held ? "Released (held)" : "Submitted"}</span>;
  if (s.evalStatus === "RETURNED") return <span className="text-amber-700 dark:text-amber-400">Returned</span>;
  if (s.evaluationId) return complete ? <span>Draft · complete</span> : <span className="text-amber-700 dark:text-amber-400">Draft</span>;
  return <span className="text-muted-foreground">—</span>;
}

