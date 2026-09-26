import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness check for the reverse proxy / load balancer: the app is up and can reach the database. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
