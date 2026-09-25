# Business rules & supporting details

The rules Slotty enforces today and where each one lives. Pure rules go in `src/domain/*` and return a `RuleResult` whose message is shown to the user. Services enforce them with `assertRule`. When you change a rule, update this file, the domain function, and its unit test together.

## Demo policy

One `DemoPolicy` per assignment (`prisma/schema.prisma`). Staff set it on the assignment form.

| Field | Default | Meaning |
|---|---|---|
| `windowStart` / `windowEnd` | — | Demos can only happen inside this window. Slots are clipped to it. |
| `slotDurationMin` | — | Length of each slot (5–480). |
| `bufferMin` | 0 | Break between generated slots. |
| `capacityPerSlot` | 1 | Students per slot (group demos if > 1). Copied onto each slot when it's created. |
| `bookingOpensAt` | none | Students can't book before this time. |
| `freezeHours` | 12 | No booking, cancelling or rescheduling within this many hours of the slot. |
| `maxReschedules` | 2 | **Changes** allowed per student per assignment. Reschedules and self-cancellations both count (see [change budget](#change-budget)). |
| `allowStudentCancel` | true | Whether students can cancel on their own. |
| `openAnnouncedAt` | — | Internal: when students were told booking is open. The worker announces at `bookingOpensAt` if it's in the future. |

## Booking rules (`src/domain/booking-rules.ts`)

| Rule | Enforced in | User message |
|---|---|---|
| Assignment must be `PUBLISHED` to book, reschedule or cancel (or `CLOSED` with a late-booking allowance) | `canBookSlot`, `canCancelBooking` | "This assignment is not open for booking." / "Booking is closed, so you can't cancel here. Ask your TA if you can't attend." |
| Slot must be `PUBLISHED` | `canBookSlot` | "This slot is not available." |
| Not before `bookingOpensAt` (unless the student has a late-booking allowance) | `canBookSlot` | "Booking has not opened yet." |
| Freeze window | `isFrozen` | "Changes are locked Nh before the slot starts." |
| Capacity | `canBookSlot` + row lock (`SELECT … FOR UPDATE`) in `bookings.lockSlots` | "This slot is full." |
| One active booking per student per assignment | `bookSlot` check + partial unique index `booking_one_active_per_student` | "You already have a booking for this assignment — reschedule it instead." |
| No overlapping demos across courses | `bookings.assertNoTimeClash` | "You already have another demo booked at that time." |
| Change budget, reschedule | `canReschedule` | "You have used all N changes." |
| Change budget, rebook after a self-cancel | `canBookSlot` (`budget`) | "You've used all your changes for this assignment, so you can't book again yourself. Ask your TA for a slot." |
| Student cancel allowed | `canCancelBooking` | "Cancellations are not allowed for this assignment. Ask your TA if you can't attend." |
| Staff can cancel any upcoming booking, ignoring the freeze, but must give a reason | `staffCancelBooking` | "Give a reason — it's sent to the student." |
| Attendance only once the demo has started (resetting to pending is always allowed) | `canMarkAttendance` | "You can record attendance once the demo has started." |

**Active booking** = `BOOKED`, `COMPLETED` or `NO_SHOW` (`ACTIVE_BOOKING` in `services/slots.ts`). `CANCELLED` rows are kept as history.

**Reschedule** = the old booking is cancelled (by the student) and a new one is created in one transaction.

### Change budget

One budget per student per assignment (`changeBudget` in `booking-rules.ts`, loaded by `bookings.loadChangeState`):

- `allowed` = `maxReschedules` + the student's `BookingAllowance.extraChanges`.
- `used` = the number of this student's bookings for the assignment with `status = CANCELLED` **and** `cancelledById = student`. That covers self-cancellations and the old half of every reschedule.
- A reschedule needs `left > 0`. Cancelling is allowed while `allowStudentCancel` is on, but it spends a change. Rebooking after that is allowed while `used ≤ allowed`.
- Staff cancellations, slot cancellations and staff moves never count.
- The cancel confirmation says exactly what cancelling costs (`cancelConsequence`).

Example with `maxReschedules = 1`: book A → cancel (1/1 used) → book B ✔ → reschedule ✘ → cancel (2 used) → book again ✘.

### Allowances (`BookingAllowance`)

Staff can grant one student an exception on one assignment:
- `extraChanges`: more changes on top of the policy.
- `lateBooking`: book, reschedule or cancel after booking has closed or before it opens.

The freeze window, capacity and draft slots still apply.

## Staff tools & student requests

| Operation | Service | Rule |
|---|---|---|
| Place or move a student | `bookings.staffPlaceStudent` | Ignores the freeze window and booking dates. Over capacity only when "allow over capacity" is ticked. Refused for completed demos, past or cancelled slots, and time clashes. The old booking is cancelled by staff, so no change is used. Answers the student's open booking request. |
| Let a no-show book again | `bookings.allowRebookAfterNoShow` | Only `NO_SHOW` bookings whose evaluation isn't submitted. No change is used. |
| Exception (`BookingAllowance`) | `bookings.setAllowance` | 0–20 extra changes and/or late booking. Setting both to zero removes it. The student is notified. |
| Waitlist | `waitlist.joinWaitlist`, `notifyWaitlist` | Only while the assignment is open and the student has no booking. When a seat frees up (cancel, reschedule, staff cancel or move, more capacity, new published slots), every waiting student is notified, at most once per 30 minutes. First to book gets it. The entry is removed when they book. |
| Student request | `requests.createRequest`, `resolveRequest` | One open request per kind (`BOOKING_CHANGE`, `MARK_QUERY`) per assignment. Mark queries only after marks are released. Goes to the student's host and the instructors (all staff if neither). Declining needs a reply. |
| Change host | `slots.reassignHost` | The new host must be course staff and have no overlapping slot. Booked students are told. |
| Slot capacity | `slots.updateSlotCapacity` | 1–100, never below the students already booked. More capacity alerts the waitlist. |
| Bulk finalize | `evaluations.finalizeMany` | Instructor only. Same as finalizing each one. |

## Automations (worker, `services/automations.ts`)

Each job records what it did, so running it twice sends nothing twice.

| Job | When | What |
|---|---|---|
| `announceOpenedBookings` | `bookingOpensAt` has passed | "Book your demo" to students without a booking |
| `nudgeUnbookedStudents` | 48h before `windowEnd` (once) | "Last chance to book" to unbooked students |
| `closeEndedAssignments` | `windowEnd` has passed | Assignment → `CLOSED`, waitlist cleared, audited with no actor |
| `sendDailyAgendas` | 06:00–11:00 course time, once per local day | Email-only list of today's demos for each host (unless they opted out) |
| `queueDueReminders` | 24h / 1h before | Reminder to the student (unless they opted out of reminder emails) |

## Calendar

- `/bookings/<id>/calendar`: one booking as an `.ics` file (the student's own, signed in).
- `/calendar/<token>`: personal feed of the user's own demos plus demos they host, including the last 30 days. The token is the credential. Replacing it on the account page breaks old links.

## PWA

| Piece | Where | Behaviour |
|---|---|---|
| Install | `src/app/manifest.ts`, `src/app/icons/[kind]/route.tsx`, `InstallHint` (dashboard) | Standalone app starting at `/dashboard`. Icons are generated (192, 512, maskable, badge). The dashboard offers "Install", or Add to Home Screen instructions on iOS. The hint can be dismissed and stays dismissed. |
| Service worker | `public/sw.js`, registered by `ServiceWorkerRegistrar` in production (or with `NEXT_PUBLIC_ENABLE_SW=1`) | Build assets are cache-first. Dashboard, bookings, notifications, course and assignment pages are network-first with the last good copy used offline. Anything else offline shows `/offline`. Only GETs are cached; Server Actions and RSC fetches never are. |
| Offline mode | `OfflineBanner`, `SubmitButton` | A banner says the page is the copy saved at a given time. Every submit button is disabled while offline. **Changes are never queued**: replaying a booking later could hit a slot that has since changed. |
| Push | `PushSubscription` (tied to the login `Session`), `PushMessage` outbox, `server/push.ts` (worker) | Every in-app notification is also queued as a push for the user's devices, in the same transaction. The worker delivers pushes, drops ones older than 6h, and deletes subscriptions the push service reports gone (404/410). Opt-in is on the account page, or a prompt after booking. The permission request is never shown on page load. |
| Privacy | `/logout` route, `ClearSavedPages` (login page) | Signing out sends `Clear-Site-Data: "cache", "storage"` and deletes the session, which removes that device's push subscription. The sign-in page also clears saved pages. |

Limits: push arrives even when the app is closed, but the device needs a connection. iOS supports push only after Add to Home Screen (16.4+). Push and service workers need HTTPS (localhost is exempt).

## Scheduling rules (`src/domain/slots.ts`, `services/slots.ts`)

- An availability block is split into `slotDurationMin` slots with `bufferMin` gaps and clipped to the demo window. A leftover shorter than one slot is dropped.
- A host can't have overlapping non-cancelled slots in **any** assignment.
- The host must be a TA or instructor of the course, and the venue must belong to the course.
- Slots added before publish are `DRAFT`. Slots added after publish go live straight away.
- Only slots with no bookings at all can be deleted. Cancelling a slot releases its bookings and notifies the students.
- A venue can't be deleted while active slots use it.

## Assignment rules (`services/assignments.ts`)

- Rubric points must add up to ≤ `maxMarks`. The rubric can't change once any score has been saved.
- `maxMarks` can't go below the highest total already given.
- The demo window can't be changed so that it no longer covers booked slots. Unbooked slots left outside the window are reported so staff can delete them.
- Slot length, break and capacity only apply to slots added later.
- Changing the freeze window, the number of changes allowed, or `allowStudentCancel` notifies students with a booking (`assignment.rules_changed`).
- Publishing needs at least one non-cancelled slot. Reopening a closed assignment uses the same action. If `bookingOpensAt` is in the future, students are told the opening time (`assignment.opens_soon`), and the worker sends "Book your demo" when it arrives.
- Closing stops bookings and changes. Existing bookings and marking carry on.
- An assignment with any booking can't be deleted. Close it instead.

## Evaluation states (`src/domain/evaluation.ts`)

```
DRAFT ──submit──► SUBMITTED ──finalize──► FINALIZED ──unlock──► RETURNED
  ▲                   │                                            │
  └──── (save) ◄──────┴──return (comment required)──► RETURNED ────┘ submit again
```

- `submit` with no instructor in the course → `FINALIZED` directly.
- Only `DRAFT` and `RETURNED` can be edited. Every rubric row must be scored, and the total must be between 0 and `maxMarks`.
- A total override needs a note. Attendance locks once the evaluation is `SUBMITTED` or `FINALIZED`.
- Only instructors review. Unlocking needs a reason (in a course without an instructor, the TA can unlock).
- Students see `FINALIZED` results only, never `privateNotes`.

## Access (`services/access.ts`)

- Every service takes an `Actor` and checks the role itself: `assertCourseRole`, `assertStaff`, `assertAdmin`.
- Admins count as instructors in any course (for moderation).
- Only instructors can add or remove instructors. Nobody can remove themselves or demote themselves through a CSV import.
- **Archived courses are read-only.** Mutations pass `{ write: true }` to `assertCourseRole` / `assertStaff` / `assertAssignmentRole`, or call `assertCourseWritable`. Only restoring the course is allowed.
- Removing a student cancels their upcoming bookings and notifies them. Removing staff is refused while they host upcoming slots.
- Admins disabling an account can also release that user's upcoming bookings.

## Accounts

The account page (`/account`) covers name, password (checks the current one and signs out other devices), email preferences (`emailReminders`, `emailAgenda`), the calendar link, and "sign out other devices". Confirmation, change and marks emails can't be turned off.

| Item | Value |
|---|---|
| Invite link | 14 days. Re-inviting invalidates older links. |
| Password reset link | 2 hours. Resetting ends every session. |
| Session | 30 days, stored in the DB. Disabled users are signed out. |
| Unknown email on reset | Silent success, so nobody can probe which emails exist. |

## Notifications (`services/notify.ts`)

Each notification creates an in-app entry and an email (outbox). Both are written in the **same transaction** as the change. The worker (`bun run worker`) sends emails and queues reminders.

| Type | Sent to | When |
|---|---|---|
| `course.enrolled` | existing user | Added to a course (new users get an invite email instead). Students are also told which demos are already open. |
| `course.removed` | student | Removed from a course while holding upcoming bookings |
| `assignment.opens_soon` | all students | Published with a future `bookingOpensAt` |
| `assignment.published` | students without a booking | Booking is open: on publish or reopen, or by the worker at `bookingOpensAt` |
| `assignment.rules_changed` | booked students | Freeze window, changes allowed or cancel permission changed |
| `booking.confirmed` | student | Booked |
| `booking.rescheduled` | student | Rescheduled |
| `booking.cancelled` | student | Student cancelled |
| `booking.cancelled_by_staff` | student | Staff cancelled their booking |
| `slot.cancelled` | booked students | Staff cancelled the slot |
| `slot.venue_changed` | booked students | Venue changed |
| `booking.reminder` | student | 24h and 1h before (worker) |
| `booking.no_show` | student | Marked as no-show |
| `booking.placed_by_staff` | student | Staff booked or moved them |
| `booking.rebook_allowed` | student | Staff cleared a no-show |
| `booking.allowance` | student | Exception granted |
| `waitlist.slot_available` | waiting students | A seat freed up |
| `slot.host_changed` | booked students | Slot handed to another host |
| `request.created` | host + instructors | Student sent a request |
| `request.answered` | student | Staff handled or declined it |
| `assignment.book_soon` | unbooked students | 48h before the demo window ends |
| `agenda.daily` | host (email only) | Morning list of today's demos |
| `evaluation.returned` | evaluator (TA) | Instructor returned an evaluation |
| `evaluation.finalized` | student | Marks released |

## Time

Times are stored in UTC. They're shown and entered in the **course timezone** (`lib/time.ts`: `fmt`, `fmtRange`, `fromLocalInput`).

## Audit

Moderation-relevant changes go through `audit(tx, actor, …)`: courses, roster, assignments, availability, slot cancellation and venue changes, attendance, staff cancellations, evaluation transitions, and admin actions.
