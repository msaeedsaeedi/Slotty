import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError } from "@/domain/result";

export type ActionState = { ok: true; message?: string; navigate?: string } | { ok: false; error: string } | null;

/** What a mutation may return: a success message, and optionally a URL the client should move to. */
export type ActionOutcome = string | void | { message?: string; navigate?: string };

/**
 * Run a mutation for a Server Action: refresh the page on success and turn rule
 * or validation failures into a message the form can show.
 */
export async function run(fn: () => Promise<ActionOutcome>): Promise<ActionState> {
  try {
    const outcome = await fn();
    refresh();
    return typeof outcome === "object" ? { ok: true, ...outcome } : { ok: true, message: outcome ?? undefined };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form." };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Like `run`, for actions called directly from client code (autosave): returns
 * the result instead of a form state and doesn't refresh the page, so typing
 * isn't interrupted by a re-render.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the values." };
    console.error(e);
    return { ok: false, error: "Couldn't save. Check your connection and try again." };
  }
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const optStr = (fd: FormData, key: string) => str(fd, key) || null;
export const bool = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true";
