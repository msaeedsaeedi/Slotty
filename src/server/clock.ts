import "server-only";
import { cache } from "react";
import { setClockSource, type Clock } from "@/lib/time";

/**
 * The viewer's 12h/24h preference for the current request. React's `cache`
 * hands every server component in one request the same cell, so the session
 * lookup sets it once and every `fmt` call in that render reads it.
 */
const cell = cache((): { clock: Clock } => ({ clock: "12h" }));

export function setRequestClock(clock: Clock): void {
  cell().clock = clock;
}

setClockSource(() => cell().clock);
