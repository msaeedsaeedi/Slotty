"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { optStr, run, str, type ActionState } from "@/server/action-utils";
import {
  createCourse,
  createVenue,
  deleteVenue,
  importRoster,
  previewRoster,
  removeMember,
  resendInvite,
  setCourseArchived,
  updateCourse,
  type RosterPreviewRow,
} from "@/server/services/courses";
import type { RosterError } from "@/domain/csv-roster";

function courseFields(fd: FormData) {
  return { code: str(fd, "code"), title: str(fd, "title"), term: str(fd, "term"), timezone: str(fd, "timezone") };
}

export async function createCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const result = await run(async () => {
    const user = await requireUser();
    const course = await createCourse(user, { ...courseFields(fd), myRole: str(fd, "myRole") === "INSTRUCTOR" ? "INSTRUCTOR" : "TA" });
    id = course.id;
  });
  if (result?.ok) redirect(`/courses/${id}/manage/roster`);
  return result;
}

export async function updateCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateCourse(await requireUser(), str(fd, "courseId"), courseFields(fd));
    return "Course updated.";
  });
}

export async function archiveCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const archived = str(fd, "archived") === "true";
    await setCourseArchived(await requireUser(), str(fd, "courseId"), archived);
    return archived ? "Course archived." : "Course restored.";
  });
}

export type RosterPreviewState =
  | { ok: true; csv: string; rows: RosterPreviewRow[]; errors: RosterError[] }
  | { ok: false; error: string }
  | null;

async function readCsv(fd: FormData): Promise<string> {
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) throw new Error("CSV is too large (max 2 MB).");
    return file.text();
  }
  return String(fd.get("csv") ?? "");
}

export async function previewRosterAction(_: RosterPreviewState, fd: FormData): Promise<RosterPreviewState> {
  let preview: RosterPreviewState = null;
  const result = await run(async () => {
    const csv = await readCsv(fd);
    const { rows, errors } = await previewRoster(await requireUser(), str(fd, "courseId"), csv);
    preview = { ok: true, csv, rows, errors };
  });
  if (result && !result.ok) return result;
  return preview;
}

export async function importRosterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await importRoster(await requireUser(), str(fd, "courseId"), String(fd.get("csv") ?? ""));
    const parts = [`${r.enrolled} added`, `${r.invited} invited by email`, `${r.updated} updated`];
    if (r.errors.length) parts.push(`${r.errors.length} rows skipped`);
    return `Roster imported: ${parts.join(", ")}.`;
  });
}

export async function removeMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await removeMember(await requireUser(), str(fd, "courseId"), str(fd, "userId"));
    return "Removed from course.";
  });
}

export async function resendInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await resendInvite(await requireUser(), str(fd, "courseId"), str(fd, "userId"));
    return "Invite sent again.";
  });
}

export async function createVenueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await createVenue(await requireUser(), str(fd, "courseId"), {
      name: str(fd, "name"),
      location: optStr(fd, "location") ?? undefined,
      meetingUrl: optStr(fd, "meetingUrl") ?? undefined,
    });
    return "Venue added.";
  });
}

export async function deleteVenueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteVenue(await requireUser(), str(fd, "venueId"));
    return "Venue removed.";
  });
}
