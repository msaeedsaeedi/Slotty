import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot, cancelBooking, rescheduleBooking } from "@/server/services/bookings";
import { savePushSubscription } from "@/server/services/push";
import { queueDueReminders } from "@/server/services/reminders";
import { setEmailPreferences } from "@/server/services/accounts";
import type { Actor } from "@/server/services/access";
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

// The test course runs in UTC. Its first two slots are moved to a fixed demo day, so the
// morning (08:00) and the minutes before the start are known.
const START = new Date("2027-01-12T14:00:00Z");
const at = (iso: string) => new Date(iso);

async function bookedStudent() {
  const ta = await makeUser("Tara TA");
  const ann = await makeUser("Ann");
  const { course, slots } = await setupCourse(ta, { freezeHours: 0, maxReschedules: 2 });
  await enroll(course.id, [ann]);
  await db.slot.update({ where: { id: slots[0].id }, data: { startsAt: START, endsAt: new Date(START.getTime() + 15 * 60_000) } });
  await db.slot.update({ where: { id: slots[1].id }, data: { startsAt: inHours(1, START), endsAt: inHours(1.25, START) } });
  const booking = await bookSlot(ann, slots[0].id);
  const session = await db.session.create({ data: { userId: ann.id, tokenHash: `ann-${ann.id}`, expiresAt: inHours(24) } });
  await savePushSubscription(ann, session.tokenHash, { endpoint: `https://push.example.com/${ann.id}`, keys: { p256dh: "p", auth: "a" } }, "Phone");
  return { ann, booking: booking!, slots };
}

const emails = (a: Actor, prefix: string) => db.emailOutbox.count({ where: { to: a.email, subject: { startsWith: prefix } } });
const pushes = (prefix: string) => db.pushMessage.count({ where: { title: { startsWith: prefix } } });

describe("morning-of reminder", () => {
  it("goes out once from 08:00 on the demo day, by email, in-app and push", async () => {
    const { ann } = await bookedStudent();
    await queueDueReminders(at("2027-01-12T07:59:00Z"));
    expect(await emails(ann, "Today:")).toBe(0);

    await queueDueReminders(at("2027-01-12T08:00:00Z"));
    await queueDueReminders(at("2027-01-12T09:00:00Z"));
    expect(await emails(ann, "Today:")).toBe(1);
    expect(await db.notification.count({ where: { userId: ann.id, title: { startsWith: "Today:" } } })).toBe(1);
    expect(await pushes("Today:")).toBe(1);
    const email = await db.emailOutbox.findFirstOrThrow({ where: { to: ann.email, subject: { startsWith: "Today:" } } });
    expect(email.subject).toBe("Today: Project demo demo at 2:00 PM");
  });

  it("follows its own switch, not the reminder-email one", async () => {
    const { ann } = await bookedStudent();
    await setEmailPreferences(ann, { emailReminders: false });
    await queueDueReminders(at("2027-01-12T08:00:00Z"));
    expect(await emails(ann, "Today:")).toBe(1);

    const other = await bookedStudent();
    await setEmailPreferences(other.ann, { remindMorning: false });
    await queueDueReminders(at("2027-01-12T08:05:00Z"));
    expect(await emails(other.ann, "Today:")).toBe(0);
    expect(await db.booking.findUniqueOrThrow({ where: { id: other.booking.id } })).toMatchObject({ reminderMorningAt: expect.any(Date) });
  });
});

describe("10-minute reminder", () => {
  it("is pushed once with the meeting link, without an email or bell item", async () => {
    const { ann } = await bookedStudent();
    await db.venue.updateMany({ data: { meetingUrl: "https://meet.example.com/demo" } });
    await queueDueReminders(at("2027-01-12T13:49:00Z"));
    expect(await pushes("Project demo demo in 10 minutes")).toBe(0);

    await queueDueReminders(at("2027-01-12T13:50:00Z"));
    await queueDueReminders(at("2027-01-12T13:55:00Z"));
    const messages = await db.pushMessage.findMany({ where: { title: { startsWith: "Project demo demo in 10 minutes" } } });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toContain("https://meet.example.com/demo");
    expect(await emails(ann, "Project demo demo in 10")).toBe(0);
    expect(await db.notification.count({ where: { userId: ann.id, title: { contains: "10 minutes" } } })).toBe(0);
  });

  it("follows its switch", async () => {
    const { ann } = await bookedStudent();
    await setEmailPreferences(ann, { remind10m: false });
    await queueDueReminders(at("2027-01-12T13:52:00Z"));
    expect(await pushes("Project demo demo in 10 minutes")).toBe(0);
  });
});

describe("reminders after changes", () => {
  it("start afresh after a reschedule", async () => {
    const { ann, booking, slots } = await bookedStudent();
    await queueDueReminders(at("2027-01-12T08:00:00Z"));
    expect(await emails(ann, "Today:")).toBe(1);

    // Moved to 15:00 the same day: the old slot's reminder isn't sent, the new booking gets its own.
    const moved = await rescheduleBooking(ann, booking.id, slots[1].id, at("2027-01-12T08:30:00Z"));
    expect(moved).toMatchObject({ reminderMorningAt: null, reminder10mAt: null });
    await queueDueReminders(at("2027-01-12T13:55:00Z"));
    expect(await pushes("Project demo demo in 10 minutes")).toBe(0);
    await queueDueReminders(at("2027-01-12T14:52:00Z"));
    expect(await pushes("Project demo demo in 10 minutes")).toBe(1);
  });

  it("stop after a cancellation", async () => {
    const { ann, booking } = await bookedStudent();
    await cancelBooking(ann, booking.id, at("2027-01-12T07:00:00Z"));
    for (const t of ["2027-01-12T08:00:00Z", "2027-01-12T13:00:00Z", "2027-01-12T13:52:00Z"]) await queueDueReminders(at(t));
    expect(await db.emailOutbox.count({ where: { to: ann.email, subject: { startsWith: "Reminder" } } })).toBe(0);
    expect(await emails(ann, "Today:")).toBe(0);
    expect(await pushes("Project demo demo in 10 minutes")).toBe(0);
  });
});
