import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot, markAttendance } from "@/server/services/bookings";
import { myRoleKinds } from "@/server/services/courses";
import { getDemoDay } from "@/server/services/demo-day";
import { addAvailability } from "@/server/services/slots";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

const dayOf = (d: Date) => d.toISOString().slice(0, 10); // courses in these tests use UTC

describe("demo day", () => {
  it("puts the TA's own demos on a now/next timeline and lists what's left to finish", async () => {
    const ta = await makeUser("Tara TA");
    const [ann, bob, cat] = await Promise.all([makeUser("Ann"), makeUser("Bob"), makeUser("Cat")]);
    const { course, slots } = await setupCourse(ta); // four 15-minute slots starting in 48h
    await enroll(course.id, [ann, bob, cat]);
    await bookSlot(ann, slots[0].id);
    await bookSlot(bob, slots[1].id);
    await bookSlot(cat, slots[3].id);

    // Five minutes into Bob's demo; Ann's has ended and was completed.
    const during = inHours(5 / 60, slots[1].startsAt);
    const annBooking = await db.booking.findFirstOrThrow({ where: { studentId: ann.id } });
    await markAttendance(ta, annBooking.id, "COMPLETED", during);

    const data = await getDemoDay(ta, { day: dayOf(slots[0].startsAt), now: during });
    expect(data.timeline.current.map((s) => s.bookings[0].student.name)).toEqual(["Bob"]);
    expect(data.timeline.next.map((s) => s.bookings[0].student.name)).toEqual(["Cat"]);
    expect(data.timeline.stats).toMatchObject({ demos: 3, completed: 1, remaining: 2, needsAttendance: 0 });
    // The empty slot between Bob and Cat stays on the timeline as an open slot.
    expect(data.timeline.items.filter((i) => i.kind === "slot" && i.slot.bookings.length === 0)).toHaveLength(1);
    // Ann's demo is completed but not marked yet.
    expect(data.toFinish.marking.map((b) => b.student.name)).toEqual(["Ann"]);
    expect(data.week).toHaveLength(7);
  });

  it("flags past demos without attendance and counts the coming week", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);

    const dayAfter = inHours(24, slots[0].startsAt);
    const later = await getDemoDay(ta, { now: dayAfter });
    expect(later.toFinish.attendance).toEqual([expect.objectContaining({ day: dayOf(slots[0].startsAt), count: 1 })]);

    const before = await getDemoDay(ta, { now: inHours(-24, slots[0].startsAt) });
    expect(before.week.find((d) => d.day === dayOf(slots[0].startsAt))?.count).toBe(1);
    expect(before.nextDemoAt).toEqual(slots[0].startsAt);
  });

  it("shows only the TA's own demos unless they ask for everyone's", async () => {
    const ta = await makeUser("Tara TA");
    const other = await makeUser("Omar TA");
    const [ann, bob] = await Promise.all([makeUser("Ann"), makeUser("Bob")]);
    const { course, assignment, venue, slots } = await setupCourse(ta);
    await enroll(course.id, [other], "TA");
    await enroll(course.id, [ann, bob]);
    const start = inHours(3, slots[0].startsAt);
    await addAvailability(ta, assignment.id, { taId: other.id, venueId: venue.id, startsAt: start, endsAt: inHours(0.25, start) });
    await db.slot.updateMany({ where: { assignmentId: assignment.id }, data: { status: "PUBLISHED" } });
    const otherSlot = await db.slot.findFirstOrThrow({ where: { taId: other.id } });
    await bookSlot(ann, slots[0].id);
    await bookSlot(bob, otherSlot.id);

    const now = inHours(-1, slots[0].startsAt);
    const mine = await getDemoDay(ta, { day: dayOf(slots[0].startsAt), now });
    const everyone = await getDemoDay(ta, { day: dayOf(slots[0].startsAt), scope: "everyone", now });
    expect(mine.timeline.stats.demos).toBe(1);
    expect(everyone.timeline.stats.demos).toBe(2);
    expect((await getDemoDay(other, { day: dayOf(slots[0].startsAt), now })).timeline.stats.demos).toBe(1);
  });

  it("keeps other courses' demos off an admin's day, and students out of course days", async () => {
    const ta = await makeUser("Tara TA");
    const admin = await makeUser("Ada Admin", { isAdmin: true });
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);

    expect((await getDemoDay(admin)).courses).toEqual([]);
    expect(await myRoleKinds(admin)).toEqual({ staff: false, student: false });
    expect(await myRoleKinds(ta)).toEqual({ staff: true, student: false });
    expect(await myRoleKinds(ann)).toEqual({ staff: false, student: true });
    await expect(getDemoDay(ann, { courseId: course.id })).rejects.toThrow(/permission/);
  });
});
