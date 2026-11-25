import { getCurrentUser } from "@/server/auth/session";
import { offlineOwner } from "@/server/offline-owner";
import { offlinePagesFor } from "@/server/services/offline";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * The pages the service worker keeps on this device for the signed-in account (#162), with a
 * version each, so it downloads only pages that changed. `owner` is the opaque per-account key
 * (`offlineOwner`): the worker wipes saved pages when it differs from the one it saved under.
 * Signed-out callers get 401, and the worker stops refreshing.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed-out" }, { status: 401, headers });
  const { pages, expiresAt } = await offlinePagesFor(user);
  return Response.json({ owner: offlineOwner(user.id), generatedAt: new Date().toISOString(), expiresAt, pages }, { headers });
}
