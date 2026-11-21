import { getCurrentUser } from "@/server/auth/session";
import { unreadCount } from "@/server/services/inbox";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * The bell badge's count, polled by `<LiveBell>` while the tab is visible. One indexed count
 * of the caller's own unread items that need them; signed-out callers get 401 and stop polling.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed-out" }, { status: 401, headers });
  return Response.json({ count: await unreadCount(user) }, { headers });
}
