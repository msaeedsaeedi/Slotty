import Link from "next/link";
import { Download, Pencil } from "lucide-react";
import { addAvailabilityAction, closeAssignmentAction, deleteAssignmentAction, publishAssignmentAction } from "@/app/actions/scheduling";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmt } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getAssignment } from "@/server/services/assignments";
import { listCourseStaff, listVenues } from "@/server/services/courses";
import { listAssignmentRoster } from "@/server/services/evaluations";
import { listSlotsForStaff } from "@/server/services/slots";
import { SlotTable, type SlotRow } from "./slot-table";
import { StudentsTable, type StudentRow } from "./students-table";

export default async function ManageAssignmentPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]">) {
  const { courseId, assignmentId } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  const { assignment, criteria } = await load(getAssignment(user, assignmentId));
  const tz = assignment.course.timezone;
  const policy = assignment.policy!;
  const [slots, venues, staff, roster] = await Promise.all([
    listSlotsForStaff(user, assignmentId),
    listVenues(user, courseId),
    listCourseStaff(courseId),
    listAssignmentRoster(user, assignmentId),
  ]);
  const activeTab = tab === "students" ? "students" : "slots";
  const now = new Date();
  const base = `/courses/${courseId}/manage/assignments/${assignmentId}`;
  const drafts = slots.filter((s) => s.status === "DRAFT").length;
  const liveSlots = slots.filter((s) => s.status !== "CANCELLED");
  const totalCapacity = liveSlots.reduce((n, s) => n + s.capacity, 0);
  const hasBookings = roster.some((r) => r.booking);

  const slotRows: SlotRow[] = slots.map((s) => ({
    id: s.id,
    day: fmt(s.startsAt, tz, "EEEE d MMMM"),
    time: `${fmt(s.startsAt, tz, "HH:mm")}–${fmt(s.endsAt, tz, "HH:mm")}`,
    host: s.ta.name,
    venue: s.venue?.name ?? null,
    status: s.status,
    capacity: s.capacity,
    past: s.endsAt < now,
    bookings: s.bookings.map((b) => ({ id: b.id, name: b.student.name, status: b.status })),
  }));
  const studentRows: StudentRow[] = roster.map((r) => ({
    id: r.student.id,
    name: r.student.name,
    email: r.student.email,
    section: r.section,
    slot: r.booking ? fmt(r.booking.slot.startsAt, tz, "EEE d MMM, HH:mm") : null,
    host: r.booking?.slot.ta.name ?? null,
    bookingStatus: r.booking?.status ?? null,
    evaluationId: r.evaluation?.id ?? null,
    evaluationStatus: r.evaluation?.status ?? null,
    total: r.evaluation?.totalMarks ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {assignment.title} <StatusBadge status={assignment.status} />
          </span>
        }
        description={
          <>
            Demos {fmt(policy.windowStart, tz, "EEE d MMM HH:mm")} – {fmt(policy.windowEnd, tz, "EEE d MMM HH:mm")} · {policy.slotDurationMin} min
            {policy.bufferMin > 0 && ` + ${policy.bufferMin} min break`} · {policy.capacityPerSlot} per slot · locks {policy.freezeHours}h before ·{" "}
            {policy.maxReschedules} reschedule{policy.maxReschedules === 1 ? "" : "s"} · marked out of {assignment.maxMarks}
            {criteria.length > 0 && ` (${criteria.length}-row rubric)`}
          </>
        }
        back={{ href: `/courses/${courseId}/manage`, label: "Assignments" }}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${base}/export`}>
                <Download /> Export CSV
              </a>
            </Button>
            {assignment.status !== "PUBLISHED" ? (
              <ActionForm action={publishAssignmentAction} compact confirm="Publish? All students in the course will be notified that booking is open.">
                <input type="hidden" name="assignmentId" value={assignmentId} />
                <SubmitButton size="sm">{assignment.status === "CLOSED" ? "Reopen booking" : "Publish"}</SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={closeAssignmentAction} compact confirm="Close booking? Students won't be able to book or change slots. Existing bookings stay.">
                <input type="hidden" name="assignmentId" value={assignmentId} />
                <SubmitButton size="sm" variant="outline">
                  Close booking
                </SubmitButton>
              </ActionForm>
            )}
            {!hasBookings && (
              <ActionForm action={deleteAssignmentAction} compact confirm="Delete this assignment and all its slots?">
                <input type="hidden" name="assignmentId" value={assignmentId} />
                <input type="hidden" name="courseId" value={courseId} />
                <SubmitButton size="sm" variant="ghost" className="text-destructive">
                  Delete
                </SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />

      <div className="flex gap-1 border-b text-sm">
        {[
          ["slots", `Slots (${liveSlots.length})`],
          ["students", `Students & marks (${roster.length})`],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?tab=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 ${activeTab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {activeTab === "slots" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="order-2 space-y-3 lg:order-1">
            <p className="text-sm text-muted-foreground">
              {liveSlots.length} slots · room for {totalCapacity} of {roster.length} students
              {drafts > 0 && ` · ${drafts} draft slot${drafts === 1 ? "" : "s"} go live when you publish`}
            </p>
            {slots.length === 0 ? (
              <EmptyState title="No slots yet">Add your availability — Slotty splits it into {policy.slotDurationMin}-minute slots.</EmptyState>
            ) : (
              <SlotTable slots={slotRows} venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
            )}
          </div>
          <Card className="order-1 h-fit lg:order-2">
            <CardHeader>
              <CardTitle>Add availability</CardTitle>
              <CardDescription>Times in {tz}. Overlaps with the host&apos;s other slots are rejected.</CardDescription>
            </CardHeader>
            <CardContent>
              {assignment.status === "CLOSED" ? (
                <p className="text-sm text-muted-foreground">Reopen booking to add slots.</p>
              ) : (
                <ActionForm action={addAvailabilityAction} className="space-y-3">
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="assignmentId" value={assignmentId} />
                  <div className="space-y-2">
                    <Label htmlFor="taId">Host</Label>
                    <select id="taId" name="taId" defaultValue={user.id} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
                      {staff.map((s) => (
                        <option key={s.userId} value={s.userId}>
                          {s.user.name}
                          {s.userId === user.id ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venueId">Venue</Label>
                    <select id="venueId" name="venueId" className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
                      <option value="">To be announced</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    {venues.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        <Link className="underline" href={`/courses/${courseId}/manage/venues`}>
                          Add venues
                        </Link>{" "}
                        so students know where to go.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      min={fmt(policy.windowStart, tz, "yyyy-MM-dd")}
                      max={fmt(policy.windowEnd, tz, "yyyy-MM-dd")}
                      defaultValue={fmt(policy.windowStart > now ? policy.windowStart : now, tz, "yyyy-MM-dd")}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="startTime">From</Label>
                      <Input id="startTime" name="startTime" type="time" defaultValue="09:00" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endTime">To</Label>
                      <Input id="endTime" name="endTime" type="time" defaultValue="12:00" required />
                    </div>
                  </div>
                  <SubmitButton className="w-full">Generate slots</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <StudentsTable rows={studentRows} maxMarks={assignment.maxMarks} markHref={`${base}/evaluate`} />
      )}
    </div>
  );
}
