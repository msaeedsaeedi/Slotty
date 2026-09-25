# Roadmap: usability & utility

Planned improvements, in build order. Each item has an ID so commits and tests can refer to it. When an item ships, mark it **Done** (with the commit) and update [user-journeys.md](user-journeys.md) and [business-rules.md](business-rules.md).

Priority: **P1** a user can bypass a rule, get stuck, or end up with wrong data · **P2** a real task is missing or awkward · **P3** polish.

Status: ✅ done · (blank) open.

## Phase 1: Rule hardening ✅

All BR items are done on branch `feature/usability-roadmap`. Tests: `tests/unit/booking-rules.test.ts`, `tests/integration/rules.test.ts`.

| ID | P | Problem today | Planned rule / change |
|---|---|---|---|
| BR-01 | P1 | **Cancel and rebook resets the reschedule budget.** `bookSlot` creates a fresh booking with `rescheduleCount = 0` (`services/bookings.ts`). | A single **change budget** per student per assignment. `changesUsed` = bookings for that assignment the student cancelled themselves (`CANCELLED` and `cancelledById = studentId`), which includes reschedules. Reschedule is allowed if `changesUsed < maxReschedules`. Rebooking after a self-cancel is allowed if `changesUsed ≤ maxReschedules`. Staff and slot cancellations never count. Show "X of N changes left" on both actions. The cancel confirmation spells out the consequence. Implement as a pure `changeBudget()` in `domain/booking-rules.ts`. |
| BR-02 | P1 | A student can cancel after the assignment is **closed**, then can't rebook. | Refuse the cancel: "Booking is closed — ask your TA." |
| BR-03 | P2 | Publishing says "now open" even when `bookingOpensAt` is in the future. Nobody is told when booking actually opens. | The message states the opening time. The worker sends "Booking is open" at `bookingOpensAt`. |
| BR-04 | P1 | Removing a student leaves their future bookings active. Removing a host leaves their slots orphaned. | Cancel the student's future bookings and notify them. Block removing a host until their slots are reassigned (OP-06). |
| BR-05 | P2 | An archived course still accepts every change. | Archived means read-only: `assertCourseWritable` in `access.ts`. |
| BR-06 | P2 | Attendance can be marked before the demo starts. | Only allowed from the slot's start time onward (Undo still works). |
| BR-07 | P1 | Policy and marks edits after bookings aren't checked: `maxMarks` can drop below saved totals, and changed rules aren't announced. | Block `maxMarks` below the highest saved total. Show an impact preview. State that capacity and duration changes only affect new slots. Notify booked students when the freeze or change rules change. |
| BR-08 | P3 | Staff cancel from the slot table always sends an empty reason. | Require a reason. |
| BR-09 | P1 | After a staff cancellation inside the freeze window, the student can't rebook. | Staff can place the student into a new slot (OP-01). The notification links to "request a new time" (OP-03). |
| BR-10 | P3 | A disabled user's bookings stay active. | Show them to the admin, with an option to release them. |
| BR-11 | P2 | Students added after publishing are never told about open assignments. | The roster import notifies "You have N demos to book". |
| BR-12 | P2 | Past demos stay "Pending" forever if nobody marks them. | Show a "N demos need attendance" nudge on Today and the course overview. |

## Phase 2: Supporting operations ✅

Done on `feature/usability-roadmap`. Tests: `tests/integration/operations.test.ts`, `tests/unit/ics.test.ts`.

| ID | P | Operation |
|---|---|---|
| OP-01 | P1 | Staff book or move a student into a slot (bypasses freeze and capacity, needs confirmation, audited). |
| OP-02 | P2 | Waitlist / "notify me when a slot frees up". |
| OP-03 | P1 | Student "request a change / I can't make it" inside the freeze window. Goes to a staff inbox. |
| OP-04 | P2 | Per-student exception: extra changes or a late booking. |
| OP-05 | P2 | Add to calendar: an `.ics` file per booking and a personal iCal feed URL. |
| OP-06 | P2 | Reassign a host's slots to another TA. |
| OP-07 | P2 | Account page: change name and password, notification preferences, sign out of other devices. |
| OP-08 | P2 | Deadline nudge to unbooked students (e.g. 48h before the window ends). |
| OP-09 | P3 | Auto-close booking at `windowEnd`. |
| OP-10 | P3 | Daily agenda email for TAs. |
| OP-11 | P3 | Edit one slot's capacity or venue. |
| OP-12 | P3 | Student mark query (regrade request) after release. |
| OP-13 | P3 | Bulk finalize in the review queue. |
| OP-14 | P3 | No-show follow-up: notify the student, and staff can "allow rebook". |
| OP-15 | P3 | Slot picker filters (day / TA / venue). Show the viewer's local time next to the course timezone. |
| OP-16 | P3 | Opening a notification marks it as read (today only "Mark all read" does). |

## Phase 3: Feedback & usability polish

| ID | Change |
|---|---|
| UX-01 | Replace `window.confirm` (`components/action-form.tsx`) with a dialog that states the consequence ("You'll have 0 changes left"). |
| UX-02 | Show deadlines as absolute times: "Changes lock Tue 14:00", "Booking opens Mon 09:00". |
| UX-03 | Every refusal names the next step (e.g. a "Request change" button instead of "Contact your TA"). |
| UX-04 | Dashboard and *My bookings* show the same details as the booking card: venue, meeting link, TA. |
| UX-05 | Accessibility: text labels on the colour-only progress bars, and a keyboard-friendly "Cancel slot" popover. |

## Phase 4: PWA (installable app, push, offline view)

Based on the local Next 16 guides: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and `offline-support.md`.

| ID | Item |
|---|---|
| PWA-01 | **Install.** `src/app/manifest.ts` (name, 192/512 + maskable icons, `start_url: /dashboard`, `display: standalone`). Add an "Add to Home Screen" hint for iOS that only shows when the app isn't installed yet. |
| PWA-02 | **Push.** A `PushSubscription` model (user, endpoint, keys, device). Subscribe and unsubscribe go through a service with an `Actor`. VAPID keys in env. `web-push` package. |
| PWA-03 | **Push through the outbox.** `notify()` also writes push rows in the same transaction. The worker sends them and deletes dead subscriptions (404/410). Service worker `public/sw.js` handles `push` and `notificationclick` (opens the link). |
| PWA-04 | **Ask at the right moment.** Offer push right after the first booking, never on page load. The opt-in lives on the account page (OP-07). |
| PWA-05 | **Offline view.** The service worker caches the app shell. The dashboard, *My bookings* and notifications load network-first with a cached fallback, plus an "Offline — last updated HH:mm" banner. Booking details (time, room, link, TA) are readable offline. |
| PWA-06 | **No queued changes offline.** Booking, cancel and reschedule buttons are disabled while offline, with an explanation. Replaying them later against changed slots would fail silently, so don't auto-retry these actions. |
| PWA-07 | **Privacy on shared computers.** Logout sends `Clear-Site-Data: "cache","storage"` and removes that device's push subscription. |

Caveats to keep in mind:
- Push reaches the phone even when the app is closed, but the device needs a connection. Nothing new can arrive while it's fully offline.
- iOS supports push only after "Add to Home Screen" (16.4+).
- Push needs HTTPS. Use `next dev --experimental-https` locally.

## Phase 5: Check with users

Run short task-based sessions with the seed accounts: book, reschedule, cancel then rebook, run a demo day, mark and submit, review. Record task success, errors and time taken. Turn what you find into new roadmap items.

## Open issues (to check manually)

- **E2E `tests/e2e/support.spec.ts` is marked `fixme`.** Everything works up to the staff move: request sent, staff move, request auto-resolved. The last check fails because once a request is answered, the "Need help with your booking?" panel is collapsed, so the "Handled" badge is hidden. Decide whether a recent staff reply should keep the panel open (better visibility), or have the test expand it. Then remove `fixme`.
- **E2E now runs on a production build** (`next build && next start`, see `playwright.config.ts`). Under `next dev`, Fast Refresh from on-demand compiling sometimes dropped the page refresh after an action in multi-browser tests. `/dev/mail` is enabled there through `ENABLE_DEV_MAIL=1`.
