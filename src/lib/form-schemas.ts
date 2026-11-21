import { z } from "zod";
import { checkRubric, MARK_DECIMALS } from "@/domain/evaluation";
import { SLOT_CAPACITY_MAX } from "@/domain/slots";
import { REASON_MAX_LENGTH } from "@/domain/text";

/*
 * Form schemas shared by the server (services parse with them) and the browser (`fieldProps`
 * turns them into input limits), so a form never allows what the server refuses. Client-safe:
 * no database or server imports.
 */

const marks = (label: string) =>
  z.coerce
    .number()
    .positive(`${label} must be above 0.`)
    .max(10_000)
    .refine((n) => Math.abs(n * 10 ** MARK_DECIMALS - Math.round(n * 10 ** MARK_DECIMALS)) < 1e-6, `${label}: use at most ${MARK_DECIMALS} decimals.`);

export const criterionInput = z.object({
  label: z.string().trim().min(1, "Each rubric row needs a label.").max(120),
  maxPoints: marks("Rubric points"),
});

/** The assignment's demo policy. Field names match the form's inputs, so errors land next to them. */
export const policyFields = z.object({
  windowStart: z.date(),
  windowEnd: z.date(),
  slotDurationMin: z.coerce.number().int().min(5, "Slots must be at least 5 minutes.").max(480),
  bufferMin: z.coerce.number().int().min(0).max(240),
  capacityPerSlot: z.coerce.number().int().min(1).max(SLOT_CAPACITY_MAX),
  bookingOpensAt: z.date().nullable(),
  freezeHours: z.coerce.number().int().min(0).max(24 * 14),
  maxReschedules: z.coerce.number().int().min(0).max(20),
  allowStudentCancel: z.boolean(),
});

export const policyInput = policyFields
  .refine((p) => p.windowEnd > p.windowStart, { message: "The demo window must end after it starts.", path: ["windowEnd"] })
  .refine((p) => !p.bookingOpensAt || p.bookingOpensAt < p.windowEnd, {
    message: "Booking must open before the demo window ends.",
    path: ["bookingOpensAt"],
  });

export const assignmentFields = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(5000).default(""),
  maxMarks: marks("Max marks"),
  criteria: z.array(criterionInput).max(30),
  policy: policyInput,
});

export const assignmentInput = assignmentFields.superRefine((a, ctx) => {
  const rubric = checkRubric(a.criteria, a.maxMarks);
  if (!rubric.ok) ctx.addIssue({ code: "custom", message: rubric.reason, path: ["criteria"] });
});

const httpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname);
  } catch {
    return false;
  }
};

export const venueInput = z.object({
  name: z.string().trim().min(1, "Venue name is required.").max(120),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || httpUrl(v), "Meeting link must be a web address starting with http:// or https://"),
});

export const requestInput = z.object({
  kind: z.enum(["BOOKING_CHANGE", "MARK_QUERY"]),
  message: z.string().trim().min(5, "Tell staff a bit more (at least a few words).").max(REASON_MAX_LENGTH),
});

/** A staff-granted exception for one student on one assignment. */
export const allowanceInput = z.object({
  extraChanges: z.coerce.number().int().min(0, "Extra changes can't be negative.").max(20),
  lateBooking: z.boolean(),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
});

/** A person's display name (invites, profile, admin), as the account services check it. */
export const PERSON_NAME_MAX_LENGTH = 120;
