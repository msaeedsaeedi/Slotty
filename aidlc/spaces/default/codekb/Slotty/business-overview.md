# Business Overview — Slotty

## Business Domain
Slotty schedules and evaluates university course demos, vivas and code reviews. It covers the whole lifecycle of one assignment's demos, **schedule → book → conduct → evaluate → record**, and replaces spreadsheets and chat threads. Human-written sources: `README.md`, `docs/chapters/03-roles-journeys.tex`, `docs/chapters/04-business-rules.tex`.

## Purpose
- Give students one place to see which assignments need a demo, book a slot within the course rules, and see their released marks.
- Let teaching assistants (TAs) publish availability that Slotty cuts into slots, run the demo day, and mark students against a rubric. A TA can run a course alone.
- Let instructors follow progress, review TA marks (finalize or return them) and export the results.
- Let admins moderate (disable accounts, open any course, read the audit log) without being needed for day-to-day use.

## Actors
| Actor | Course role | Main goals |
|---|---|---|
| Student | `STUDENT` | Book, reschedule or cancel a demo slot; join a waitlist; raise a booking-change or mark query; see marks |
| TA | `TA` | Set the demo policy and availability; run "Today"; mark attendance; score; submit |
| Instructor | `INSTRUCTOR` | Manage the course and roster; review submissions; export CSV |
| Admin | `User.isAdmin` | Moderation: users, courses, email queue, audit log. Treated as instructor in any course |

A person may be a TA in one course and a student in another, but never both instructor and TA (`src/domain/roles.ts`).

## Key Functionality
- **Courses and roster**: CSV roster import (Google Classroom exports too), sent as email invites; no join codes. Venues; archiving makes a course read-only.
- **Assignments and demo policy**: draft → published → closed; booking opens at a set time, freeze window, reschedule budget, capacity per slot, rubric criteria.
- **Scheduling**: availability blocks become slots (duration plus buffer, clipped to the demo window); staff can cancel slots, change venue, reassign the host or change capacity.
- **Booking**: book, reschedule, cancel within the change budget; staff can place students, grant allowances and allow a rebook after a no-show; waitlist alerts when a seat frees up.
- **Demo day**: timeline of now, next and later; attendance (completed or no-show).
- **Evaluation**: draft → submitted → finalized or returned; unlock and clear with a reason; marks are released directly when the course has no instructor.
- **Notifications**: in-app inbox, email and Web Push through a transactional outbox; reminders, nudges, daily agendas, booking-open announcements.
- **Calendar**: per-booking `.ics` download and a personal iCal feed URL.
- **PWA**: service worker (`public/sw.js`), offline page, generated icons.

## Business Constraints
- Budget is $50/month for the AWS production account (docs ch. 12, project rule DECIDED).
- Times are stored in UTC and shown in the course timezone; only `Asia/Karachi` is supported today (`src/lib/time.ts`).
- Moderation-relevant changes are audited (`AuditLog`).

## Current Intent Context
This workflow (`ci-lint-fix`, bugfix scope) is about PR 19 (`docs/system-documentation`) failing CI at `bun run lint`, plus the question of what to do next for the documentation. See `code-quality-assessment.md` for the finding and the documentation status.
