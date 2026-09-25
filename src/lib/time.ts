import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** Format a UTC instant in the course's timezone. */
export function fmt(date: Date, timezone: string, pattern = "EEE d MMM yyyy, HH:mm"): string {
  return format(new TZDate(date, timezone), pattern);
}

export function fmtRange(start: Date, end: Date, timezone: string): string {
  return `${fmt(start, timezone)}–${fmt(end, timezone, "HH:mm")}`;
}

/** Value for an <input type="datetime-local"> showing `date` in `timezone`. */
export function toLocalInput(date: Date, timezone: string): string {
  return fmt(date, timezone, "yyyy-MM-dd'T'HH:mm");
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
