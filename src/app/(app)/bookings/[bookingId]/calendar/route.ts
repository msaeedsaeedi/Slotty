import { DomainError } from "@/domain/result";
import { getCurrentUser } from "@/server/auth/session";
import { bookingIcs } from "@/server/services/calendar";

/** Download one booking as an .ics file ("Add to calendar"). */
export async function GET(_req: Request, ctx: RouteContext<"/bookings/[bookingId]/calendar">) {
  const { bookingId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    const { filename, ics } = await bookingIcs(user, bookingId);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
