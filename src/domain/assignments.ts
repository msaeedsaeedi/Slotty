import { allow, deny, type RuleResult } from "./result";

/**
 * A new assignment's demo window must not be over already: nobody could book it. Only checked
 * when creating; an edit of a running or finished assignment keeps its window (to fix a typo, say).
 */
export function checkDemoWindow(args: { windowStart: Date; windowEnd: Date; now: Date }): RuleResult {
  if (args.windowEnd <= args.windowStart) return deny("The demo window must end after it starts.");
  if (args.windowEnd <= args.now) return deny("This demo window has already ended. Pick dates from now on.");
  return allow;
}
