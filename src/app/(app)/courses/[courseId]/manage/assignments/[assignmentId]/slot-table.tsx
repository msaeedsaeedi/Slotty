"use client";

import { useState } from "react";
import { cancelSlotAction, changeVenueAction, deleteSlotsAction, reassignHostAction, updateSlotCapacityAction } from "@/app/actions/scheduling";
import { staffCancelBookingAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface SlotRow {
  id: string;
  day: string;
  time: string;
  host: string;
  venue: string | null;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  capacity: number;
  past: boolean;
  bookings: { id: string; name: string; status: string }[];
}

export function SlotTable({
  slots,
  venues,
  hosts,
}: {
  slots: SlotRow[];
  venues: { id: string; name: string }[];
  hosts: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCancelled, setShowCancelled] = useState(false);
  const visible = slots.filter((s) => showCancelled || s.status !== "CANCELLED");
  const days = [...new Set(visible.map((s) => s.day))];
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const hidden = [...selected].map((id) => <input key={id} type="hidden" name="slotId" value={id} />);
  const cancelledCount = slots.filter((s) => s.status === "CANCELLED").length;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 text-sm backdrop-blur">
        <span className="px-1 text-muted-foreground">{selected.size} selected</span>
        <ActionForm action={changeVenueAction} compact className="flex items-center gap-2" onSuccess={() => setSelected(new Set())}>
          {hidden}
          <select name="venueId" className="h-7 rounded-md border bg-background px-2 text-sm" defaultValue="">
            <option value="">No venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <SubmitButton size="sm" variant="outline" disabled={selected.size === 0}>
            Move to venue
          </SubmitButton>
        </ActionForm>
        {hosts.length > 1 && (
          <ActionForm action={reassignHostAction} compact className="flex items-center gap-2" onSuccess={() => setSelected(new Set())}>
            {hidden}
            <select name="taId" className="h-7 rounded-md border bg-background px-2 text-sm" defaultValue="" aria-label="New host">
              <option value="" disabled>
                New host…
              </option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <SubmitButton size="sm" variant="outline" disabled={selected.size === 0}>
              Change host
            </SubmitButton>
          </ActionForm>
        )}
        <ActionForm action={deleteSlotsAction} compact confirm="Delete the selected slots? Slots with bookings are kept." onSuccess={() => setSelected(new Set())}>
          {hidden}
          <SubmitButton size="sm" variant="ghost" className="text-destructive" disabled={selected.size === 0}>
            Delete unbooked
          </SubmitButton>
        </ActionForm>
        {cancelledCount > 0 && (
          <label className="ml-auto flex items-center gap-2 px-1 text-muted-foreground">
            <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(v === true)} /> Show {cancelledCount} cancelled
          </label>
        )}
      </div>

      {days.map((day) => {
        const daySlots = visible.filter((s) => s.day === day);
        const selectable = daySlots.filter((s) => s.status !== "CANCELLED");
        const allOn = selectable.length > 0 && selectable.every((s) => selected.has(s.id));
        return (
          <div key={day} className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={allOn} onCheckedChange={(v) => selectable.forEach((s) => toggle(s.id, v === true))} aria-label={`Select all on ${day}`} />
              {day}
            </label>
            <div className="divide-y rounded-lg border bg-card">
              {daySlots.map((s) => (
                <div key={s.id} className={`flex flex-wrap items-center gap-3 p-3 text-sm ${s.status === "CANCELLED" || s.past ? "opacity-60" : ""}`}>
                  <Checkbox
                    checked={selected.has(s.id)}
                    disabled={s.status === "CANCELLED"}
                    onCheckedChange={(v) => toggle(s.id, v === true)}
                    aria-label={`Select ${s.time}`}
                  />
                  <span className="w-28 font-medium tabular-nums">{s.time}</span>
                  <span className="w-32 truncate text-muted-foreground">{s.host}</span>
                  <span className="w-28 truncate text-muted-foreground">{s.venue ?? "No venue"}</span>
                  {s.status !== "PUBLISHED" && <StatusBadge status={s.status} />}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {s.bookings.length === 0 && s.status !== "CANCELLED" && (
                      <span className="text-xs text-muted-foreground">{s.capacity > 1 ? `0/${s.capacity} booked` : "Free"}</span>
                    )}
                    {s.bookings.map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-1">
                        <StatusBadge status={b.status} label={b.name} />
                        {b.status === "BOOKED" && !s.past && (
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-1 text-xs text-muted-foreground hover:text-destructive" aria-label={`Cancel ${b.name}'s booking`}>
                              ✕
                            </summary>
                            <ActionForm action={staffCancelBookingAction} compact className="absolute left-0 z-20 mt-1 flex w-72 gap-2 rounded-lg border bg-popover p-2 shadow-md">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <Input name="reason" required placeholder={`Reason (sent to ${b.name})`} className="h-7" aria-label="Reason" />
                              <SubmitButton size="sm" variant="destructive">
                                Cancel
                              </SubmitButton>
                            </ActionForm>
                          </details>
                        )}
                      </span>
                    ))}
                    {s.capacity > 1 && s.bookings.length > 0 && <span className="text-xs text-muted-foreground">{s.bookings.length}/{s.capacity}</span>}
                  </div>
                  {s.status !== "CANCELLED" && !s.past && (
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-xs text-muted-foreground hover:text-foreground">Capacity</summary>
                      <ActionForm action={updateSlotCapacityAction} compact className="absolute right-0 z-20 mt-1 flex w-56 items-center gap-2 rounded-lg border bg-popover p-2 shadow-md">
                        <input type="hidden" name="slotId" value={s.id} />
                        <Input name="capacity" type="number" min={Math.max(1, s.bookings.length)} max={100} defaultValue={s.capacity} className="h-7" aria-label="Students per slot" />
                        <SubmitButton size="sm" variant="outline">
                          Save
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  {s.status !== "CANCELLED" && !s.past && (
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-xs text-muted-foreground hover:text-destructive">Cancel slot</summary>
                      <ActionForm action={cancelSlotAction} compact className="absolute right-0 z-20 mt-1 flex w-72 gap-2 rounded-lg border bg-popover p-2 shadow-md">
                        <input type="hidden" name="slotId" value={s.id} />
                        <Input name="reason" placeholder="Reason (sent to students)" className="h-7" />
                        <SubmitButton size="sm" variant="destructive">
                          Cancel
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
