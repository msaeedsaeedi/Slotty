"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/domain/result";
import { createSession, destroySession } from "@/server/auth/session";
import { run, str, type ActionState } from "@/server/action-utils";
import { acceptInvite, authenticate, requestPasswordReset, resetPassword } from "@/server/services/accounts";

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const user = await authenticate(str(fd, "email"), String(fd.get("password") ?? ""));
    await createSession(user.id);
  });
  if (result?.ok) redirect(safeNext(str(fd, "next")));
  return result;
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function acceptInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await run(async () => {
    if (fd.get("password") !== fd.get("confirm")) throw new DomainError("Passwords don't match.");
    const user = await acceptInvite(str(fd, "token"), { name: str(fd, "name"), password: String(fd.get("password")) });
    await createSession(user.id);
  });
  if (result?.ok) redirect("/dashboard");
  return result;
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await requestPasswordReset(str(fd, "email"));
    return "If that email has an account, we've sent a reset link.";
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await run(async () => {
    if (fd.get("password") !== fd.get("confirm")) throw new DomainError("Passwords don't match.");
    const user = await resetPassword(str(fd, "token"), String(fd.get("password")));
    await createSession(user.id);
  });
  if (result?.ok) redirect("/dashboard");
  return result;
}
