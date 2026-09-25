import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { openNotification } from "@/server/services/inbox";

/** Opening a notification marks it read, then goes to what it's about. */
export async function GET(req: Request, ctx: RouteContext<"/notifications/[notificationId]">) {
  const { notificationId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const link = await openNotification(user, notificationId);
  const target = link && link.startsWith("/") && !link.startsWith("//") ? link : "/notifications";
  return NextResponse.redirect(new URL(target, req.url));
}
