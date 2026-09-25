import { DomainError } from "@/domain/result";
import { getCurrentUser } from "@/server/auth/session";
import { exportAssignmentCsv } from "@/server/services/reports";

export async function GET(_req: Request, ctx: RouteContext<"/courses/[courseId]/manage/assignments/[assignmentId]/export">) {
  const { assignmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    const { filename, csv } = await exportAssignmentCsv(user, assignmentId);
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
