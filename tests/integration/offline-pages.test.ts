import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookSlot } from "@/server/services/bookings";
import { removeMember } from "@/server/services/courses";
import { offlinePagesFor } from "@/server/services/offline";
import { enroll, makeUser, resetDb, setupCourse } from "./helpers";

beforeEach(resetDb);

const urls = async (...args: Parameters<typeof offlinePagesFor>) => (await offlinePagesFor(...args)).pages.map((p) => p.url);
const version = async (actor: Parameters<typeof offlinePagesFor>[0], url: string) => (await offlinePagesFor(actor)).pages.find((p) => p.url === url)?.version;

async function bookedCourse() {
  const ta = await makeUser("Tara TA");
  const other = await makeUser("Omar TA");
  const ann = await makeUser("Ann");
  const bo = await makeUser("Bo");
  const { course, assignment, slots, venue } = await setupCourse(ta);
  await enroll(course.id, [other], "TA");
  await enroll(course.id, [ann, bo]);
  await bookSlot(ann, slots[0].id);
  return { ta, other, ann, bo, course, assignment, slots, venue };
}

describe("offline pages per account (#162)", () => {
  it("gives a student their course and the assignment they booked, never staff pages", async () => {
    const { ann, course, assignment } = await bookedCourse();
    const pages = await urls(ann);
    expect(pages).toEqual(expect.arrayContaining(["/dashboard", "/bookings", "/notifications", `/courses/${course.id}`, `/courses/${course.id}/assignments/${assignment.id}`]));
    expect(pages.some((p) => p.includes("/manage"))).toBe(false);
    expect(pages).not.toContain("/today");
  });

  it("gives a TA the students booked with them, and another TA none of them", async () => {
    const { ta, other, ann, course, assignment } = await bookedCourse();
    const evaluate = `/courses/${course.id}/manage/assignments/${assignment.id}/evaluate/${ann.id}`;
    const mine = await urls(ta);
    expect(mine).toEqual(expect.arrayContaining(["/today", `/courses/${course.id}/manage/today`, evaluate, `/courses/${course.id}/manage/assignments/${assignment.id}/mark`]));
    expect(mine).not.toContain(`/courses/${course.id}/manage/review`);
    const theirs = await urls(other);
    expect(theirs).toContain(`/courses/${course.id}/manage/today`);
    expect(theirs.some((p) => p.includes("/evaluate/"))).toBe(false);
  });

  it("gives admin and platform accounts nothing", async () => {
    await bookedCourse();
    expect(await urls(await makeUser("Ada Admin", { isAdmin: true }))).toEqual([]);
    expect(await urls(await makeUser("Pat Platform", { isPlatform: true }))).toEqual([]);
  });

  it("drops a course's pages when the student leaves it, or the course is archived", async () => {
    const { ta, ann, bo, course } = await bookedCourse();
    await removeMember(ta, course.id, bo.id);
    expect((await urls(bo)).some((p) => p.startsWith("/courses/"))).toBe(false);
    await db.course.update({ where: { id: course.id }, data: { archived: true } });
    expect((await urls(ann)).some((p) => p.startsWith("/courses/"))).toBe(false);
  });

  it("changes the version when something on the page changes, and only then", async () => {
    const { ann, course, slots, venue } = await bookedCourse();
    const page = `/courses/${course.id}`;
    const v1 = await version(ann, page);
    expect(await version(ann, page)).toBe(v1);
    await db.venue.update({ where: { id: venue.id }, data: { name: "Lab 2" } });
    const v2 = await version(ann, page);
    expect(v2).not.toBe(v1);
    await db.slot.update({ where: { id: slots[1].id }, data: { status: "CANCELLED" } });
    expect(await version(ann, page)).not.toBe(v2);
  });
});
