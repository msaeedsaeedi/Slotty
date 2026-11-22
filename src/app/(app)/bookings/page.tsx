import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { DemoStateBadge } from "@/components/demo-state";
import { StatusBadge } from "@/components/status-badge";
import { studentDemoState } from "@/domain/student-demo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { fmtRange } from "@/lib/time";
import { AddToCalendar } from "@/components/add-to-calendar";
import { requireUser } from "@/server/auth/session";
import { bookingCalendarOptions } from "@/server/services/calendar";
import { listMyBookings } from "@/server/services/bookings";
import { listMyVisibleMarks } from "@/server/services/evaluations";

export const metadata = { title: "My demos" };

export default async function BookingsPage() {
  const user = await requireUser();
  const [bookings, marks] = await Promise.all([listMyBookings(user), listMyVisibleMarks(user)]);
  const now = new Date();
  // Marks belong to the assignment, so only the booking that led to the demo shows them; cancelled ones keep their own status.
  const stateOf = (b: (typeof bookings)[number]) =>
    b.status === "CANCELLED"
      ? null
      : studentDemoState({ booking: { status: b.status, startsAt: b.slot.startsAt, endsAt: b.slot.endsAt }, marks: marks.get(b.assignmentId) ?? null, now });
  return (
    <div>
      <PageHeader title="My demos" description="Every demo you've booked, including cancelled and past ones." />
      {bookings.length === 0 ? (
        <EmptyState title="No bookings yet">Open a course to book a demo slot.</EmptyState>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assignment</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="hidden sm:table-cell">Where</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const state = stateOf(b);
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`}>
                        {b.assignment.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{b.assignment.course.code}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">{fmtRange(b.slot.startsAt, b.slot.endsAt, b.assignment.course.timezone)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {b.slot.venue ? [b.slot.venue.name, b.slot.venue.location].filter(Boolean).join(", ") : "TBA"}
                      <div className="text-xs text-muted-foreground">with {b.slot.ta.name}</div>
                      {(state?.kind === "BOOKED" || state?.kind === "IN_PROGRESS") && b.slot.venue?.meetingUrl && (
                        <a href={b.slot.venue.meetingUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                          Join online
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {state ? (
                        <DemoStateBadge state={state} maxMarks={b.assignment.maxMarks} />
                      ) : (
                        <StatusBadge status={b.status === "CANCELLED" && b.replacedBy ? b.replacedBy : b.status} />
                      )}
                      {state?.kind === "BOOKED" && (
                        <div className="mt-1">
                          <AddToCalendar options={bookingCalendarOptions(b)} variant="ghost" />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
