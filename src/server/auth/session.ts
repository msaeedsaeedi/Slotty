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
const COOKIE = "__Host-slotty_session";
/** Before ADR-033. Still read so nobody is signed out; removed once those sessions have expired. */
const LEGACY_COOKIE = "slotty_session";
const COOKIE_ATTRS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
const SESSION_DAYS = 30;
const DAY = 86_400_000;

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, { ...COOKIE_ATTRS, expires: expiresAt });
  if (jar.has(LEGACY_COOKIE)) jar.delete(LEGACY_COOKIE);
}

/** This browser's session token, from the current cookie or the pre-ADR-033 one. */
async function sessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? jar.get(LEGACY_COOKIE)?.value;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const tokens = [jar.get(COOKIE)?.value, jar.get(LEGACY_COOKIE)?.value].filter((t): t is string => Boolean(t));
  if (tokens.length) await db.session.deleteMany({ where: { tokenHash: { in: tokens.map(hashToken) } } });
  // A __Host- cookie is only cleared by a Set-Cookie with the same Secure and Path attributes.
  jar.delete({ name: COOKIE, ...COOKIE_ATTRS });
  if (jar.has(LEGACY_COOKIE)) jar.delete(LEGACY_COOKIE);
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
