export interface SlotTiming {
  startsAt: Date;
  endsAt: Date;
}

export interface GenerateSlotsInput {
  /** Availability block the TA entered. */
  blockStart: Date;
  blockEnd: Date;
  slotDurationMin: number;
  bufferMin: number;
  /** The assignment's demo window; slots never fall outside it. */
  windowStart: Date;
  windowEnd: Date;
}

const MINUTE = 60_000;

/**
 * Slice an availability block into back-to-back slots of `slotDurationMin`,
 * separated by `bufferMin`. The block is clipped to the demo window and any
 * trailing remainder shorter than a full slot is dropped.
 */
export function generateSlots(input: GenerateSlotsInput): SlotTiming[] {
  const { slotDurationMin, bufferMin } = input;
  if (slotDurationMin <= 0) throw new RangeError("slotDurationMin must be positive");
  if (bufferMin < 0) throw new RangeError("bufferMin cannot be negative");

  const start = Math.max(input.blockStart.getTime(), input.windowStart.getTime());
  const end = Math.min(input.blockEnd.getTime(), input.windowEnd.getTime());
  const duration = slotDurationMin * MINUTE;
  const step = (slotDurationMin + bufferMin) * MINUTE;

  const slots: SlotTiming[] = [];
  for (let t = start; t + duration <= end; t += step) {
    slots.push({ startsAt: new Date(t), endsAt: new Date(t + duration) });
  }
  return slots;
}

/** True when two half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap. */
export function overlaps(a: SlotTiming, b: SlotTiming): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
