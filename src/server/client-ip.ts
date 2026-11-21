/**
 * The client's address, for per-network abuse limits only (never stored as is).
 *
 * Behind the origin lock (`src/proxy.ts`, ORIGIN_VERIFY_SECRET set) every request came through
 * CloudFront, which sets `CloudFront-Viewer-Address` ("ip:port") itself and overwrites one sent
 * by the viewer, so it can be trusted. Anything else (X-Forwarded-For) can be forged there, so
 * without that header the answer is null and per-network limits are skipped rather than
 * lumping every user under one key. Without the lock (dev, tests) X-Forwarded-For is used.
 */
export function clientIp(headers: { get(name: string): string | null }, locked = Boolean(process.env.ORIGIN_VERIFY_SECRET)): string | null {
  const viewer = headers.get("cloudfront-viewer-address");
  if (viewer) return stripPort(viewer.trim());
  if (locked) return null;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

/** "203.0.113.7:4711" → "203.0.113.7"; "2001:db8::1:4711" → "2001:db8::1" (CloudFront's IPv6 form has no brackets). */
export function stripPort(address: string): string {
  const bracketed = address.match(/^\[(.+)\]:\d+$/);
  if (bracketed) return bracketed[1];
  const i = address.lastIndexOf(":");
  return i > 0 && /^\d+$/.test(address.slice(i + 1)) ? address.slice(0, i) : address;
}
