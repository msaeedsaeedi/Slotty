import { db } from "@/server/db";
import { appVersion } from "@/server/analytics-config";

export const dynamic = "force-dynamic";

/**
 * Health check for monitoring: the app is up and can reach the database. `version` is the running
 * release (the image tag in AWS); the deploy polls it to confirm the new release is the one serving.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const version = appVersion();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, version }, { headers });
  } catch {
    return Response.json({ ok: false, version }, { status: 503, headers });
  }
}
