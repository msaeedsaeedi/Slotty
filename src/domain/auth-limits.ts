import { allow, deny, type RuleResult } from "./result";

/**
 * Abuse limits for sign-in and password reset (GHSA-mm5f). Counts come from
 * the `AuthAttempt` table, so every web task sees the same numbers.
 *
 * Sign-in, per account (keyed by the email typed, so unknown emails behave the
 * same and can't be told apart): the first few failures are free, then each one
 * doubles the wait, up to a cap. Failures older than the window are forgotten,
 * and a successful sign-in clears them.
 *
 * Sign-in and reset, per network: generous, because a whole campus can share
 * one address. Reset emails, per recipient: a small hourly cap, applied
 * silently so the form never reveals whether an account exists.
 */
export const AUTH_LIMITS = {
  signIn: {
    freeFailures: 5,
    firstWaitMs: 30_000,
    maxWaitMs: 15 * 60_000,
    windowMs: 60 * 60_000,
    perNetwork: 50,
    networkWindowMs: 15 * 60_000,
  },
  reset: {
    perRecipient: 3,
    perNetwork: 10,
    windowMs: 60 * 60_000,
  },
  /** Rows older than this are deleted by the worker. */
  keepMs: 24 * 60 * 60_000,
} as const;

const minutes = (ms: number) => {
  const m = Math.ceil(ms / 60_000);
  return m <= 1 ? "a minute" : `${m} minutes`;
};

/** How long an account must wait before the next try, given its recent failures. */
export function signInWaitMs(failures: number, lastFailureAt: Date | null, now: Date): number {
  const { freeFailures, firstWaitMs, maxWaitMs } = AUTH_LIMITS.signIn;
  if (failures < freeFailures || !lastFailureAt) return 0;
  const wait = Math.min(maxWaitMs, firstWaitMs * 2 ** (failures - freeFailures));
  return Math.max(0, lastFailureAt.getTime() + wait - now.getTime());
}

export function canTrySignIn(account: { failures: number; lastFailureAt: Date | null }, networkFailures: number | null, now: Date): RuleResult {
  const wait = signInWaitMs(account.failures, account.lastFailureAt, now);
  if (wait > 0) return deny(`Too many failed sign-ins for this email. Try again in ${minutes(wait)}, or reset your password.`);
  if (networkFailures !== null && networkFailures >= AUTH_LIMITS.signIn.perNetwork) {
    return deny(`Too many failed sign-ins from your network. Try again in ${minutes(AUTH_LIMITS.signIn.networkWindowMs)}.`);
  }
  return allow;
}

/** Refused outright: says nothing about any account. */
export function canRequestReset(networkRequests: number | null): RuleResult {
  if (networkRequests !== null && networkRequests >= AUTH_LIMITS.reset.perNetwork) {
    return deny(`Too many reset requests from your network. Try again in ${minutes(AUTH_LIMITS.reset.windowMs)}.`);
  }
  return allow;
}

/** Whether another reset (or invite) email may go to this recipient this hour. Applied silently. */
export function canEmailReset(sentToRecipient: number): boolean {
  return sentToRecipient < AUTH_LIMITS.reset.perRecipient;
}
