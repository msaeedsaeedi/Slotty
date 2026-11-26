/**
 * Marking drafts uploaded from a device, possibly long after they were typed (#163; agreed
 * design: step 3 on #160). Pure rules shared by the upload route and its tests.
 */

/** The version of an evaluation that doesn't exist yet. */
export const NEW_EVALUATION = "new";

/** Drafts left by an account after another one signs in on the device are deleted after this. */
export const SEALED_DRAFT_DAYS = 7;

/**
 * The version a device keeps with a draft: when the evaluation last changed, or `new`. Any
 * change to the evaluation (another TA's save, a submit, a review, an unlock) changes it.
 */
export function evaluationVersion(e: { updatedAt: Date } | null): string {
  return e ? e.updatedAt.toISOString() : NEW_EVALUATION;
}

/**
 * What to do with one upload:
 * - `repeat`: this exact upload was already saved (its reply was lost): answer "saved", change nothing.
 * - `conflict`: the evaluation changed since the device's copy started from it: save nothing.
 * - `save`: the device's copy is on top of what the server has.
 *
 * A repeat wins over a conflict: once the upload went through, a later change by someone else
 * is theirs to make, and the device's copy has done its job.
 */
export function checkDraftUpload(
  current: { version: string; lastClientChangeId: string | null } | null,
  upload: { baseVersion: string; changeId: string },
): "save" | "repeat" | "conflict" {
  if (current && current.lastClientChangeId === upload.changeId) return "repeat";
  return (current?.version ?? NEW_EVALUATION) === upload.baseVersion ? "save" : "conflict";
}

/** Sealed drafts older than SEALED_DRAFT_DAYS are deleted. */
export function sealedExpired(sealedAt: number, now: number): boolean {
  return now - sealedAt >= SEALED_DRAFT_DAYS * 86_400_000;
}
