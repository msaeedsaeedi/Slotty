import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { listMyBookings } from "@/server/services/bookings";

export const metadata = { title: "My bookings" };

export default async function BookingsPage() {
  const user = await requireUser();
  const bookings = await listMyBookings(user);
  const now = new Date();
  return (
    <div>
      <PageHeader title="My bookings" description="Every demo you've booked, including cancelled and past ones." />
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
              {bookings.map((b) => (
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
                    {b.status === "BOOKED" && b.slot.venue?.meetingUrl && (
                      <a href={b.slot.venue.meetingUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        Join online
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                    {b.status === "BOOKED" && b.slot.endsAt > now && (
                      <a href={`/bookings/${b.id}/calendar`} className="mt-1 block text-xs text-primary underline">
                        Add to calendar
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
