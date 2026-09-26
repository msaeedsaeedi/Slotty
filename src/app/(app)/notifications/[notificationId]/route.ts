import { getCurrentUser } from "@/server/auth/session";
import { openNotification } from "@/server/services/inbox";

/**
 * Redirect with a relative Location, so the browser stays on the host and port it
 * used. `req.url` reflects the server's own listening address (localhost:3000 in
 * the container), not the public one.
 */
const redirectTo = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

/** Opening a notification marks it read, then goes to what it's about. */
export async function GET(_req: Request, ctx: RouteContext<"/notifications/[notificationId]">) {
  const { notificationId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login");
  const link = await openNotification(user, notificationId);
  return redirectTo(link && link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
}
