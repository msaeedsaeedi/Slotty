# User journeys

How each role uses Slotty from start to finish, with the screen, the service that runs, and what the user gets back. Update this file whenever a flow changes.

Roles are **per course** (`Enrollment.role`). One person can be a student in one course and a TA in another. Admins are a global flag.

---

## Student

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| S1 | Gets invited | Email → `/invite/[token]` | `accounts.acceptInvite` | Staff import the class list, which sends an invite email valid for 14 days. The student sets a name and password, and the account becomes `ACTIVE`. If they were already active, they get a "Added to <course>" notification instead. |
| S2 | Signs in | `/login`, `/forgot-password` | `accounts.authenticate` | A clear message for a wrong password, a disabled account, or an invite not yet accepted. Password reset links last 2 hours. |
| S3 | Sees what to do | `/dashboard` | `listMyCourses`, `listMyBookings` | Upcoming demos (time, room, TA, "Join online", "Add to calendar") and course cards. |
| S4 | Opens a course | `/courses/[id]` | `listAssignments` | Published and closed assignments with a status: *Not booked*, *Booked*, *Closed*, *Marked x/y*. |
| S5 | Books a slot | `/courses/[id]/assignments/[aid]` | `bookings.bookSlot` | Slots grouped by day in the course timezone. Full slots are hidden and counted. A disabled **Book** button shows why it's disabled. Success: a toast plus a `booking.confirmed` notification and email. |
| S6 | Gets reminders | Email + bell | `reminders.queueDueReminders` (worker) | 24h and 1h before the slot. Skipped if the student booked inside that window. |
| S7 | Reschedules | Same page, `?reschedule=1` | `bookings.rescheduleBooking` | Picks a new slot and confirms. The old booking is cancelled and a new one created. Uses one change. Shows "N of M changes left" and the exact time changes lock. |
| S8 | Cancels | Same page | `bookings.cancelBooking` | The confirmation states the cost ("This uses 1 of your 2 changes…"). Only allowed while booking is open, `allowStudentCancel` is on, and the booking is outside the freeze window. With no changes left, the student can't rebook themselves. |
| S9 | Handles staff changes | Bell + email | — | `slot.cancelled`, `booking.cancelled_by_staff` (always with a reason), `slot.venue_changed`, `assignment.rules_changed`. Rebooking after a staff cancellation doesn't use a change. |
| S10 | Attends the demo | — | — | The booking card shows venue, meeting link and TA. |
| S11 | Sees results | Assignment page | `evaluations.getMyResult` | Only **FINALIZED** marks are shown: total, rubric rows, feedback. Private notes are never shown. `evaluation.finalized` notification. |
| S12b | Gets help when stuck | Assignment page | `requests.createRequest`, `waitlist.joinWaitlist` | "Need a different time? Ask course staff" opens automatically when self-service is blocked (freeze window, no changes left, closed, nothing free). With every slot full, "Notify me when a slot frees up". After marks are released, "Question about your marks?". |
| S12c | Calendar & account | Booking card, `/account` | `calendar.*`, `accounts.*` | "Add to calendar" (.ics) or subscribe to the personal feed. Change name or password, email preferences, sign out other devices. |
| S12d | Installs the app / goes offline | Dashboard hint, account page | PWA (`components/pwa.tsx`, `public/sw.js`) | Installs Slotty to the home screen. Turns on notifications for the device (asked after the first booking, or from the account page). Offline, recently opened pages still show the demo time, room, link and TA, with a banner. Changes wait until the device reconnects. |
| S12 | Reviews history | `/bookings`, `/notifications` | `listMyBookings`, `inbox` | Every booking, including cancelled and past ones. The notification feed has "Mark all read". |

## TA (can run a course alone)

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| T1 | Creates a course | `/courses/new` | `courses.createCourse` | Code, title, term, timezone. The creator picks their role: TA or instructor. |
| T2 | Imports the roster | `…/manage/roster` | `previewRoster` → `importRoster` | CSV (Google Classroom exports work). A preview shows new / enrolled / role change / unchanged rows. Only instructors can add instructors. Students added late are told which demos are open. Removing a student releases their upcoming bookings. Removing a host is blocked while they host upcoming slots. |
| T3 | Adds venues | `…/manage/venues` | `createVenue`, `deleteVenue` | Name, location, meeting URL. A venue can't be deleted while live slots use it. |
| T4 | Creates an assignment | `…/manage/assignments/new` | `assignments.createAssignment` | Title, max marks, rubric (its total must be ≤ max marks), demo policy (see [rules](business-rules.md#demo-policy)). |
| T5 | Adds availability | Assignment → *Slots* tab | `slots.addAvailability` | Host, venue, date, from/to. Slotty splits the time into slots inside the demo window. Overlaps with the same host's slots are rejected. The new slots are drafts until the assignment is published. |
| T6 | Publishes | Assignment header | `publishAssignment` | Needs at least one slot. Draft slots go live. Students are notified now, or told the opening time and notified again by the worker when booking opens. |
| T7 | Manages slots | *Slots* tab | `changeVenue`, `deleteUnbookedSlots`, `cancelSlot`, `staffCancelBooking` | Bulk move venue, delete unbooked slots, cancel a slot or one student's booking. A reason is required whenever a student is affected. |
| T7b | Edits the assignment | `…/edit` | `updateAssignment` | A notice explains the impact on booked students. The edit is blocked if max marks drop below awarded marks or the window no longer covers booked slots. Booked students are told about rule changes. |
| T7c | Handles student requests | `…/manage/requests` (badge in nav) | `requests.resolveRequest` | Open the student to move them, clear a no-show, or grant an exception, then mark the request handled or declined with a reply. |
| T7d | Fixes one student's booking | Student page (`…/evaluate/[studentId]`), *Booking* card | `staffPlaceStudent`, `allowRebookAfterNoShow`, `setAllowance` | Place or move into any upcoming slot, even inside the freeze window, and optionally over capacity. None of it uses the student's changes. |
| T8 | Runs the day | `/today` (all courses; *Demo day* in the header and a *Today* card on the dashboard), or a course's *Today* tab | `demo-day.getDemoDay`, `markAttendance` | Opens on who's **now** (time left) or **up next** (starts in…), plus a *Coming up* list. The day is a timeline with open slots and free gaps; a 7-day strip shows how many demos each day has. *Completed → mark* records attendance and opens marking, and submitting returns here. *No-show* asks first. Focus moves to the next student once attendance is recorded. The page refreshes itself every 30 s. *To finish* lists earlier days without attendance, completed demos without submitted marks, and open student requests. "My demos" by default; "Everyone" shows all hosts. |
| T9 | Marks | `…/evaluate/[studentId]` | `getOrCreateEvaluation`, `saveEvaluation` | Rubric scores with comments, feedback, private notes, and an optional total override (needs a note). |
| T10 | Submits | Evaluate page or *Students & marks* tab (bulk) | `submitEvaluations` | Every rubric row has to be scored. **With an instructor:** goes to `SUBMITTED` for review. **Without one:** goes straight to `FINALIZED` and the student sees it. |
| T11 | Fixes a returned evaluation | Evaluate page | `saveEvaluation`, `submitEvaluations` | `evaluation.returned` notification includes the instructor's comment. |
| T12 | Closes / archives | Assignment header, `…/manage/settings` | `closeAssignment`, `setCourseArchived` | Close stops new bookings and changes, but existing bookings stay. Archive hides the course from dashboards and makes it read-only until restored. |

## Instructor

Everything a TA can do, plus:

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| I1 | Watches progress | `…/manage` | `reports.courseProgress` | Per assignment: unbooked / booked / done / no-show / review / final, plus a warning for past demos missing attendance. |
| I2 | Reviews marks | `…/manage/review` | `reviewEvaluation`, `finalizeMany` | **Finalize** releases marks to the student. **Return** needs a comment, which goes to the TA. |
| I3 | Corrects a released mark | Evaluate page | `unlockEvaluation` | Needs a reason. The evaluation goes back to `RETURNED`. In a course without an instructor, the TA can unlock. |
| I4 | Exports | Assignment → *Export CSV* | `reports.exportAssignmentCsv` | One row per student: slot, TA, venue, attendance, rubric scores, total, status. Formula-injection safe. |

## Admin

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| A1 | Manages users | `/admin/users` | `adminListUsers`, `adminSetUserDisabled`, `adminSetAdmin` | Search. Shows each user's upcoming demos. Disabling someone ends their sessions and can release their upcoming bookings. An admin can't disable themselves or remove their own admin rights. |
| A2 | Oversees courses | `/admin/courses` | `adminListCourses` | Can open any course as an instructor (shown as "Viewing as admin"). |
| A3 | Audits | `/admin/audit` | `adminAuditLog` | The latest 200 moderation-relevant changes (who, what, before/after). |

---

## End-to-end lifecycle (one assignment)

```
TA: create course → import roster → venues → assignment + policy + rubric
  → add availability (draft slots) → publish ──► students notified
Students: book / reschedule / cancel (policy rules) ──► confirmations + 24h/1h reminders
Demo day: /today (now / next) → Completed → mark → submit → back to /today
  ├─ course has instructor → SUBMITTED → instructor finalizes / returns
  └─ no instructor         → FINALIZED directly
Student sees marks → staff export CSV → close assignment → archive course
```

Planned changes to these flows are listed in [roadmap.md](roadmap.md).
