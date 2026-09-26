import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot } from "@/server/services/bookings";
import { savePushSubscription } from "@/server/services/push";
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

    await bookSlot(ann, slots[0].id);
    const messages = await db.pushMessage.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0].title).toMatch(/Demo booked/);
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
});
