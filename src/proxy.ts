import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Origin lock for the AWS deployment, where the only way in is CloudFront → API Gateway.
 * CloudFront adds a secret `x-origin-verify` header. Requests that reach the API Gateway URL
 * directly (skipping CloudFront's TLS, caching and security headers) are refused.
 *
 * API Gateway replaces the forwarded host with its own execute-api hostname, which would fail
 * Next's Server Actions origin check. Verified requests did come through CloudFront for APP_URL,
 * so the forwarded host and protocol are set back to it.
 *
 * ORIGIN_VERIFY_SECRET unset (dev, VPS): no check.
 */
const digest = (value: string) => createHash("sha256").update(value).digest();

export function proxy(request: NextRequest) {
  const secret = process.env.ORIGIN_VERIFY_SECRET;
  if (!secret) return NextResponse.next();
  const given = request.headers.get("x-origin-verify") ?? "";
  // Fixed-length digests: the comparison takes the same time whatever was sent.
  if (!timingSafeEqual(digest(given), digest(secret))) return new NextResponse("Forbidden", { status: 403 });

  const headers = new Headers(request.headers);
  headers.delete("x-origin-verify");
  const publicUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
  if (publicUrl) {
    headers.set("x-forwarded-host", publicUrl.host);
    headers.set("x-forwarded-proto", publicUrl.protocol.replace(":", ""));
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Container health checks call the task directly, without the header.
  matcher: ["/((?!health).*)"],
};
