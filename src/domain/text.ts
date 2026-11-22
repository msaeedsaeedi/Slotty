import { allow, deny, type RuleResult } from "./result";

/** One limit for every reason or comment sent to a student or to staff (cancel, decline, return, unlock, requests). */
export const REASON_MAX_LENGTH = 1000;

/** A reason or comment someone will read: required unless `required` is false, and at most REASON_MAX_LENGTH characters. */
export function checkReason(text: string | null | undefined, opts: { required?: boolean; missing?: string } = {}): RuleResult {
  const value = (text ?? "").trim();
  if (!value) return opts.required === false ? allow : deny(opts.missing ?? "Give a reason.");
  if (value.length > REASON_MAX_LENGTH) return deny(`Keep it to ${REASON_MAX_LENGTH} characters (this is ${value.length}).`);
  return allow;
}
