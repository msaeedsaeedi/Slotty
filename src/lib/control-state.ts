/**
 * Which state a control shows when several apply (#161, agreed design: step 4 on #160).
 *
 * 1. `disabled`: not allowed by a business rule (a full slot, a closed window), so the
 *    control never promises that a connection would fix it.
 * 2. `pending`: its request is on the way.
 * 3. `offline`: allowed once Uniflow can be reached (policy `network`).
 * 4. `invalid`: what was typed needs fixing.
 * 5. `default`: hover and pressed come from CSS on top of this.
 *
 * Focus-visible always shows, whatever the state (CSS, for accessibility).
 */
export type ControlState = "disabled" | "pending" | "offline" | "invalid" | "default";

export function controlState(c: { disabled?: boolean; pending?: boolean; offline?: boolean; invalid?: boolean }): ControlState {
  if (c.disabled) return "disabled";
  if (c.pending) return "pending";
  if (c.offline) return "offline";
  if (c.invalid) return "invalid";
  return "default";
}
