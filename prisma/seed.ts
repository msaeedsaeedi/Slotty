/**
 * Seeds an admin plus a demo course so the whole loop can be tried locally.
 * Safe to re-run: accounts are upserted and demo courses are only created once.
 *
 * Accounts (password for all demo users: "password123"):
 *   admin@slotty.local (password from SEED_ADMIN_PASSWORD)
 *   prof@slotty.local — instructor of CS 350
 *   ta@slotty.local   — TA of CS 350, and sole staff of CS 101 (no instructor)
 *   student1..6@slotty.local
 */
import "dotenv/config";
import { addDays, format } from "date-fns";
import { fromLocalInput } from "@/lib/time";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createAssignment, publishAssignment } from "@/server/services/assignments";
import { addAvailability } from "@/server/services/slots";
import { bookSlot } from "@/server/services/bookings";
import type { Actor } from "@/server/services/access";

async function upsertUser(email: string, name: string, password: string, isAdmin = false): Promise<Actor> {
  const passwordHash = await hashPassword(password);
  const user = await db.user.upsert({
    where: { email },
    create: { email, name, passwordHash, isAdmin, status: "ACTIVE" },
    update: {},
  });
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
}

async function main() {
  const admin = await upsertUser(
    process.env.SEED_ADMIN_EMAIL ?? "admin@slotty.local",
    "Slotty Admin",
    process.env.SEED_ADMIN_PASSWORD ?? "admin12345",
    true,
  );
  const prof = await upsertUser("prof@slotty.local", "Dr. Ada Instructor", "password123");
  const ta = await upsertUser("ta@slotty.local", "Tariq TA", "password123");
  const students = await Promise.all(
    ["Sara Ahmadi", "Liam Chen", "Maya Patel", "Omar Haddad", "Zoe Müller", "Ravi Kumar"].map((name, i) =>
      upsertUser(`student${i + 1}@slotty.local`, name, "password123"),
    ),
  );

  if (await db.course.findFirst({ where: { code: "CS 350" } })) {
    console.log("Demo data already present — accounts refreshed.");
    return;
  }

  const TZ = "Asia/Karachi";
  // Wall-clock time in the course timezone, `days` from today.
  const at = (days: number, hhmm: string) => fromLocalInput(`${format(addDays(new Date(), days), "yyyy-MM-dd")}T${hhmm}`, TZ);

  // CS 350: instructor + TA, published assignment with bookings.
  const cs350 = await db.course.create({
    data: { code: "CS 350", title: "Operating Systems", term: "Fall 2026", timezone: TZ, createdById: ta.id },
  });
  await db.enrollment.createMany({
    data: [
      { courseId: cs350.id, userId: prof.id, role: "INSTRUCTOR" },
      { courseId: cs350.id, userId: ta.id, role: "TA" },
      ...students.map((s, i) => ({ courseId: cs350.id, userId: s.id, role: "STUDENT" as const, section: i % 2 ? "B" : "A" })),
    ],
  });
  const lab = await db.venue.create({ data: { courseId: cs350.id, name: "Systems Lab", location: "CS Building, Room 204" } });
  await db.venue.create({ data: { courseId: cs350.id, name: "Online", meetingUrl: "https://meet.example.com/cs350-demos" } });

  const assignment = await createAssignment(ta, cs350.id, {
    title: "Project 1 — Shell demo",
    description: "Bring your laptop with the shell compiled. Be ready to walk through pipes and redirection.",
    maxMarks: 20,
    criteria: [
      { label: "Functionality", maxPoints: 10 },
      { label: "Code quality", maxPoints: 5 },
      { label: "Viva answers", maxPoints: 5 },
    ],
    policy: {
      windowStart: at(1, "08:00"),
      windowEnd: at(9, "18:00"),
      slotDurationMin: 15,
      bufferMin: 5,
      capacityPerSlot: 1,
      bookingOpensAt: null,
      freezeHours: 12,
      maxReschedules: 2,
      allowStudentCancel: true,
    },
  });
  await addAvailability(ta, assignment.id, { taId: ta.id, venueId: lab.id, startsAt: at(2, "09:00"), endsAt: at(2, "12:00") });
  await addAvailability(ta, assignment.id, { taId: prof.id, venueId: lab.id, startsAt: at(3, "14:00"), endsAt: at(3, "16:00") });
  await publishAssignment(ta, assignment.id);
  const slots = await db.slot.findMany({ where: { assignmentId: assignment.id }, orderBy: { startsAt: "asc" } });
  await bookSlot(students[0], slots[0].id);
  await bookSlot(students[1], slots[2].id);
  await bookSlot(students[2], slots[4].id);

  // CS 101: TA running it alone (no instructor) — submissions finalize directly.
  const cs101 = await db.course.create({
    data: { code: "CS 101", title: "Programming Fundamentals", term: "Fall 2026", timezone: TZ, createdById: ta.id },
  });
  await db.enrollment.createMany({
    data: [
      { courseId: cs101.id, userId: ta.id, role: "TA" },
      ...students.slice(3).map((s) => ({ courseId: cs101.id, userId: s.id, role: "STUDENT" as const })),
    ],
  });

  console.log(`Seeded admin (${admin.email}), CS 350 and CS 101.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
