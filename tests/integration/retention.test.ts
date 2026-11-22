import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { pruneMessages } from "@/server/services/retention";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2027-06-01T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("pruneMessages", () => {
  it("clears old sent email bodies, deletes old rows, and leaves pending and failed bodies alone", async () => {
    const mail = (status: "SENT" | "FAILED" | "PENDING", age: number, subject: string) =>
      db.emailOutbox.create({ data: { to: "a@uni.edu", subject, text: "Reset link: https://x/reset/SECRET", html: "<p>SECRET</p>", status, createdAt: daysAgo(age), sentAt: status === "SENT" ? daysAgo(age) : null } });
    await mail("SENT", 31, "old sent");
    await mail("SENT", 5, "recent sent");
    await mail("FAILED", 40, "failed");
    await mail("PENDING", 40, "pending");
    await mail("SENT", 200, "ancient");

    const r = await pruneMessages(NOW);
    expect(r).toMatchObject({ emailBodiesCleared: 1, emailsDeleted: 1 });
    const left = Object.fromEntries((await db.emailOutbox.findMany()).map((e) => [e.subject, e]));
    expect(left["old sent"]).toMatchObject({ text: "", html: null, status: "SENT" });
    expect(left["recent sent"].text).toContain("SECRET");
    expect(left["failed"].text).toContain("SECRET"); // a retry must never send an empty email
    expect(left["pending"].text).toContain("SECRET");
    expect(left["ancient"]).toBeUndefined();
    expect(await pruneMessages(NOW)).toMatchObject({ emailBodiesCleared: 0, emailsDeleted: 0 });
  });

  it("prunes old notifications, delivered pushes, expired sessions and spent links", async () => {
    const u = await makeUser("Ann");
    const note = (readAge: number | null, age: number) =>
      db.notification.create({ data: { userId: u.id, type: "booking.reminder", title: `n${age}`, body: "", createdAt: daysAgo(age), readAt: readAge === null ? null : daysAgo(readAge) } });
    await note(91, 100); // read long ago: goes
    await note(10, 100); // read recently: stays
    await note(null, 181); // unread but very old: goes
    await note(null, 30); // unread: stays

    const session = await db.session.create({ data: { userId: u.id, tokenHash: "live", expiresAt: daysAgo(-5) } });
    await db.session.create({ data: { userId: u.id, tokenHash: "expired", expiresAt: daysAgo(1) } });
    const sub = await db.pushSubscription.create({ data: { userId: u.id, sessionId: session.id, endpoint: "https://push.example/1", p256dh: "k", auth: "a" } });
    await db.pushMessage.create({ data: { subscriptionId: sub.id, title: "old", body: "", status: "SENT", createdAt: daysAgo(8) } });
    await db.pushMessage.create({ data: { subscriptionId: sub.id, title: "pending", body: "", status: "PENDING", createdAt: daysAgo(8) } });
    await db.authToken.create({ data: { userId: u.id, type: "PASSWORD_RESET", tokenHash: "used", expiresAt: daysAgo(-1), usedAt: daysAgo(8) } });
    await db.authToken.create({ data: { userId: u.id, type: "INVITE", tokenHash: "expired", expiresAt: daysAgo(8) } });
    await db.authToken.create({ data: { userId: u.id, type: "INVITE", tokenHash: "fresh", expiresAt: daysAgo(-10) } });

    expect(await pruneMessages(NOW)).toMatchObject({ notificationsDeleted: 2, pushDeleted: 1, sessionsDeleted: 1, tokensDeleted: 2 });
    expect((await db.notification.findMany()).map((n) => n.title).sort()).toEqual(["n100", "n30"]);
    expect((await db.pushMessage.findMany()).map((p) => p.title)).toEqual(["pending"]);
    expect((await db.session.findMany()).map((s) => s.tokenHash)).toEqual(["live"]);
    expect((await db.authToken.findMany()).map((t) => t.tokenHash)).toEqual(["fresh"]);
  });
});
