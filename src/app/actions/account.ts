"use server";

import { currentSessionHash, requireUser } from "@/server/auth/session";
import { bool, run, str, type ActionState } from "@/server/action-utils";
import { changePassword, setEmailPreferences, setTimeFormat, signOutOtherSessions, updateProfile } from "@/server/services/accounts";
import { DomainError } from "@/domain/result";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateProfile(await requireUser(), { name: str(fd, "name") });
    return "Name updated.";
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const next = String(fd.get("password") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) throw new DomainError("The new passwords don't match.");
    await changePassword(await requireUser(), { current: String(fd.get("current") ?? ""), next }, await currentSessionHash());
    return "Password changed. Other devices have been signed out.";
  });
}

export async function setEmailPreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    // Each checkbox is only on the form for the roles it applies to.
    const pref = (key: string) => (fd.has(`${key}Shown`) ? bool(fd, key) : undefined);
    await setEmailPreferences(await requireUser(), { emailReminders: pref("emailReminders"), emailAgenda: pref("emailAgenda") });
    return "Email preferences saved.";
  });
}

export async function setTimeFormatAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await setTimeFormat(await requireUser(), str(fd, "timeFormat") === "H24" ? "H24" : "H12");
    return "Time format saved.";
  });
}

export async function signOutOthersAction(): Promise<ActionState> {
  return run(async () => {
    const n = await signOutOtherSessions(await requireUser(), await currentSessionHash());
    return n ? `Signed out of ${n} other session${n === 1 ? "" : "s"}.` : "No other sessions were signed in.";
  });
}

