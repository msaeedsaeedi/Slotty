"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, MapPin, MoreHorizontal, Trash2, UserRound, X } from "lucide-react";
import { cancelSlotAction, changeVenueAction, deleteSlotsAction, reassignHostAction, updateSlotCapacityAction } from "@/app/actions/scheduling";
import { staffCancelBookingAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-utils";
import { cn } from "@/lib/utils";

export interface SlotRow {
  id: string;
  dayKey: string;
  day: string;
  time: string;
  host: string;
  venue: string | null;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  capacity: number;
  past: boolean;
  bookings: { id: string; name: string; status: string }[];
}

type Ask =
  | { kind: "capacity"; slot: SlotRow }
  | { kind: "cancel-slot"; slot: SlotRow }
  | { kind: "cancel-booking"; slot: SlotRow; booking: SlotRow["bookings"][number] }
  | { kind: "delete" }
  | null;

export function SlotTable({
  slots,
  venues,
  hosts,
}: {
  slots: SlotRow[];
  venues: { id: string; name: string }[];
  /** Hosts slots can be handed to (instructors only; empty for TAs). */
  hosts: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCancelled, setShowCancelled] = useState(false);
  const visible = slots.filter((s) => showCancelled || s.status !== "CANCELLED");
  const days = [...new Map(visible.map((s) => [s.dayKey, s.day])).entries()];
  // Days that are over start folded away.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(days.filter(([k]) => visible.filter((s) => s.dayKey === k).every((s) => s.past)).map(([k]) => k)));
  const [ask, setAsk] = useState<Ask>(null);
  const [pending, startTransition] = useTransition();
  const cancelledCount = slots.filter((s) => s.status === "CANCELLED").length;
  const multiHost = new Set(slots.map((s) => s.host)).size > 1;

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const fold = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedRows = slots.filter((s) => selected.has(s.id));
  const bookedInSelection = selectedRows.reduce((n, s) => n + s.bookings.filter((b) => b.status === "BOOKED").length, 0);

  /** Bulk changes apply as soon as an option is picked: one step, no separate "apply". */
  const bulk = (action: (s: ActionState, fd: FormData) => Promise<ActionState>, field: string, value: string) => {
    const fd = new FormData();
    for (const id of selected) fd.append("slotId", id);
    fd.set(field, value);
    startTransition(async () => {
      const r = await action(null, fd);
      if (r?.ok) {
        if (r.message) toast.success(r.message);
        setSelected(new Set());
      } else if (r) toast.error(r.error);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Select slots to change several at once.</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setCollapsed(new Set())}>
            Expand all
          </button>
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setCollapsed(new Set(days.map(([k]) => k)))}>
            Collapse all
          </button>
        </span>
        {cancelledCount > 0 && (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(v === true)} /> Show {cancelledCount} cancelled
          </label>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-9 py-2 pl-3" />
              <th className="py-2 pr-3 font-medium">Time</th>
              <th className={cn("py-2 pr-3 font-medium", !multiHost && "hidden sm:table-cell")}>Host</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">Venue</th>
              <th className="py-2 pr-3 font-medium">Students</th>
              <th className="w-10 py-2 pr-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {days.map(([key, label]) => {
            const daySlots = visible.filter((s) => s.dayKey === key);
            const selectable = daySlots.filter((s) => s.status !== "CANCELLED" && !s.past);
            const allOn = selectable.length > 0 && selectable.every((s) => selected.has(s.id));
            const booked = daySlots.reduce((n, s) => n + s.bookings.length, 0);
            const open = !collapsed.has(key);
            return (
              <tbody key={key} className="divide-y border-t">
                <tr className="sticky top-8 z-10 bg-card">
                  <td className="py-2 pl-3">
                    <Checkbox
                      checked={allOn}
                      disabled={selectable.length === 0}
                      onCheckedChange={(v) => toggle(selectable.map((s) => s.id), v === true)}
                      aria-label={`Select all upcoming slots on ${label}`}
                    />
                  </td>
                  <td colSpan={5} className="py-1 pr-2">
                    <button type="button" onClick={() => fold(key)} aria-expanded={open} className="flex w-full items-center gap-2 py-1 text-left font-medium">
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      {label}
                      <span className="font-normal text-muted-foreground">
                        · {daySlots.length} slot{daySlots.length === 1 ? "" : "s"}, {booked} booked
                      </span>
                    </button>
                  </td>
                </tr>
                {open &&
                  daySlots.map((s) => {
                    const editable = s.status !== "CANCELLED" && !s.past;
                    return (
                      <tr key={s.id} className={cn(selected.has(s.id) && "bg-primary/5", (s.status === "CANCELLED" || s.past) && "text-muted-foreground")}>
                        <td className="py-2 pl-3 align-top">
                          <Checkbox checked={selected.has(s.id)} disabled={!editable} onCheckedChange={(v) => toggle([s.id], v === true)} aria-label={`Select ${s.time}`} />
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap tabular-nums">
                          {s.time}
                          {s.status !== "PUBLISHED" && <StatusBadge status={s.status} label={s.status === "DRAFT" ? "Hidden" : undefined} className="ml-2" />}
                        </td>
                        <td className={cn("max-w-32 truncate py-2 pr-3 align-top", !multiHost && "hidden sm:table-cell")}>{s.host}</td>
                        <td className="hidden max-w-32 truncate py-2 pr-3 align-top sm:table-cell">{s.venue ?? <span className="text-muted-foreground">TBA</span>}</td>
                        <td className="py-2 pr-3 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {s.bookings.map((b) => (
                              <span key={b.id} className="inline-flex items-center rounded-full bg-blue-100 py-0.5 pl-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
                                {b.name}
                                {b.status !== "BOOKED" && <span className="ml-1 opacity-70">({b.status === "COMPLETED" ? "present" : "no-show"})</span>}
                                {b.status === "BOOKED" && editable ? (
                                  <button
                                    type="button"
                                    onClick={() => setAsk({ kind: "cancel-booking", slot: s, booking: b })}
                                    className="ml-0.5 rounded-full p-1 hover:bg-blue-200 dark:hover:bg-blue-900"
                                    aria-label={`Cancel ${b.name}'s booking`}
                                  >
                                    <X className="size-3" />
                                  </button>
                                ) : (
                                  <span className="pr-2" />
                                )}
                              </span>
                            ))}
                            {s.status !== "CANCELLED" && (s.bookings.length === 0 || s.capacity > 1) && (
                              <span className="text-xs text-muted-foreground">
                                {s.bookings.length === 0 ? (s.capacity > 1 ? `0 of ${s.capacity}` : "Free") : `${s.bookings.length} of ${s.capacity}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 align-top">
                          {editable && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.time}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setAsk({ kind: "capacity", slot: s })}>Students per slot ({s.capacity})…</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setAsk({ kind: "cancel-slot", slot: s })}>
                                  Cancel slot…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Floats while something is selected, so the actions are next to your thumb, not up the page. */}
      {selected.size > 0 && (
        <div role="toolbar" aria-label="Selected slots" className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border bg-background p-1.5 pl-4 text-sm shadow-lg">
          <span className="mr-1 font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={pending}>
                <MapPin /> Venue
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Move to{bookedInSelection ? ` (tells ${bookedInSelection} booked student${bookedInSelection === 1 ? "" : "s"})` : ""}</DropdownMenuLabel>
              {venues.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => bulk(changeVenueAction, "venueId", v.id)}>
                  {v.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => bulk(changeVenueAction, "venueId", "")}>To be announced</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hosts.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={pending}>
                  <UserRound /> Host
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Hand over to{bookedInSelection ? ` (tells ${bookedInSelection} student${bookedInSelection === 1 ? "" : "s"})` : ""}</DropdownMenuLabel>
                {hosts.map((h) => (
                  <DropdownMenuItem key={h.id} onSelect={() => bulk(reassignHostAction, "taId", h.id)}>
                    {h.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setAsk({ kind: "delete" })}>
            <Trash2 /> Delete
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <X />
          </Button>
        </div>
      )}

      <Dialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent>
          {ask?.kind === "capacity" && (
            <ActionForm action={updateSlotCapacityAction} onSuccess={() => setAsk(null)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Students per slot</DialogTitle>
                <DialogDescription>
                  {ask.slot.day}, {ask.slot.time}. {ask.slot.bookings.length ? `${ask.slot.bookings.length} already booked, so it can't go lower than that.` : "Use more than 1 for group demos."}
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="slotId" value={ask.slot.id} />
              <div className="space-y-1.5">
                <Label htmlFor="capacity">Students</Label>
                <Input id="capacity" name="capacity" type="number" min={Math.max(1, ask.slot.bookings.length)} max={100} defaultValue={ask.slot.capacity} required autoFocus />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAsk(null)}>
                  Close
                </Button>
                <SubmitButton>Save</SubmitButton>
              </DialogFooter>
            </ActionForm>
          )}
          {ask?.kind === "cancel-slot" && (
            <ActionForm action={cancelSlotAction} onSuccess={() => setAsk(null)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Cancel this slot?</DialogTitle>
                <DialogDescription>
                  {ask.slot.day}, {ask.slot.time}.{" "}
                  {ask.slot.bookings.length
                    ? `${ask.slot.bookings.map((b) => b.name).join(", ")} will be told and can book another time without using a change.`
                    : "Nobody has booked it."}
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="slotId" value={ask.slot.id} />
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason {ask.slot.bookings.length ? "(sent to the students)" : "(optional)"}</Label>
                <Input id="reason" name="reason" required={ask.slot.bookings.length > 0} maxLength={500} autoFocus />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAsk(null)}>
                  Keep slot
                </Button>
                <SubmitButton variant="destructive">Cancel slot</SubmitButton>
              </DialogFooter>
            </ActionForm>
          )}
          {ask?.kind === "cancel-booking" && (
            <ActionForm action={staffCancelBookingAction} onSuccess={() => setAsk(null)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Cancel {ask.booking.name}&apos;s booking?</DialogTitle>
                <DialogDescription>
                  {ask.slot.day}, {ask.slot.time}. They&apos;re told and can book again without using a change.
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="bookingId" value={ask.booking.id} />
              <div className="space-y-1.5">
                <Label htmlFor="booking-reason">Reason (sent to {ask.booking.name})</Label>
                <Input id="booking-reason" name="reason" required maxLength={500} autoFocus />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAsk(null)}>
                  Keep booking
                </Button>
                <SubmitButton variant="destructive">Cancel booking</SubmitButton>
              </DialogFooter>
            </ActionForm>
          )}
          {ask?.kind === "delete" && (
            <ActionForm
              action={deleteSlotsAction}
              onSuccess={() => {
                setAsk(null);
                setSelected(new Set());
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>Delete {selected.size} slot{selected.size === 1 ? "" : "s"}?</DialogTitle>
                <DialogDescription>
                  {selectedRows.some((s) => s.bookings.length)
                    ? "Slots with bookings are kept — cancel those instead so the students are told."
                    : "They're removed for good. Nobody has booked them."}
                </DialogDescription>
              </DialogHeader>
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="slotId" value={id} />
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAsk(null)}>
                  Keep them
                </Button>
                <SubmitButton variant="destructive">Delete</SubmitButton>
              </DialogFooter>
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
