import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { setRequestClock } from "@/server/clock";
import { generateToken, hashToken } from "./tokens";
import type { Actor } from "@/server/services/access";
export type { Actor };

/**
 * `__Host-`: the browser only accepts it over HTTPS (or localhost), for the whole site, from this
 * host alone, so no subdomain or plain-HTTP response can set or replace it (ADR-033).
 */
const COOKIE = "__Host-uniflow_session";
/**
 * Earlier names, still read so nobody is signed out; signing in or out clears them. Remove each once
 * the sessions it carries have expired (30 days after the release that retired it; #138):
 * `__Host-slotty_session` before the rename to Uniflow (issue #133), `slotty_session` before ADR-033.
 */
const OLD_COOKIES = [
  { name: "__Host-slotty_session", hostPrefixed: true },
  { name: "slotty_session", hostPrefixed: false },
] as const;
const COOKIE_ATTRS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
const SESSION_DAYS = 30;
const DAY = 86_400_000;

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, { ...COOKIE_ATTRS, expires: expiresAt });
  clearOldCookies(jar);
}

type Jar = Awaited<ReturnType<typeof cookies>>;

/** Drop the cookies under earlier names. A __Host- cookie is only cleared by a Set-Cookie with the same Secure and Path. */
function clearOldCookies(jar: Jar) {
  for (const c of OLD_COOKIES) {
    if (!jar.has(c.name)) continue;
    if (c.hostPrefixed) jar.delete({ name: c.name, ...COOKIE_ATTRS });
    else jar.delete(c.name);
  }
}

/** Every session token this browser holds: the current cookie first, then the earlier names. */
async function sessionTokens(): Promise<string[]> {
  const jar = await cookies();
  return [COOKIE, ...OLD_COOKIES.map((c) => c.name)].map((n) => jar.get(n)?.value).filter((t): t is string => Boolean(t));
}

/** This browser's session token, from the current cookie or an earlier one. */
async function sessionToken(): Promise<string | undefined> {
  return (await sessionTokens())[0];
}

export async function destroySession(): Promise<void> {
  const tokens = await sessionTokens();
  if (tokens.length) await db.session.deleteMany({ where: { tokenHash: { in: tokens.map(hashToken) } } });
  const jar = await cookies();
  // A __Host- cookie is only cleared by a Set-Cookie with the same Secure and Path attributes.
  jar.delete({ name: COOKIE, ...COOKIE_ATTRS });
  clearOldCookies(jar);
}

/** Hash of this browser's session token, so account actions can keep it while ending others. */
export async function currentSessionHash(): Promise<string | null> {
  const token = await sessionToken();
  return token ? hashToken(token) : null;
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  const token = await sessionToken();
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  const { id, email, name, isAdmin, platformAccess, timeFormat } = session.user;
  setRequestClock(timeFormat === "H24" ? "24h" : "12h");
  return { id, email, name, isAdmin, isPlatform: platformAccess };
});

/** For pages and actions: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminUser(): Promise<Actor> {
  const user = await requireUser();
  if (!user.isAdmin || user.isPlatform) redirect("/");
  return user;
}

export async function requirePlatformUser(): Promise<Actor> {
  const user = await requireUser();
  if (!user.isPlatform || user.isAdmin) redirect("/");
  return user;
}
