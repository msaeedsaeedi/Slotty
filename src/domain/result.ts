/** Outcome of a business-rule check: either allowed, or denied with a human-readable reason. */
export type RuleResult = { ok: true } | { ok: false; reason: string };

export const allow: RuleResult = { ok: true };
export const deny = (reason: string): RuleResult => ({ ok: false, reason });

/** Error thrown by services when a rule or permission check fails; its message is safe to show users. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" = "INVALID",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertRule(result: RuleResult, code: DomainError["code"] = "INVALID"): void {
  if (!result.ok) throw new DomainError(result.reason, code);
}
