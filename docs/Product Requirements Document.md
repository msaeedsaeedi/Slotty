# DemoDesk Product Requirements Document
**Version:** 1.0  
**Status:** Draft  
**Date:** 28 April 2026

**Figma File** [Link](https://www.figma.com/design/WyggKZWGVduSA0aYPjEbUK/Slotty-Student-Flow-Neo-Brutalism-UI?node-id=0-1&t=nbrXklAqJwTxfTqn-1)

## 1. Product Summary
DemoDesk is a student-first scheduling and evaluation platform for course assignments and projects that require a live demo, review, or viva. It replaces spreadsheet-based coordination with a controlled booking workflow so that students can find open slots quickly, reschedule within policy, and receive reliable confirmations. Teaching Assistants (TAs) can create slots, choose venues, manage capacity, conduct demos, and record marks privately. Course Instructors can review finalized evaluations and export records when needed.

The primary value proposition is a simpler experience for students and a lower administrative burden for TAs. The product is intended to be useful even when deployed as a departmental pilot, without dependence on Google Classroom or Google Sheets integration.

## 2. Problem Statement
Current demo coordination for course assignments and projects is typically fragmented across shared spreadsheets, chat messages, and manual follow-up. This creates four recurring problems:

- Students cannot reliably see what is open, booked, completed, or closed.
- TAs lose time managing slot conflicts, venue changes, and last-minute cancellations.
- Mark recording is inconsistent and often separated from the booking record.
- Instructors lack a clean, exportable view of booking status and evaluation outcomes.

DemoDesk addresses these problems by providing a single workflow for booking, delivery, evaluation, and export.

## 3. Product Goals
1. Make student booking fast, understandable, and reliable.
2. Give TAs full control over slot creation, venue selection, and demo execution.
3. Store booking and evaluation data in one auditable system.
4. Allow instructors to review submitted marks and export data without manual cleanup.
5. Support pilot deployment with restricted Google sign-in, manual setup, and no dependency on classroom or sheet sync.

## 4. In Scope and Out of Scope
### In Scope
- Student login with restricted Google OAuth.
- Manual course, assignment, TA, and student setup.
- TA-created slots with configurable capacity, duration, freeze window, and venue.
- Student booking, rescheduling, and cancellation within policy.
- Venue changes for published slots, with notification to affected students.
- TA recording of marks, rubric scores, and private notes.
- Instructor visibility after TA submission of evaluations.
- Export of booking and evaluation data to file.
- Responsive web application and PWA-style mobile access.

### Out of Scope
- Google Classroom sync.
- Google Sheets sync or writeback.
- Automatic gradebook replacement.
- Mandatory institutional SSO for the pilot phase.

## 5. User Roles
### Student
Students discover assignments/projects that require a demo, book a slot, reschedule or cancel within policy, and view their booking history and notifications.

### Teaching Assistant
TAs create assignment schedules, choose venues, publish slots, conduct demos, record marks privately, and submit finalized evaluation records.

### Instructor
Instructors review submitted evaluations, export records, and monitor progress at the course level.


## 6. Assumptions and Constraints
- Pilot authentication uses Google OAuth with an administrator-managed allowlist of approved domains and accounts.
- Institutional SSO may be added later if approval is granted, but it is not required for the first release.
- Course rosters and assignment setup are entered manually or via CSV import.
- DemoDesk is intended to remain valuable even if formal university IT approval is not available initially.
- Notifications may use in-app, push, and email channels, with in-app and email remaining available if push is unavailable.
- Booking and evaluation data are stored only in DemoDesk; they are not written to Google Sheets.
- Google Classroom is not required for initial rollout.

## 7. Core Workflows
### 7.1 Student Booking
1. The student signs in with an approved Google account.
2. The student sees a list of assignments/projects requiring a demo.
3. The student opens an assignment, selects a TA, and views available slots.
4. The student confirms a slot.
5. The system creates the booking atomically and shows confirmation.
6. The student can reschedule or cancel only when the assignment is still open and the freeze window has not started.

### 7.2 TA Slot Setup
1. The TA creates or selects an assignment.
2. The TA defines the demo window, slot duration, capacity, freeze window, and default venue.
3. The TA generates slots and publishes only the ones needed.
4. The TA can change the venue for a published slot if the venue changes.
5. Venue changes are treated as events and are propagated to affected students.

### 7.3 TA Demo Execution and Marks
1. The TA opens the day view.
2. The TA marks each booking as completed, no-show, or pending follow-up.
3. The TA records marks and private notes inside DemoDesk.
4. The marks remain TA-private until the TA submits the evaluation batch.
5. After submission, the instructor can review the finalized record or the data can be exported.

### 7.4 Instructor Review and Export
1. The instructor opens the course overview.
2. The instructor reviews submitted evaluations and status counts.
3. The instructor exports data to file when needed.

## 8. Functional Requirements
| ID | Requirement |
|---|---|
| FR-01 | Users shall sign in using Google OAuth with an approved-domain or approved-account restriction for pilot deployment. |
| FR-02 | The system shall support manual setup of courses, assignments, TAs, and students, including CSV import. |
| FR-03 | TAs shall be able to configure assignment-level demo windows, slot duration, capacity, freeze window, cancellation policy, and default venue. |
| FR-04 | TAs shall be able to create, publish, unpublish, and update slots that belong to their assignments. |
| FR-05 | Each published slot shall include a venue or link chosen by the TA. |
| FR-06 | Venue changes to published slots shall be versioned and propagated to affected students. |
| FR-07 | Students shall be able to book at most one active slot per assignment. |
| FR-08 | Booking shall be atomic and shall prevent double-booking and over-capacity reservation. |
| FR-09 | Students shall be able to reschedule as a single cancel-and-rebook action only when the booking is outside the freeze window. |
| FR-10 | Students shall be able to cancel only when the assignment is still open and the cancellation quota has not been exceeded. |
| FR-11 | Cancellation shall require a reason selection, and the "Other" option shall require a free-text note. |
| FR-12 | TAs shall be able to record marks, rubric scores, and private notes for each completed demo. |
| FR-13 | Marks entered by a TA shall remain private until the TA submits the evaluation batch. |
| FR-14 | After submission, instructors shall be able to view finalized evaluations and export them to file. |
| FR-15 | Booking confirmations shall be sent to the student immediately; booking confirmation notifications shall not be sent to the TA. |
| FR-16 | The TA dashboard shall show booking counts and slot status without sending per-booking confirmation alerts. |
| FR-17 | Student notifications shall include booking confirmation, reminder, cancellation confirmation, and venue or time change updates. |
| FR-18 | The system shall keep an audit trail of slot creation, venue changes, booking changes, cancellations, and evaluation submission. |
| FR-19 | The application shall be responsive and usable on both mobile and desktop. |
| FR-20 | The application shall support export of booking and evaluation data in common file formats such as CSV. |

## 9. Data Model
### User
| Field | Purpose |
|---|---|
| id | Internal unique identifier |
| name | Display name |
| email | Google account email |
| roll_number | Student identifier, if applicable |
| role | Student, TA, or Instructor |
| status | Active, pending verification, or disabled |

### Course
| Field | Purpose |
|---|---|
| id | Internal unique identifier |
| code | Course code |
| title | Course title |
| owner_id | Instructor responsible for the course |
| term | Academic term or semester |

### Enrollment
| Field | Purpose |
|---|---|
| course_id | Linked course |
| user_id | Linked user |
| role_in_course | Student or TA |
| created_at | Enrollment timestamp |

### Assignment
| Field | Purpose |
|---|---|
| course_id | Parent course |
| title | Assignment or project name |
| demo_window_start | Booking start |
| demo_window_end | Booking end |
| slot_duration_min | Default slot length |
| capacity | Students per slot |
| freeze_before_min | Modification cutoff |
| max_cancellations | Allowed cancellations per student |
| default_venue | Initial room or online location |
| is_published | Visibility to students |

### DemoSlot
| Field | Purpose |
|---|---|
| assignment_id | Parent assignment |
| ta_id | Slot owner |
| starts_at | Start time |
| ends_at | End time |
| venue | Room or meeting link |
| capacity | Maximum bookings |
| status | Draft, published, booked, completed, cancelled |
| version | Concurrency control value |

### Booking
| Field | Purpose |
|---|---|
| slot_id | Linked slot |
| student_id | Student who booked |
| assignment_id | Parent assignment |
| status | Booked, completed, no-show, cancelled-by-student, cancelled-by-TA |
| booked_at | Booking timestamp |
| cancelled_at | Cancellation timestamp |
| cancel_reason | Structured reason |
| cancel_note | Free-text explanation if required |

### Evaluation
| Field | Purpose |
|---|---|
| booking_id | Linked booking |
| ta_id | Marking TA |
| rubric_scores | Structured mark data |
| total_score | Final mark |
| private_note | TA-only note |
| submitted_at | Submission timestamp |
| visible_to_instructor | Boolean flag after submission |

### AuditEvent
| Field | Purpose |
|---|---|
| actor_id | User who performed the action |
| entity_type | Booking, slot, assignment, or evaluation |
| entity_id | Affected record |
| event_type | Created, updated, venue-changed, cancelled, submitted |
| payload | Event details |
| created_at | Timestamp |

## 10. Non-Functional Requirements
| Area | Requirement |
|---|---|
| Performance | Booking confirmation should complete at p95 in under 1.5 seconds under normal pilot load. |
| Performance | Slot availability queries should return in under 500 ms for typical course sizes. |
| Reliability | Booking data shall not be lost on server restart or deployment. |
| Reliability | All state-changing actions shall be auditable. |
| Security | All traffic shall use HTTPS, and sessions shall use secure HttpOnly cookies. |
| Security | Access shall be role-based, with students restricted to their own data and TAs restricted to assigned courses. |
| Security | Google accounts outside the approved allowlist shall be denied access. |
| Privacy | Marks remain private to the TA until formal submission. |
| Accessibility | The interface shall meet WCAG 2.1 AA expectations for keyboard access and contrast. |
| Portability | The system shall remain deployable on a university server or approved cloud platform without redesign. |
| Usability | Common student actions shall be completable in a small number of steps on a phone. |

## 11. Success Metrics
| Metric | Target |
|---|---|
| Student booking time | Less than 3 minutes for a first-time booking |
| Returning student booking time | Less than 90 seconds |
| TA slot setup time | Less than 5 minutes per assignment |
| Booking collision rate | 0% |
| Venue-change notification delay | Near-immediate for affected bookings |
| Export readiness | Instructor can export course records without spreadsheet cleanup |
| Mark traceability | Every submitted mark has an audit trail |

## 12. Planned Enhancements
The following features are intentionally deferred from the initial release, but the architecture should allow them without major rework:

### 12.1 Waitlist
Students can join a waitlist when all slots are full. If a slot opens, the first eligible student receives a timed claim window.

### 12.2 Booking Health Score
The instructor dashboard can display a traffic-light indicator that summarizes whether a course is on track, partially booked, or at risk of missing the demo deadline.

### 12.3 Group Assignments
One student can book on behalf of a group, and the booking status propagates to the remaining group members.

### 12.4 Lightweight Viva Checklist
TAs can attach a short checklist to an assignment and tap through it during a demo without introducing marks into the checklist itself.

### 12.5 Anonymous Demo Feedback
After a demo is completed, students can submit anonymous feedback that is aggregated per TA and assignment.

## 13. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Google OAuth approval or allowlist friction | Delays pilot start | Use restricted-domain pilot access first and keep the account model simple. |
| Manual roster entry errors | Incorrect user linking | Support CSV import and verification checks. |
| Notification overload | Users ignore important messages | Restrict notifications to booking, cancellation, reminder, and venue-change events. |
| Venue changes after booking | Student confusion | Version slot changes and notify only affected students immediately. |
| Adoption resistance | Students or TAs keep using the old flow | Keep the student flow short and make TA setup faster than the spreadsheet process. |

## 14. Release Plan
### MVP
- Manual course and assignment setup
- Restricted Google sign-in
- TA slot creation and venue management
- Student booking, rescheduling, and cancellation
- TA marks and private notes
- Instructor review and CSV export
- Student notifications
- Responsive web application

### Phase 2
- Waitlist
- Booking health score
- Group assignments

### Phase 3
- Lightweight viva checklist
- Anonymous demo feedback
