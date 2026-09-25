import { allowRebookAction, setAllowanceAction, staffPlaceStudentAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChangeBudget } from "@/domain/booking-rules";
import { fmt } from "@/lib/time";

/**
 * Staff tools for one student's booking: place or move them (ignores the freeze
 * window and their change budget), let a no-show book again, and grant exceptions.
 */
export function BookingControls({
  assignmentId,
  student,
  booking,
  budget,
  allowance,
  slots,
  timezone,
}: {
  assignmentId: string;
  student: { id: string; name: string };
  booking: { id: string; slotId: string; status: string } | null;
  budget: ChangeBudget;
  allowance: { extraChanges: number; lateBooking: boolean; note: string | null } | null;
  slots: { id: string; startsAt: Date; endsAt: Date; capacity: number; booked: number; ta: { name: string } }[];
  timezone: string;
}) {
  const choices = slots.filter((s) => s.id !== booking?.slotId);
  const moving = booking?.status === "BOOKED" || booking?.status === "NO_SHOW";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booking</CardTitle>
        <CardDescription>
          {student.name} has used {budget.used} of {budget.allowed} change{budget.allowed === 1 ? "" : "s"}. Anything you do here doesn&apos;t use their changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {booking?.status === "COMPLETED" ? (
          <p className="text-muted-foreground">The demo is completed, so the booking can&apos;t be moved.</p>
        ) : choices.length === 0 ? (
          <p className="text-muted-foreground">There are no upcoming slots to place {student.name} in. Add availability first.</p>
        ) : (
          <ActionForm action={staffPlaceStudentAction} className="space-y-2" confirm={`${moving ? "Move" : "Book"} ${student.name}? They'll be notified.`}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="studentId" value={student.id} />
            <Label htmlFor="place-slot">{moving ? "Move to another slot" : "Book them into a slot"}</Label>
            <div className="flex flex-wrap gap-2">
              <select id="place-slot" name="slotId" required className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm">
                {choices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmt(s.startsAt, timezone, "EEE d MMM HH:mm")}–{fmt(s.endsAt, timezone, "HH:mm")} · {s.ta.name} ·{" "}
                    {s.booked >= s.capacity ? "full" : `${s.capacity - s.booked} free`}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm">{moving ? "Move" : "Book"}</SubmitButton>
            </div>
            <label className="flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" name="overCapacity" /> Allow over capacity (add them even if the slot is full)
            </label>
          </ActionForm>
        )}

        {booking?.status === "NO_SHOW" && (
          <ActionForm action={allowRebookAction} compact confirm={`Clear the no-show and let ${student.name} book a new slot themselves?`}>
            <input type="hidden" name="bookingId" value={booking.id} />
            <SubmitButton size="sm" variant="outline">
              Let them book again themselves
            </SubmitButton>
          </ActionForm>
        )}

        <ActionForm action={setAllowanceAction} className="space-y-2 border-t pt-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="studentId" value={student.id} />
          <p className="font-medium">Exception for this student</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="extraChanges">Extra changes</Label>
              <Input id="extraChanges" name="extraChanges" type="number" min={0} max={20} defaultValue={allowance?.extraChanges ?? 0} className="h-8 w-24" />
            </div>
            <label className="flex h-8 items-center gap-2">
              <input type="checkbox" name="lateBooking" defaultChecked={allowance?.lateBooking ?? false} /> May book even when booking is closed
            </label>
          </div>
          <Input name="note" placeholder="Note to the student (optional)" defaultValue={allowance?.note ?? ""} maxLength={500} aria-label="Note to the student" />
          <SubmitButton size="sm" variant="outline">
            Save exception
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
