import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changePassword, signOutOtherSessions } from "@/server/services/accounts";
import { closeEndedAssignments, nudgeUnbookedStudents, sendDailyAgendas } from "@/server/services/automations";
import { allowRebookAfterNoShow, bookSlot, cancelBooking, markAttendance, setAllowance, staffPlaceStudent } from "@/server/services/bookings";
import { bookingIcs, calendarFeed, rotateCalendarToken } from "@/server/services/calendar";
import { finalizeMany, getOrCreateEvaluation, saveEvaluation, submitEvaluations } from "@/server/services/evaluations";
import { openNotification } from "@/server/services/inbox";
import { createRequest, listRequests, resolveRequest } from "@/server/services/requests";
import { reassignHost, updateSlotCapacity } from "@/server/services/slots";
import { joinWaitlist } from "@/server/services/waitlist";
import { hashPassword } from "@/server/auth/password";
import { enroll, inHours, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

describe("staff place / move (OP-01) and allowances (OP-04)", () => {
  it("moves a student inside the freeze window without using their changes and answers their request", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta, { maxReschedules: 0 });
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    await createRequest(ann, assignment.id, { kind: "BOOKING_CHANGE", message: "I'm ill on that day, can I move?" });

    const insideFreeze = inHours(-2, slots[0].startsAt);
    await staffPlaceStudent(ta, { assignmentId: assignment.id, studentId: ann.id, slotId: slots[1].id }, insideFreeze);
    expect(await db.booking.findUniqueOrThrow({ where: { id: b!.id } })).toMatchObject({ status: "CANCELLED", cancelledById: ta.id });
    expect(await db.booking.count({ where: { studentId: ann.id, slotId: slots[1].id, status: "BOOKED" } })).toBe(1);
    expect(await listRequests(ta, course.id, "OPEN")).toHaveLength(0);

    // Full slots need an explicit over-capacity override.
    const bob = await makeUser("Bob");
    await enroll(course.id, [bob]);
    await expect(staffPlaceStudent(ta, { assignmentId: assignment.id, studentId: bob.id, slotId: slots[1].id })).rejects.toThrow(/full/);
    await staffPlaceStudent(ta, { assignmentId: assignment.id, studentId: bob.id, slotId: slots[1].id, overCapacity: true });
    expect(await db.booking.count({ where: { slotId: slots[1].id, status: "BOOKED" } })).toBe(2);
  });

  it("grants extra changes and notifies the student", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment, slots } = await setupCourse(ta, { maxReschedules: 0 });
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    await cancelBooking(ann, b!.id);
    await expect(bookSlot(ann, slots[1].id)).rejects.toThrow(/used all your changes/);
    await setAllowance(ta, assignment.id, ann.id, { extraChanges: 1, lateBooking: false });
    await bookSlot(ann, slots[1].id);
    expect(await db.notification.count({ where: { userId: ann.id, type: "booking.allowance" } })).toBe(1);
  });

  it("lets a no-show book again (OP-14)", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    await markAttendance(ta, b!.id, "NO_SHOW", inHours(1, slots[0].startsAt));
    await expect(bookSlot(ann, slots[1].id)).rejects.toThrow(/already have a booking/);
    await allowRebookAfterNoShow(ta, b!.id);
    await bookSlot(ann, slots[1].id);
  });
});

describe("waitlist (OP-02)", () => {
  it("tells waiting students when a seat frees up, and drops them once they book", async () => {
    const ta = await makeUser("Tara TA");
    const students = await Promise.all(["A", "B", "C", "D", "E"].map((n) => makeUser(`Student ${n}`)));
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, students);
    const bookings = await Promise.all(slots.map((s, i) => bookSlot(students[i], s.id)));
    const eve = students[4];
    await joinWaitlist(eve, assignment.id);

    await cancelBooking(students[0], bookings[0]!.id);
    expect(await db.notification.count({ where: { userId: eve.id, type: "waitlist.slot_available" } })).toBe(1);
    await bookSlot(eve, slots[0].id);
    expect(await db.waitlistEntry.count()).toBe(0);
  });

  it("also fires when staff add capacity", async () => {
    const ta = await makeUser("Tara TA");
    const students = await Promise.all(["A", "B", "C", "D", "E"].map((n) => makeUser(`Student ${n}`)));
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, students);
    await Promise.all(slots.map((s, i) => bookSlot(students[i], s.id)));
    await joinWaitlist(students[4], assignment.id);
    await expect(updateSlotCapacity(ta, slots[0].id, 0)).rejects.toThrow(/whole number/);
    await updateSlotCapacity(ta, slots[0].id, 2);
    expect(await db.notification.count({ where: { userId: students[4].id, type: "waitlist.slot_available" } })).toBe(1);
  });
});

describe("student requests (OP-03, OP-12)", () => {
  it("reaches staff, allows one open request per kind, and notifies on reply", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, assignment } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const r = await createRequest(ann, assignment.id, { kind: "BOOKING_CHANGE", message: "None of the times work for me" });
    await expect(createRequest(ann, assignment.id, { kind: "BOOKING_CHANGE", message: "Again please" })).rejects.toThrow(/already have an open request/);
    await expect(createRequest(ann, assignment.id, { kind: "MARK_QUERY", message: "Why did I lose marks?" })).rejects.toThrow(/once they've been released/);
    expect(await db.notification.count({ where: { userId: ta.id, type: "request.created" } })).toBe(1);

    await expect(resolveRequest(ta, r.id, "DECLINED", "")).rejects.toThrow(/why/);
    await resolveRequest(ta, r.id, "RESOLVED", "Added a Friday slot for you");
    expect(await db.notification.count({ where: { userId: ann.id, type: "request.answered" } })).toBe(1);
  });
});

describe("hosts and slots (OP-06)", () => {
  it("reassigns slots to another host, refusing overlaps", async () => {
    const ta = await makeUser("Tara TA");
    const tom = await makeUser("Tom TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [tom], "TA");
    await enroll(course.id, [ann]);
    await bookSlot(ann, slots[0].id);
    const r = await reassignHost(ta, slots.map((s) => s.id), tom.id);
    expect(r).toEqual({ moved: 4, notified: 1 });
    expect(await db.slot.count({ where: { taId: tom.id } })).toBe(4);
    await expect(reassignHost(ta, [slots[0].id], ann.id)).rejects.toThrow(/TA or instructor/);
  });
});

describe("calendar (OP-05)", () => {
  it("exports a booking and serves a personal feed by token", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    const b = await bookSlot(ann, slots[0].id);
    expect((await bookingIcs(ann, b!.id)).ics).toContain(`UID:booking-${b!.id}@slotty`);
    await expect(bookingIcs(ta, b!.id)).rejects.toThrow(/not found/);

    const token = await rotateCalendarToken(ann);
    expect(await calendarFeed(token)).toContain("SUMMARY:CS101 demo: Project demo");
    const taFeed = await calendarFeed(await rotateCalendarToken(ta));
    expect(taFeed).toContain("SUMMARY:CS101 demo: Ann");
    expect(await calendarFeed("nope")).toBeNull();
    const replaced = await rotateCalendarToken(ann);
    expect(await calendarFeed(token)).toBeNull();
    expect(await calendarFeed(replaced)).not.toBeNull();
  });
});

describe("account (OP-07) and notifications (OP-16)", () => {
  it("changes password after checking the current one and keeps this session only", async () => {
    const ann = await makeUser("Ann");
    await db.user.update({ where: { id: ann.id }, data: { passwordHash: await hashPassword("old-password-1") } });
    await db.session.createMany({
      data: [
        { userId: ann.id, tokenHash: "this", expiresAt: inHours(24) },
        { userId: ann.id, tokenHash: "other", expiresAt: inHours(24) },
      ],
    });
    await expect(changePassword(ann, { current: "wrong", next: "new-password-1" }, "this")).rejects.toThrow(/incorrect/);
    await changePassword(ann, { current: "old-password-1", next: "new-password-1" }, "this");
    expect((await db.session.findMany({ where: { userId: ann.id } })).map((s) => s.tokenHash)).toEqual(["this"]);
    expect(await signOutOtherSessions(ann, "this")).toBe(0);
  });

  it("marks a notification read when opened", async () => {
    const ann = await makeUser("Ann");
    const bob = await makeUser("Bob");
    const n = await db.notification.create({ data: { userId: ann.id, type: "x", title: "t", body: "b", link: "/dashboard" } });
    expect(await openNotification(bob, n.id)).toBeNull();
    expect(await openNotification(ann, n.id)).toBe("/dashboard");
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).not.toBeNull();
  });
});

describe("automations (OP-08, OP-09, OP-10)", () => {
  it("nudges unbooked students once near the end of the window, then auto-closes", async () => {
    const ta = await makeUser("Tara TA");
    const [ann, bob] = [await makeUser("Ann"), await makeUser("Bob")];
    const { course, assignment, slots } = await setupCourse(ta);
    await enroll(course.id, [ann, bob]);
    await bookSlot(ann, slots[0].id);
    const policy = await db.demoPolicy.findUniqueOrThrow({ where: { assignmentId: assignment.id } });

    expect(await nudgeUnbookedStudents(inHours(-72, policy.windowEnd))).toBe(0);
    expect(await nudgeUnbookedStudents(inHours(-24, policy.windowEnd))).toBe(1);
    expect(await nudgeUnbookedStudents(inHours(-23, policy.windowEnd))).toBe(0);
    expect(await db.notification.count({ where: { userId: bob.id, type: "assignment.book_soon" } })).toBe(1);

    expect(await closeEndedAssignments(inHours(-1, policy.windowEnd))).toBe(0);
    expect(await closeEndedAssignments(inHours(1, policy.windowEnd))).toBe(1);
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("CLOSED");
  });

  it("emails hosts a morning agenda once per day, respecting their preference", async () => {
    const ta = await makeUser("Tara TA");
    const ann = await makeUser("Ann");
    const { course, slots } = await setupCourse(ta);
    await enroll(course.id, [ann]);
    // Course timezone is UTC. Put the demo at 12:00 three days out; the agenda goes at 07:00 that day.
    const noon = inHours(72);
    noon.setUTCHours(12, 0, 0, 0);
    await db.slot.update({ where: { id: slots[0].id }, data: { startsAt: noon, endsAt: inHours(0.25, noon) } });
    await bookSlot(ann, slots[0].id);
    const morning = inHours(-5, noon);
    expect(await sendDailyAgendas(inHours(-9, noon))).toBe(0); // 03:00 is too early
    expect(await sendDailyAgendas(morning)).toBe(1);
    expect(await sendDailyAgendas(inHours(1, morning))).toBe(0);
    expect(await db.emailOutbox.count({ where: { to: ta.email, subject: { startsWith: "Today:" } } })).toBe(1);
    expect(await db.notification.count({ where: { userId: ta.id, type: "agenda.daily" } })).toBe(0);

    await db.user.update({ where: { id: ta.id }, data: { emailAgenda: false, agendaSentAt: null } });
    expect(await sendDailyAgendas(morning)).toBe(0);
  });

  it("finalizes several evaluations at once (OP-13)", async () => {
    const ta = await makeUser("Tara TA");
    const prof = await makeUser("Prof");
    const [ann, bob] = [await makeUser("Ann"), await makeUser("Bob")];
    const { course, assignment } = await setupCourse(ta);
    await enroll(course.id, [ann, bob]);
    await enroll(course.id, [prof], "INSTRUCTOR");
    const ids: string[] = [];
    for (const s of [ann, bob]) {
      const ev = await getOrCreateEvaluation(ta, assignment.id, s.id);
      await saveEvaluation(ta, ev.id, { scores: ev.assignment.criteria.map((c) => ({ criterionId: c.id, points: 1 })), totalMarks: null });
      ids.push(ev.id);
    }
    await submitEvaluations(ta, ids);
    expect(await finalizeMany(prof, ids)).toBe(2);
    expect(await db.evaluation.count({ where: { status: "FINALIZED" } })).toBe(2);
  });
});
