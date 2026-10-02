"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addAvailabilityAction } from "@/app/actions/scheduling";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateSlots, overlaps } from "@/domain/slots";
import { fmtTime, fromLocalInput, type Clock } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  courseId: string;
  assignmentId: string;
  timezone: string;
  timezoneLabel: string;
  clock: Clock;
  policy: { windowStart: string; windowEnd: string; slotDurationMin: number; bufferMin: number };
  /** Every day of the demo window, in the course timezone. */
  days: { key: string; weekday: string; date: string; past: boolean }[];
  /** Who the user may add slots for (just themselves, for a TA). */
  hosts: { id: string; name: string }[];
  me: string;
  venues: { id: string; name: string }[];
  /** Existing slots of the course's staff (any assignment), to show what's taken. */
  busy: { taId: string; startsAt: string; endsAt: string }[];
  open: boolean;
}

/**
 * Add slots without keeping anything in your head: pick the days, the hours,
 * and see exactly what will be created (and what's already taken) before saving.
 */
export function AvailabilityPlanner({ courseId, assignmentId, timezone, timezoneLabel, clock, policy, days, hosts, me, venues, busy, open }: Props) {
  const [host, setHost] = useState(hosts.some((h) => h.id === me) ? me : hosts[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("12:00");

  const busyFor = useMemo(() => busy.filter((b) => b.taId === host).map((b) => ({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) })), [busy, host]);
  const takenPerDay = useMemo(() => {
    // en-CA formats as YYYY-MM-DD, matching the day keys.
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const m = new Map<string, number>();
    for (const b of busyFor) m.set(dayKey.format(b.startsAt), (m.get(dayKey.format(b.startsAt)) ?? 0) + 1);
    return m;
  }, [busyFor, timezone]);

  const timeError = from && to && to <= from ? "End time must be after the start time." : null;
  const preview = useMemo(() => {
    if (timeError || !from || !to) return [];
    return days
      .filter((d) => picked.has(d.key))
      .map((d) => {
        const timings = generateSlots({
          blockStart: fromLocalInput(`${d.key}T${from}`, timezone),
          blockEnd: fromLocalInput(`${d.key}T${to}`, timezone),
          slotDurationMin: policy.slotDurationMin,
          bufferMin: policy.bufferMin,
          windowStart: new Date(policy.windowStart),
          windowEnd: new Date(policy.windowEnd),
        });
        const fresh = timings.filter((t) => !busyFor.some((b) => overlaps(b, t)));
        return { day: d, fresh, skipped: timings.length - fresh.length };
      });
  }, [days, picked, from, to, timezone, policy, busyFor, timeError]);
  const total = preview.reduce((n, p) => n + p.fresh.length, 0);

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ActionForm action={addAvailabilityAction} className="space-y-4" onSuccess={() => setPicked(new Set())}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="taId" value={host} />
      {[...picked].map((d) => (
        <input key={d} type="hidden" name="date" value={d} />
      ))}

      {hosts.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="host">Who hosts them</Label>
          <select id="host" value={host} onChange={(e) => setHost(e.target.value)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.id === me ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Slots are added for you.</p>
      )}

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Days</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {days.map((d) => {
            const on = picked.has(d.key);
            const taken = takenPerDay.get(d.key) ?? 0;
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={on}
                disabled={d.past}
                onClick={() => toggle(d.key)}
                title={d.past ? "This day is over" : taken ? `${taken} slot${taken === 1 ? "" : "s"} already on this day` : undefined}
                className={cn(
                  "flex flex-col items-center rounded-lg border px-1 py-1 text-xs transition-colors disabled:opacity-40",
                  on ? "border-primary bg-primary text-primary-foreground" : "enabled:hover:bg-muted",
                )}
              >
                <span className="font-medium">{d.weekday}</span>
                <span className={on ? "" : "text-muted-foreground"}>{d.date}</span>
                <span className={cn("text-[10px]", on ? "opacity-80" : taken ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground/60")}>
                  {taken ? `${taken} set` : "free"}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="startTime">From</Label>
          <Input id="startTime" name="startTime" type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endTime">To</Label>
          <Input id="endTime" name="endTime" type="time" value={to} onChange={(e) => setTo(e.target.value)} required aria-invalid={Boolean(timeError)} />
        </div>
      </div>
      {timeError && <p className="text-xs text-destructive">{timeError}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="venueId">Where</Label>
        <select id="venueId" name="venueId" className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
          <option value="">To be announced</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option disabled>Google Meet (automatic link) — coming soon</option>
        </select>
        {venues.length === 0 && (
          <p className="text-xs text-muted-foreground">
            <Link className="underline" href={`/courses/${courseId}/manage/venues`}>
              Add venues
            </Link>{" "}
            so students know where to go.
          </p>
        )}
      </div>

      <div className="rounded-lg bg-muted/60 p-3 text-xs" aria-live="polite">
        {picked.size === 0 ? (
          <p className="text-muted-foreground">
            Pick one or more days. Each becomes {policy.slotDurationMin}-minute slots{policy.bufferMin ? ` with ${policy.bufferMin}-minute breaks` : ""}. All times
            are {timezoneLabel}.
          </p>
        ) : (
          <ul className="space-y-1">
            {preview.map((p) => (
              <li key={p.day.key} className="flex justify-between gap-2">
                <span className="font-medium">
                  {p.day.weekday} {p.day.date}
                </span>
                <span className="text-right">
                  {p.fresh.length > 0
                    ? `${p.fresh.length} slot${p.fresh.length === 1 ? "" : "s"}, ${fmtTime(p.fresh[0].startsAt, timezone, clock)}–${fmtTime(p.fresh.at(-1)!.endsAt, timezone, clock)}`
                    : "nothing new"}
                  {p.skipped > 0 && <span className="block text-muted-foreground">{p.skipped} skipped — host already busy</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SubmitButton className="w-full" disabled={total === 0}>
        {total ? `Add ${total} slot${total === 1 ? "" : "s"}` : "Add slots"}
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        {open ? "Booking is open, so students can book these straight away." : "Students can't see them until you open booking."}
      </p>
    </ActionForm>
  );
}
