import { createHash } from "node:crypto";

/**
 * An opaque key for the signed-in account, sent to the browser so data kept on the device
 * (saved pages, marking drafts) can be tied to one account and dropped when another signs
 * in (#142). A hash of the user id, so the page never carries the id itself; it identifies
 * nothing outside this device.
 */
export function offlineOwner(userId: string): string {
  return createHash("sha256").update(`uniflow-offline:${userId}`).digest("base64url").slice(0, 22);
}
