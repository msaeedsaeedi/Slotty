import { calendarFeed } from "@/server/services/calendar";

/**
 * Personal iCal feed, subscribed to from a calendar app. The token in the URL is
 * the credential (calendar apps can't send cookies); users can replace it on
 * their account page.
 */
export async function GET(_req: Request, ctx: RouteContext<"/calendar/[token]">) {
  const { token } = await ctx.params;
  const ics = await calendarFeed(token.replace(/\.ics$/, ""));
  if (ics === null) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
