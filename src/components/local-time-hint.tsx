"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => null;

/** Offset of `timeZone` from UTC at `at`, in minutes. */
function offsetMinutes(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Times are shown in the course timezone. When the viewer's device is elsewhere
 * (e.g. a student abroad), say so and give the difference.
 */
export function LocalTimeHint({ timezone }: { timezone: string }) {
  const mine = useSyncExternalStore(subscribe, deviceZone, serverZone);
  if (!mine || mine === timezone) return null;
  const now = new Date();
  const diff = offsetMinutes(mine, now) - offsetMinutes(timezone, now);
  if (diff === 0) return null;
  const hours = Math.abs(diff) / 60;
  const amount = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" role="note">
      Times are in the course timezone ({timezone}). Your device is on {mine}, which is {amount} {diff > 0 ? "ahead" : "behind"}.
    </p>
  );
}
