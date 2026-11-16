export const dynamic = "force-dynamic";

/**
 * Liveness: the process is serving requests. No database call, so a database blip doesn't make
 * the orchestrator replace every web task at once. `/health` (with the DB check) is for monitoring.
 */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
