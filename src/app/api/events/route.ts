import { analyticsEnabled } from "@/server/analytics-config";
import { getCurrentUser } from "@/server/auth/session";
import { recordEvents } from "@/server/services/analytics";

export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;
const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Usage events from the page tracker (`navigator.sendBeacon`, same origin).
 * Always answers 204 unless the request is malformed: the tracker never
 * retries and never shows the user anything.
 */
export async function POST(request: Request) {
  if (!analyticsEnabled()) return noContent();
  // Browsers send Origin on POST; refuse other sites posting with a user's cookie.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return new Response(null, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return noContent();
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await recordEvents(user, body, { userAgent: request.headers.get("user-agent") });
  } catch (err) {
    // Analytics must never break the app; the error is logged for the operator.
    console.error("[analytics] could not record events", err instanceof Error ? err.message : err);
  }
  return noContent();
}
