"use server";

import { requireUser } from "@/server/auth/session";
import { bool, run, str, type ActionState } from "@/server/action-utils";
import {
  adminAssignStaff,
  adminRetryEmails,
  adminSendAccessEmail,
  adminSetAdmin,
  adminSetCourseArchived,
  adminSetUserDisabled,
  adminUpdateUser,
} from "@/server/services/admin";
import { markRead } from "@/server/services/inbox";

export async function setDisabledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const disabled = str(fd, "disabled") === "true";
    const { released } = await adminSetUserDisabled(await requireUser(), str(fd, "userId"), disabled, {
      releaseBookings: bool(fd, "releaseBookings"),
    });
    if (!disabled) return "User re-enabled.";
    return `User disabled${released ? `; ${released} upcoming booking${released === 1 ? "" : "s"} released` : ""}.`;
  });
}

export async function setAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const isAdmin = str(fd, "isAdmin") === "true";
    await adminSetAdmin(await requireUser(), str(fd, "userId"), isAdmin);
    return isAdmin ? "Admin granted." : "Admin removed.";
  });
}

export async function sendAccessEmailAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const kind = await adminSendAccessEmail(await requireUser(), str(fd, "userId"));
    return kind === "invite" ? "New invitation sent." : "Password reset link sent.";
  });
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await adminUpdateUser(await requireUser(), str(fd, "userId"), { name: str(fd, "name"), email: str(fd, "email") });
    return "Saved.";
  });
}

export async function assignStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const role = str(fd, "role") === "TA" ? "TA" : "INSTRUCTOR";
    const r = await adminAssignStaff(await requireUser(), str(fd, "courseId"), { email: str(fd, "email"), name: str(fd, "name") || undefined, role });
    return `${r.name} added as ${role === "TA" ? "TA" : "instructor"}${r.invited ? " and invited by email" : ""}.`;
  });
}

export async function setCourseArchivedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const archived = str(fd, "archived") === "true";
    await adminSetCourseArchived(await requireUser(), str(fd, "courseId"), archived);
    return archived ? "Course archived (read-only)." : "Course restored.";
  });
}

export async function retryEmailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("emailId").map(String);
    const n = await adminRetryEmails(await requireUser(), ids.length ? ids : "all-failed");
    return n ? `${n} email${n === 1 ? "" : "s"} queued again.` : "Nothing to retry.";
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  return run(async () => {
    await markRead(await requireUser());
  });
}
