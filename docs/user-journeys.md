# User journeys

How each role uses Slotty from start to finish, with the screen, the service that runs, and what the user gets back. Update this file whenever a flow changes.

Roles are **per course** (`Enrollment.role`). A TA can be a student in another course (their home page then has separate *Teaching* and *Studying* sections), but an instructor is never a TA anywhere, nor a TA an instructor. Instructors usually don't take demos: they give the final check on marks. **Admin** is a separate, platform-wide role: an admin is never a member of any course.

Times show in the course timezone (Pakistan time for now) on each user's 12- or 24-hour clock (account page).

---

## Student

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| S1 | Gets invited | Email → `/invite/[token]` | `accounts.acceptInvite` | Staff import the class list, which sends an invite email valid for 14 days. The student sets a name and password, and the account becomes `ACTIVE`. If they were already active, they get a "Added to <course>" notification instead. |
| S2 | Signs in | `/login`, `/forgot-password` | `accounts.authenticate` | A clear message for a wrong password, a disabled account, or an invite not yet accepted. Password reset links last 2 hours. |
| S3 | Sees what to do | `/dashboard` (*Studying*) | `home.getHome` | Next demo first (time, room, TA, *Join online*, *Add to calendar*), then a to-do list: book a demo (urgent when the window closes within 3 days), booking opens soon, a missed demo, marks released. Then their courses. |
| S4 | Opens a course | `/courses/[id]` | `listAssignments` | Published and closed assignments with a status: *Not booked*, *Booked*, *Closed*, *Marked x/y*. |
| S5 | Books a slot | `/courses/[id]/assignments/[aid]` | `bookings.bookSlot` | Slots grouped by day in the course timezone. Full slots are hidden and counted. A disabled **Book** button shows why it's disabled. Success: a toast plus a `booking.confirmed` notification and email. |
| S6 | Gets reminders | Email + bell | `reminders.queueDueReminders` (worker) | 24h and 1h before the slot. Skipped if the student booked inside that window. |
| S7 | Reschedules | Same page, `?reschedule=1` | `bookings.rescheduleBooking` | Picks a new slot and confirms. The old booking is cancelled and a new one created. Uses one change. Shows "N of M changes left" and the exact time changes lock. |
| S8 | Cancels | Same page | `bookings.cancelBooking` | The confirmation states the cost ("This uses 1 of your 2 changes…"). Only allowed while booking is open, `allowStudentCancel` is on, and the booking is outside the freeze window. With no changes left, the student can't rebook themselves. |
| S9 | Handles staff changes | Bell + email | — | `slot.cancelled`, `booking.cancelled_by_staff` (always with a reason), `slot.venue_changed`, `assignment.rules_changed`. Rebooking after a staff cancellation doesn't use a change. |
| S10 | Attends the demo | — | — | The booking card shows venue, meeting link and TA. |
| S11 | Sees results | Assignment page | `evaluations.getMyResult` | Only **FINALIZED** marks are shown: total, rubric rows, feedback. Private notes are never shown. `evaluation.finalized` notification. |
| S12b | Gets help when stuck | Assignment page | `requests.createRequest`, `waitlist.joinWaitlist` | "Need a different time? Ask course staff" opens automatically when self-service is blocked (freeze window, no changes left, closed, nothing free). With every slot full, "Notify me when a slot frees up". After marks are released, "Question about your marks?". |
| S12c | Calendar & account | Booking card, `/account` | `calendar.bookingCalendarOptions`, `accounts.*` | *Add to calendar* on a booking opens Google Calendar or Outlook with the demo filled in, or downloads an `.ics` (Apple and others). Automatic calendar sync is shown as *coming soon*. The account page shows only what applies to the role: clock (12/24 h), reminder emails, device notifications, password, devices. |
| S12d | Installs the app / goes offline | Dashboard hint, account page | PWA (`components/pwa.tsx`, `public/sw.js`) | Installs Slotty to the home screen. Turns on notifications for the device (asked after the first booking, or from the account page). Offline, recently opened pages still show the demo time, room, link and TA, with a banner. Changes wait until the device reconnects. |
| S12 | Reviews history | `/bookings`, `/notifications` | `listMyBookings`, `inbox` | Every booking, including cancelled and past ones. The notification feed has "Mark all read". |

## TA (can run a course alone)

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| T0 | Sees what to do | `/dashboard` (*Teaching*) | `home.getHome`, `getDemoDay` | Today's demos, then a to-do list across their courses: past demos missing attendance, marks to finish or returned for changes, student requests, submissions to review (instructors), assignments to add slots to or open. Each item goes straight to the place to do it. |
| T1 | Creates a course | `/courses/new` | `courses.createCourse` | Code, title, term; timezone is Pakistan time for now. The creator picks their role: TA or instructor. (Admins create courses from the console instead.) |
| T2 | Adds people | `…/manage/roster` | `addMember`, `previewRoster` → `importRoster` | *Add someone*: one email, name (for new people), role, section. *Import a class list*: the columns are shown with a template to download; upload a CSV (Google Classroom exports work), paste cells copied from a spreadsheet, or paste one email per line. A preview shows who is new, added, changing role or already there, and which lines are skipped (e.g. an admin's email). Only instructors can add instructors. Students added late are told which demos are open. Removing a student releases their upcoming bookings. Removing a host is blocked while they host upcoming slots. |
| T3 | Adds venues | `…/manage/venues` | `createVenue`, `deleteVenue` | Name, location, meeting link. Creating a Google Meet link automatically is shown as *coming soon*. A venue can't be deleted while live slots use it. |
| T4 | Creates an assignment | `…/manage/assignments/new` | `assignments.createAssignment` | *What*, *Marking* (max marks and rubric rows, whose total must be ≤ max marks), *When* (demo window, slot length, break, students per slot), and *Booking rules* folded behind a one-line summary. Every field is checked as you type with the same limits as the server; nothing typed is lost when a save fails. A side summary says what the settings mean and what comes next. |
| T5 | Adds slots | Assignment → *Slots* tab, *Add slots* | `slots.addAvailability` | A box at the top says how many slots are still needed: students still to book against free places in upcoming slots, and whether the days picked cover them. Pick one or more days (each shows how many slots the host already has), the hours, and a venue; a preview lists the slots each day will get and how many are skipped because the host is already busy. Slots can be added in rounds as availability is known. TAs add slots for themselves; instructors add them for any staff member (a TA by default). Slots stay hidden until booking opens; once it's open, students who haven't booked are told about new times. |
| T6 | Opens booking | *Booking* panel on the assignment | `publishAssignment` | The status says exactly where booking stands: *Not open yet*, *Opens Fri 9 Oct, 9:00 AM* (open but starting later), *Booking open*, *Booking closed*; students see the same on their course page. Opening needs slots first, because every student is notified. Students are notified now, or told the opening time (and told again, as a *new booking time*, if it moves). |
| T7 | Manages slots | *Slots* tab | `changeVenue`, `reassignHost`, `deleteUnbookedSlots`, `updateSlotCapacity`, `cancelSlot`, `staffCancelBooking` | A table with column headers (time, host, venue, students), grouped by day; days fold away (past days start folded) and the table scrolls on its own. Selecting slots brings up a floating bar: picking a venue or host applies at once and says how many students will be told; delete asks first. Each row's menu changes students per slot or cancels the slot, in dialogs that close with Esc or a click outside. A reason is required whenever a student is affected. Only instructors can hand slots to another host. |
| T7b | Edits the assignment | *Edit settings* (next to the settings summary) | `updateAssignment`, `deleteAssignment` | A notice explains the impact on booked students. The edit is blocked if max marks drop below awarded marks or the window no longer covers booked slots. Booked students are told about rule changes. Deleting (only before anyone has booked) is at the bottom of this page. |
| T7c | Handles student requests | `…/manage/requests` (badge in nav) | `requests.resolveRequest` | Open the student to move them, clear a no-show, or grant an exception, then mark the request handled or declined with a reply. |
| T7d | Fixes one student's booking or marks | Student page (`…/evaluate/[studentId]`) | `saveDraft`, `clearMarks`, `staffPlaceStudent`, `allowRebookAfterNoShow`, `setAllowance` | Marks can be entered right here (same editor as the marking sheet, with its own *Submit for review* / *Release marks*). *Clear marks* removes draft marks, with a reason. The *Booking* card places or moves them into any upcoming slot, even inside the freeze window, and optionally over capacity, unless marks are already recorded. None of it uses the student's changes. |
| T8 | Runs the day | `/today` (all courses; *Demo day* in the header), or a course's *Today* tab | `demo-day.getDemoDay`, `markAttendance` | Opens on who's **now** or **up next**. The day's demos are grouped by assignment, each group linking to its course and assignment. Every booked demo has a coloured status in words (*Booked*, *In progress*, *Attendance missing*, *To mark*, *Marked*, *No-show*); open slots are one quiet line. The week strip colours each day by its most pressing state, with a legend (attendance missing, marks to finish, demos booked, all done) and pages a week at a time. *Present → mark* records attendance and opens the marking sheet. *Still to finish* lists earlier days without attendance and, per assignment, demos still to mark. Refreshes itself every 30 s. "My demos" by default; "Everyone" shows all hosts. |
| T9 | Marks | Marking sheet (`…/assignments/[aid]/mark`) or the student page | `getMarkingSheet`, `saveDraft`, `sheetAttendanceAction` | One student at a time with *Back*/*Next* (also Alt+←/→, Ctrl+Enter), and the day's demos as a compact sheet underneath; clicking a row opens that student. A thin segmented bar shows every demo's state and fills the current one as its time runs. Rubric scores sit in one row of cells (Enter moves to the next), total is live, out-of-range values are flagged and not saved. Everything autosaves as a draft. Entering a mark records the student as present; *No-show* asks first. *Follow the clock* moves to the next demo when time is up. Marking before the demo has started, or a student who never booked, asks for a reason first, which is kept and audited. |
| T10 | Submits | Marking sheet (once the day's demos are over) or *Students & marks* tab | `submitEvaluations` | No submit button while demos are still running. Complete drafts can then be submitted together. **With an instructor:** goes to `SUBMITTED` for review. **Without one:** goes straight to `FINALIZED` and the student sees it. |
| T11 | Fixes a returned evaluation | Marking sheet | `saveDraft`, `submitEvaluations` | `evaluation.returned` notification includes the instructor's comment, which the sheet shows above the scores. |
| T12 | Closes / archives | *Booking* panel, `…/manage/settings` | `closeAssignment`, `setCourseArchived` | Close stops new bookings and changes, but existing bookings stay. Archive hides the course from dashboards and makes it read-only until restored. |

## Instructor

Everything a TA can do, plus:

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| I1 | Watches progress | `…/manage` | `reports.courseProgress` | One card per assignment: its booking state, the next thing to do in words (e.g. "3 past demos need attendance", "5 demos to mark"), and two labelled bars, *Booked* and *Marked*, each with "x of y". |
| I2 | Gives the final check | *Final check* task on the home page, `…/manage/review` | `reviewEvaluation`, `finalizeMany` | **Finalize** releases marks to the student, whose email lists the total, every rubric row and the feedback. **Return** needs a comment, which goes to the TA. Marks an instructor submits themselves are final straight away. |
| I3 | Corrects a released mark | Student page | `unlockEvaluation`, `saveDraft`, `submitEvaluations` | *Unlock to edit* needs a reason. The marks reopen on the same page; *Release corrected marks* finalizes them again, and the student gets *Marks updated* with the new total and the old one. |
| I4 | Exports | *Students & marks* tab → *Export CSV* | `reports.exportAssignmentCsv` | One row per student: slot, TA, venue, attendance, rubric scores, total, status. Formula-injection safe. |

## Admin

Admins run the platform from the web console. They are never students or staff of a course (enrolling an admin is refused everywhere), don't book anything, and don't need offline access. They always land on `/admin`, and the header shows only *Administration*. Their account page has just name, clock, password and devices.

| # | Step | Screen | Service | What happens / feedback |
|---|---|---|---|---|
| A0 | Checks what needs attention | `/admin` (Overview) | `adminOverview` | *Needs attention* lists only real problems, each with a link to fix it: failed emails, emails stuck in the queue for more than 15 minutes (the worker is down), active courses with no instructor or TA, and invites not accepted after 7 days. Below that, platform numbers (users, activation, courses, demos in the next 7 days, email) and recent activity. |
| A1 | Finds or invites a person | `/admin/users` | `adminListUsers`, `adminInviteUser` | *Invite someone*: email, name, and optionally admin; they get an invite and can then create a course or be added to one. Search plus filters: active, awaiting activation, invite older than 7 days, disabled, admins, not in any course. |
| A1b | Helps a person | `/admin/users/[id]` | `adminGetUser`, `adminSendAccessEmail`, `adminUpdateUser`, `adminSetUserDisabled`, `adminSetAdmin` | Account status, last sign-in or invite age, courses and roles, upcoming demos, history (done to them and by them). *Resend invite* or *Send password reset*. Fix the name, or a mistyped email while the account is still invited (a new invite goes to the corrected address). Disable (ends sessions and can release upcoming bookings) or enable. Make or remove admin; someone who is in a course can't be made admin until they're removed from it. Admins can't disable themselves or remove their own admin rights. |
| A2 | Keeps courses staffed | `/admin/courses` | `adminCreateCourse`, `adminListCourses`, `adminAssignStaff`, `adminSetCourseArchived` | *New course*: code, title, term and the instructor or TA who runs it (invited if new). Filters: active, no staff, archived. Each course shows its staff, students, open assignments and upcoming demos. *Assign staff* adds an instructor or TA by email (never an admin): new people get an invite, existing ones a notification. Archive or restore. Opening a course shows its manage pages with full rights ("Viewing as admin"). |
| A3 | Fixes email delivery | `/admin/email` (badge = failed count) | `adminEmailQueue`, `adminRetryEmails` | Failed, waiting and sent emails with the SMTP error. Retry one, or all after fixing the cause. |
| A4 | Audits | `/admin/audit` | `adminAuditLog` | Readable sentences ("Ada Admin assigned staff to MATH 210") with links to users and courses, filtered by area or person, 100 per page, with before/after details on demand. |

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
