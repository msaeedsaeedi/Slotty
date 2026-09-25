"use server";

import { requireUser } from "@/server/auth/session";
import { run, str, type ActionState } from "@/server/action-utils";
import { adminSetAdmin, adminSetUserDisabled } from "@/server/services/admin";
import { markRead } from "@/server/services/inbox";

export async function setDisabledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const disabled = str(fd, "disabled") === "true";
    await adminSetUserDisabled(await requireUser(), str(fd, "userId"), disabled);
    return disabled ? "User disabled." : "User re-enabled.";
  });
}

export async function setAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const isAdmin = str(fd, "isAdmin") === "true";
    await adminSetAdmin(await requireUser(), str(fd, "userId"), isAdmin);
    return isAdmin ? "Admin granted." : "Admin removed.";
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  return run(async () => {
    await markRead(await requireUser());
  });
}
