import { createHmac } from "node:crypto";

/**
 * Usage analytics is on only where ANALYTICS_SECRET is set (production, from
 * SSM). Dev, end-to-end and integration runs leave it unset, so they record
 * nothing. Feedback and surveys don't depend on it.
 */
export function analyticsEnabled(): boolean {
  return Boolean(process.env.ANALYTICS_SECRET);
}

/**
 * The pseudonymous visitor key: a keyed hash of the user id. It counts unique
 * people and follows funnels without storing who they are. Re-identifying
 * someone would need the secret, which lives only in SSM.
 */
export function pseudonym(userId: string): string {
  const secret = process.env.ANALYTICS_SECRET;
  if (!secret) throw new Error("ANALYTICS_SECRET is not set");
  return createHmac("sha256", secret).update(userId).digest("base64url").slice(0, 22);
}

/** The running release: the image tag in AWS, else the package version. */
export function appVersion(): string {
  return (process.env.APP_VERSION || process.env.npm_package_version || "unknown").slice(0, 40);
}
