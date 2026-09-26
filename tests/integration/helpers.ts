import { db } from "@/server/db";
import type { Actor } from "@/server/services/access";
import { createAssignment, publishAssignment } from "@/server/services/assignments";
import { createCourse, createVenue } from "@/server/services/courses";
import { addAvailability } from "@/server/services/slots";

/** Wipe every table (test DB only). */
export async function resetDb() {
  if (!/\/slotty_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to reset a non-test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
export async function makeUser(name: string, opts: { isAdmin?: boolean } = {}): Promise<Actor> {
  n++;
  const user = await db.user.create({
    data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.${n}@test.edu`, name, status: "ACTIVE", isAdmin: opts.isAdmin ?? false },
  });
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
}

export const inHours = (h: number, from = new Date()) => new Date(from.getTime() + h * 3_600_000);

/** A published CS101 assignment with four 15-minute slots starting in 48h (1 change allowed by default). */
export async function setupCourse(
  ta: Actor,
  opts: { capacity?: number; freezeHours?: number; maxReschedules?: number; bookingOpensAt?: Date | null; publish?: boolean } = {},
) {
  const course = await createCourse(ta, { code: "CS101", title: "Intro", term: "Fall 2026", timezone: "UTC", myRole: "TA" });
  const venue = await createVenue(ta, course.id, { name: "Lab 1", location: "Building A" });
  const start = inHours(48);
  const assignment = await createAssignment(ta, course.id, {
    title: "Project demo",
    description: "",
    maxMarks: 10,
    criteria: [
      { label: "Functionality", maxPoints: 6 },
      { label: "Code quality", maxPoints: 4 },
    ],
    policy: {
      windowStart: inHours(24),
      windowEnd: inHours(24 * 14),
      slotDurationMin: 15,
      bufferMin: 0,
      capacityPerSlot: opts.capacity ?? 1,
      bookingOpensAt: opts.bookingOpensAt ?? null,
      freezeHours: opts.freezeHours ?? 12,
      maxReschedules: opts.maxReschedules ?? 1,
      allowStudentCancel: true,
    },
  });
  await addAvailability(ta, assignment.id, { taId: ta.id, venueId: venue.id, startsAt: start, endsAt: inHours(1, start) });
  if (opts.publish !== false) await publishAssignment(ta, assignment.id);
  const slots = await db.slot.findMany({ where: { assignmentId: assignment.id }, orderBy: { startsAt: "asc" } });
  return { course, venue, assignment, slots };
}

export async function enroll(courseId: string, users: Actor[], role: "STUDENT" | "TA" | "INSTRUCTOR" = "STUDENT") {
  await db.enrollment.createMany({ data: users.map((u) => ({ courseId, userId: u.id, role })) });
}
