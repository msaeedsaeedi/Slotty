import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { bookSlot, staffPlaceStudent } from "@/server/services/bookings";
import { savePushSubscription } from "@/server/services/push";
import { deliverPendingPush, pushTtlSeconds } from "@/server/push";
import { notify } from "@/server/services/notify";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

const keys = webpush.generateVAPIDKeys();
const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
});
afterAll(() => {
  process.env.VAPID_PUBLIC_KEY = saved.pub;
  process.env.VAPID_PRIVATE_KEY = saved.priv;
});
beforeEach(resetDb);

const sub = (n: number) => ({ endpoint: `https://push.example.com/send/${n}`, keys: { p256dh: "p256dh-key", auth: "auth-key" } });

describe("push notifications (PWA-02, PWA-03, PWA-07)", () => {
  it("queues a push per device in the same transaction as the notification", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const session = await db.session.create({ data: { userId: ann.id, tokenHash: "ann-phone", expiresAt: inHours(24) } });
    await savePushSubscription(ann, session.tokenHash, sub(1), "Phone");
    await savePushSubscription(ann, session.tokenHash, sub(1), "Phone"); // re-subscribing doesn't duplicate

    // Her own booking isn't pushed back to her (no in-app item); a staff move is.
    const b = await bookSlot(ann, slots[0].id);
    expect(await db.pushMessage.count()).toBe(0);
    await staffPlaceStudent(ta, { assignmentId: b!.assignmentId, studentId: ann.id, slotId: slots[1].id });
    const messages = await db.pushMessage.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0].title).toMatch(/Demo moved by staff/);
  });

  it("only accepts the caller's own session, and signing out removes the device", async () => {
    const ann = await makeUser("Ann");
    const bob = await makeUser("Bob");
    const bobs = await db.session.create({ data: { userId: bob.id, tokenHash: "bob", expiresAt: inHours(24) } });
    await expect(savePushSubscription(ann, bobs.tokenHash, sub(2), null)).rejects.toThrow(/sign in/);

    const anns = await db.session.create({ data: { userId: ann.id, tokenHash: "ann", expiresAt: inHours(24) } });
    await savePushSubscription(ann, anns.tokenHash, sub(3), null);
    await db.session.delete({ where: { id: anns.id } }); // what logout does
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("sends reminders with high urgency and a TTL that ends at the demo, and drops expired ones (#142)", async () => {
    const ann = await makeUser("Ann");
    const session = await db.session.create({ data: { userId: ann.id, tokenHash: "ann-ttl", expiresAt: inHours(24) } });
    await savePushSubscription(ann, session.tokenHash, sub(4), null);
    const startsIn10 = new Date(Date.now() + 10 * 60_000);
    await db.$transaction(async (tx) => {
      await notify(tx, [ann.id], { type: "booking.reminder", title: "Soon", body: "b", inApp: false, email: false, push: true, pushExpiresAt: startsIn10, pushUrgent: true });
      await notify(tx, [ann.id], { type: "booking.reminder", title: "Too late", body: "b", inApp: false, email: false, push: true, pushExpiresAt: new Date(Date.now() - 1000), pushUrgent: true });
      await notify(tx, [ann.id], { type: "x", title: "Plain", body: "b", email: false });
    });
    const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    try {
      const r = await deliverPendingPush();
      expect(r).toMatchObject({ sent: 2, failed: 1 });
      const calls = send.mock.calls.map(([, payload, opts]) => ({ title: JSON.parse(String(payload)).title, opts }));
      const soon = calls.find((c) => c.title === "Soon")!;
      expect(soon.opts).toMatchObject({ urgency: "high" });
      expect(soon.opts!.TTL).toBeGreaterThan(9 * 60);
      expect(soon.opts!.TTL).toBeLessThanOrEqual(10 * 60);
      expect(calls.find((c) => c.title === "Plain")!.opts).toMatchObject({ TTL: 3600, urgency: "normal" });
      expect(calls.some((c) => c.title === "Too late")).toBe(false);
      expect(await db.pushMessage.findFirst({ where: { title: "Too late" } })).toMatchObject({ status: "FAILED", lastError: "expired" });
    } finally {
      send.mockRestore();
    }
    expect(pushTtlSeconds(null)).toBe(3600);
    expect(pushTtlSeconds(new Date(Date.now() + 5 * 3_600_000))).toBe(3600);
  });
});
