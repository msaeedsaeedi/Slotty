import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** How clock times are shown: "2:30 PM" or "14:30". */
export type Clock = "12h" | "24h";

let clockSource: () => Clock = () => "12h";

/**
 * Where `fmt` gets the viewer's clock preference. The server points this at the
 * signed-in user's setting for the current request (server/clock.ts); anywhere
 * else (worker emails, client components) gets the 12-hour default.
 */
export function setClockSource(source: () => Clock): void {
  clockSource = source;
}

export const currentClock = (): Clock => clockSource();

/** Patterns are written with 24-hour "HH:mm"; the 12-hour clock swaps in "h:mm a". */
function withClock(pattern: string, clock: Clock): string {
  return clock === "24h" ? pattern : pattern.replace(/HH:mm/g, "h:mm a");
}

/** Format a UTC instant in the course's timezone, using the viewer's clock (12h/24h). */
export function fmt(date: Date, timezone: string, pattern = "EEE d MMM yyyy, HH:mm", clock: Clock = clockSource()): string {
  return format(new TZDate(date, timezone), withClock(pattern, clock));
}

/** Format for data, not people (CSV exports, form values, day keys): never changes with the clock setting. */
export function fmtData(date: Date, timezone: string, pattern: string): string {
  return format(new TZDate(date, timezone), pattern);
}

/** "9:00 AM", or "09:00" on the 24-hour clock. */
export function fmtTime(date: Date, timezone: string, clock: Clock = clockSource()): string {
  return fmt(date, timezone, "HH:mm", clock);
}

/** "9:00–9:15 AM" (AM/PM written once when both ends share it), or "09:00–09:15". */
export function fmtTimeRange(start: Date, end: Date, timezone: string, clock: Clock = clockSource()): string {
  if (clock === "24h") return `${fmtTime(start, timezone, clock)}–${fmtTime(end, timezone, clock)}`;
  const sameHalf = fmt(start, timezone, "a", clock) === fmt(end, timezone, "a", clock);
  return `${fmt(start, timezone, sameHalf ? "h:mm" : "h:mm a", clock)}–${fmt(end, timezone, "h:mm a", clock)}`;
}

/** "Sat 3 Oct 2026, 9:00–9:15 AM". */
export function fmtRange(start: Date, end: Date, timezone: string): string {
  return `${fmt(start, timezone, "EEE d MMM yyyy")}, ${fmtTimeRange(start, end, timezone)}`;
}

/** Value for an <input type="datetime-local"> showing `date` in `timezone`. */
export function toLocalInput(date: Date, timezone: string): string {
  return fmtData(date, timezone, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Interpret a wall-clock value from <input type="datetime-local"> ("2026-10-05T09:00")
 * as a time in `timezone` and return the UTC instant.
 */
export function fromLocalInput(value: string, timezone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new RangeError(`Invalid date/time "${value}"`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(TZDate.tz(timezone, y, mo - 1, d, h, mi).getTime());
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The instants a calendar day ("2026-10-04") starts and ends in `timezone`. */
export function dayRange(day: string, timezone: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  return { start: new Date(TZDate.tz(timezone, y, m - 1, d).getTime()), end: new Date(TZDate.tz(timezone, y, m - 1, d + 1).getTime()) };
}

/** Timezones a course can be set to. Pakistan only for now; more will follow. */
export const SUPPORTED_TIMEZONES = [{ id: "Asia/Karachi", label: "Pakistan time (PKT, UTC+5)", short: "Pakistan time" }] as const;

export const DEFAULT_TIMEZONE = SUPPORTED_TIMEZONES[0].id;

/** "Pakistan time" rather than "Asia/Karachi". */
export function tzLabel(tz: string): string {
  return SUPPORTED_TIMEZONES.find((t) => t.id === tz)?.short ?? tz.replace(/_/g, " ");
}
