# Slotty — System Design & Technical Implementation Document

**Document Classification:** Internal Engineering Reference  
**Product:** Slotty — Student-First Scheduling & Evaluation Platform  
**Organization:** Prime Innovators  
**Prepared By:** Senior Architecture Review Board  
**Based On:** Product Requirements Document v1.0 (M. Saeed, 28 April 2026)  
**Document Version:** 1.0.0  
**Status:** Draft for Engineering Review  
**Date:** 29 April 2026  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Stakeholders and User Roles](#3-stakeholders-and-user-roles)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Architecture](#6-system-architecture)
7. [Component Breakdown](#7-component-breakdown)
8. [Data Flow](#8-data-flow)
9. [Database Design](#9-database-design)
10. [API Design](#10-api-design)
11. [Technology Stack](#11-technology-stack)
12. [Security Design](#12-security-design)
13. [Scalability Considerations](#13-scalability-considerations)
14. [DevOps and Deployment Strategy](#14-devops-and-deployment-strategy)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Testing Strategy](#16-testing-strategy)
17. [Monitoring and Logging](#17-monitoring-and-logging)
18. [Phased Implementation Roadmap](#18-phased-implementation-roadmap)
19. [Team Structure](#19-team-structure)
20. [Development Workflow](#20-development-workflow)
21. [Assumptions and Open Questions](#21-assumptions-and-open-questions)
22. [Glossary](#22-glossary)

---

## 1. Executive Summary

Slotty is a purpose-built web application that replaces ad-hoc, spreadsheet-driven coordination of academic live demonstrations, code reviews, and viva examinations with a structured, auditable booking and evaluation workflow. The platform serves three distinct user roles — Student, Teaching Assistant (TA), and Instructor — each with clearly delineated access boundaries and responsibilities.

This document translates the approved Product Requirements Document (PRD v1.0) into a complete technical blueprint suitable for direct consumption by a software engineering team. It covers every layer of the system: from frontend component decomposition and REST API contracts, to database schema design, security model, DevOps pipeline, and a phased delivery roadmap. Where the PRD states intent, this document states implementation.

**Key architectural decisions summarised:**

- **Backend:** Node.js (TypeScript) with a NestJS framework for structured, modular API development.
- **Frontend:** React (TypeScript) with a Progressive Web App (PWA) configuration for mobile-first delivery.
- **Database:** PostgreSQL with row-level locking for atomic booking guarantees, supplemented by Redis for session management and slot-availability caching.
- **Authentication:** Google OAuth 2.0 with an administrator-controlled allowlist enforced at the API gateway layer.
- **Deployment Target:** Containerised via Docker Compose for pilot; Kubernetes-ready for future scale.
- **Audit:** All state-changing operations append to an immutable `audit_events` table.

The MVP is estimated at **12–14 weeks** with a team of five to seven engineers, covering all core booking, evaluation, and export capabilities.

---

## 2. Product Overview

### 2.1 Problem Context

Academic institutions conducting courses that require live project demonstrations face a recurring coordination failure. The typical process involves a shared Google Sheet in which students manually enter their names into time slots, TAs monitor rows for conflicts, and instructors export data for gradebook entry. This process is inherently fragile: concurrent edits cause double-bookings, row deletions are untracked, marks are recorded in separate spreadsheets with no linkage to the booking record, and no machine-readable audit trail exists.

Slotty eliminates this failure mode by providing a single, transactional system of record for the entire demonstration lifecycle: from slot creation through student booking, live evaluation, and instructor export.

### 2.2 Refined Product Statement

Slotty is a **scheduling and evaluation platform** for academic courses that require a live demo, viva, or review. It provides:

1. A **student-facing booking interface** that guarantees slot availability at point of confirmation, supports policy-constrained rescheduling, and delivers immediate confirmations.
2. A **TA-facing administration interface** for slot lifecycle management (draft → published → completed), venue selection, evaluation recording, and batch submission.
3. An **instructor-facing review interface** for cross-TA visibility, progress monitoring, and data export.
4. An **audit layer** that captures every state transition for accountability and dispute resolution.

### 2.3 Scope Boundary

| In Scope (MVP) | Out of Scope |
|---|---|
| Google OAuth with allowlist | Institutional SSO (SAML/LDAP) |
| Manual and CSV-based course setup | Google Classroom sync |
| TA slot creation, publishing, venue management | Google Sheets writeback |
| Student booking, rescheduling, cancellation | Automatic gradebook integration |
| TA evaluation recording and batch submission | Group assignment bookings (Phase 2) |
| Instructor review and CSV/JSON export | Waitlist (Phase 2) |
| In-app, email, and push notifications | AI-based scheduling optimisation |
| Responsive web + PWA | Native iOS / Android applications |
| Audit trail for all state changes | External analytics dashboards |

### 2.4 Core Value Propositions

- **Zero double-bookings:** Atomic database transactions with advisory locks prevent concurrent reservation conflicts.
- **Full traceability:** Every booking state change, venue update, and evaluation submission is captured in the audit log.
- **Low friction for students:** A first-time booking requires fewer than three minutes; returning students fewer than ninety seconds.
- **Reduced TA overhead:** Slot batch creation, venue propagation, and in-system mark recording eliminate the spreadsheet maintenance burden.
- **Clean instructor export:** Data is export-ready without manual reformatting.

---

## 3. Stakeholders and User Roles

### 3.1 Role Definitions

#### Student
A student is an enrolled participant in a course who must complete at least one live demonstration or review as part of their assessment. Students interact with the system primarily on mobile devices and are expected to be infrequent users (booking once or twice per assignment).

**Capabilities:**
- Authenticate via approved Google account.
- View all assignments in enrolled courses that require a demo.
- Browse available TA slots for an assignment.
- Book exactly one active slot per assignment.
- Reschedule (cancel and rebook atomically) while outside the freeze window.
- Cancel a booking while within the allowed cancellation quota and before freeze.
- View booking history, status, and notifications.

#### Teaching Assistant (TA)
A TA is a course staff member assigned to one or more assignments. They are the primary operators of the system, using it daily during active demo periods.

**Capabilities:**
- Authenticate via approved Google account.
- Create and manage assignment-level demo windows, slot configurations, and venues.
- Draft, publish, unpublish, and cancel slots.
- Change venue for published slots (triggers versioned notification).
- Access the day view to manage bookings.
- Mark bookings as completed, no-show, or pending follow-up.
- Record rubric scores, total marks, and private notes.
- Submit evaluation batches for instructor visibility.

#### Instructor
An Instructor owns one or more courses and holds read access to all data beneath them. They do not interact with individual bookings operationally but require aggregate visibility and export capability.

**Capabilities:**
- Authenticate via approved Google account.
- View course-level booking progress and status counts.
- Review submitted evaluation records across all TAs for a course.
- Export booking and evaluation data (CSV, JSON).
- (Future) View booking health score dashboard.

#### System Administrator
Not a user role in the application UI but a human operator responsible for:
- Managing the Google OAuth allowlist (approved domains and accounts).
- Seeding course, assignment, TA, and student data manually or via CSV import.
- Monitoring infrastructure health and managing deployment.

### 3.2 Role Hierarchy and Data Access Matrix

| Resource | Student | TA | Instructor | Admin |
|---|---|---|---|---|
| Own profile | RW | RW | RW | RW |
| Other user profiles | — | R (enrolled) | R (course) | RW |
| Course metadata | R | R | RW | RW |
| Assignment config | R | RW (assigned) | RW | RW |
| Slot (own) | R | RW | R | RW |
| Slot (other TA) | R (avail only) | — | R | RW |
| Own booking | RW | — | R | RW |
| Other bookings | — | R (assigned) | R (course) | RW |
| Evaluation (pre-submit) | — | RW (own) | — | R |
| Evaluation (post-submit) | — | R (own) | R (course) | R |
| Audit events | — | R (own actions) | R (course) | R |
| Export | — | — | W | W |

*R = Read, W = Write (export), RW = Read + Write, — = No Access*

---

## 4. Functional Requirements

The following requirements extend and formalise those stated in the PRD. Each requirement carries a unique identifier, priority classification, acceptance criteria, and dependency mapping.

### 4.1 Authentication and Access Control

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-01 | The system shall authenticate users via Google OAuth 2.0. | P0 | Login redirect initiates OAuth flow; callback validates token. |
| FR-01a | Only accounts matching the administrator-managed allowlist (approved domains or individual emails) shall be granted access. | P0 | Accounts outside allowlist receive HTTP 403 with descriptive error. |
| FR-01b | Authenticated sessions shall be maintained via secure HttpOnly cookies with a configurable TTL. | P0 | Session persists across browser refresh; expires after TTL. |
| FR-01c | Logout shall invalidate the server-side session and clear the cookie. | P0 | Subsequent requests with invalidated session return HTTP 401. |

### 4.2 Course and Assignment Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-02 | Administrators shall be able to create courses with code, title, term, and owner (Instructor). | P0 | Course appears in Instructor dashboard post-creation. |
| FR-02a | Administrators shall be able to enroll students and TAs in a course. | P0 | Enrolled users see the course in their dashboard. |
| FR-02b | The system shall support CSV import for bulk enrollment of students and TAs. | P0 | CSV with headers `email,role` imports without error; duplicate emails are idempotent. |
| FR-03 | TAs shall be able to create assignments within their enrolled courses. | P0 | Assignment visible to enrolled students post-publication. |
| FR-03a | Assignment configuration shall include: title, demo window start/end, slot duration (minutes), per-slot capacity, freeze window (minutes before slot), maximum cancellations per student, default venue, and publication status. | P0 | All fields persisted and reflected in student view. |

### 4.3 Slot Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-04 | TAs shall be able to generate a set of slots for an assignment based on the demo window and slot duration. | P0 | Generated slots cover the window without overlap. |
| FR-04a | TAs shall be able to individually publish, unpublish, or cancel generated slots. | P0 | Only published slots are visible to students. |
| FR-04b | A slot shall not be unpublished if it has an active booking. | P0 | Unpublish attempt on booked slot returns HTTP 409 with clear error. |
| FR-05 | Each published slot shall carry a venue field (room identifier or meeting URL). | P0 | Venue is displayed to booked student on confirmation screen. |
| FR-06 | TAs shall be able to update the venue of a published slot. | P0 | Venue update increments slot version; notification dispatched to all booked students. |
| FR-06a | Venue change history shall be preserved and accessible via the audit log. | P1 | Audit event records old and new venue values. |

### 4.4 Student Booking

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-07 | A student shall hold at most one active booking per assignment at any time. | P0 | Attempt to book a second slot returns HTTP 409. |
| FR-08 | Booking shall be atomic: concurrent booking attempts for the same slot shall result in exactly one success. | P0 | Load test with 50 concurrent booking requests yields exactly one confirmed booking. |
| FR-09 | Rescheduling shall be implemented as a single atomic cancel-and-rebook operation. | P0 | If rebook fails, original booking is preserved (rollback). |
| FR-09a | Rescheduling shall only be permitted when the current booking is outside the freeze window. | P0 | Reschedule attempt within freeze window returns HTTP 422 with freeze expiry time. |
| FR-10 | Cancellation shall only be permitted when (a) the assignment is open, (b) the booking is outside the freeze window, and (c) the student has not exceeded `max_cancellations`. | P0 | Each condition independently validated; distinct error codes returned. |
| FR-11 | Cancellation requires a structured reason selection; the "Other" reason requires a minimum 10-character free-text note. | P1 | API rejects "Other" cancellation without `cancel_note`; reason list is configurable per deployment. |

### 4.5 Evaluation

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-12 | TAs shall be able to record rubric scores, total score, and private notes against a completed booking. | P0 | Evaluation record linked to booking ID and TA ID. |
| FR-13 | Evaluation records shall be invisible to Instructors until the TA explicitly submits the evaluation batch. | P0 | Instructor API returns no evaluation data for unsubmitted batches; confirmed via integration test. |
| FR-13a | Submission shall be an irreversible action; the TA may not edit scores post-submission without an Administrator override. | P1 | Post-submission edit attempt returns HTTP 403. |
| FR-14 | After submission, Instructors shall be able to view all evaluation records for an assignment. | P0 | Instructor course view shows submitted evaluations with TA attribution. |

### 4.6 Notifications

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-15 | Booking confirmation notification shall be sent to the student within 30 seconds of a successful booking. | P0 | Notification observed in student inbox during acceptance test. |
| FR-16 | The TA dashboard shall display aggregate slot and booking counts; no per-booking confirmation shall be sent to the TA. | P0 | TA receives no notification on student booking. |
| FR-17 | Students shall receive notifications for: booking confirmation, reminder (configurable lead time), cancellation confirmation, and venue/time change. | P0 | Each notification type verified via integration test. |
| FR-17a | Notifications shall be delivered via: in-app (always), email (always), and browser push (when permission granted). | P1 | In-app and email delivery confirmed when push is unavailable. |

### 4.7 Export and Audit

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-18 | All state-changing operations shall append a record to `audit_events` with actor, entity type, entity ID, event type, payload, and timestamp. | P0 | Audit record present after each tested operation. |
| FR-20 | Instructors shall be able to export booking and evaluation data in CSV and JSON formats. | P0 | Exported file passes schema validation; contains all expected records. |

### 4.8 User Interface

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-19 | The application shall be fully usable on mobile (≥320px width) and desktop (≥1280px width). | P0 | No horizontal scroll or broken layout at target breakpoints; tested via browser DevTools and physical devices. |
| FR-19a | The application shall register as a PWA, enabling home screen installation and offline splash screen. | P1 | Lighthouse PWA score ≥ 90. |
| FR-19b | The interface shall conform to WCAG 2.1 AA for keyboard navigation and colour contrast. | P1 | axe-core audit passes with zero critical or serious violations. |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target | Rationale |
|---|---|---|
| Booking confirmation p95 latency | ≤ 1,500 ms | PRD specification; ensures perceived responsiveness. |
| Slot availability query p95 latency | ≤ 500 ms | Drives the browsing experience; cached at Redis layer. |
| Page Time to Interactive (TTI) | ≤ 3,000 ms on 4G | Ensures mobile usability in campus network conditions. |
| API error rate (5xx) | < 0.1% under pilot load | Pilot load estimated at ≤ 500 concurrent users. |
| Export generation (1,000 records) | ≤ 5,000 ms | Acceptable for an infrequent, instructor-initiated action. |

### 5.2 Reliability

| Requirement | Implementation Approach |
|---|---|
| Booking data durability | PostgreSQL with WAL-based replication; no in-memory-only state for bookings. |
| Zero data loss on restart | Docker volumes / persistent disk; graceful shutdown hooks flush in-flight writes. |
| Uptime target (pilot) | 99.5% monthly (allows ~3.6 hours downtime/month). |
| Scheduled maintenance | Communicated 48 hours in advance; executed outside peak demo hours (weekday 02:00–04:00 local). |

### 5.3 Security

Detailed in Section 12. Summary targets:

- All traffic over HTTPS (TLS 1.2 minimum, TLS 1.3 preferred).
- Sessions via `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Role-based access control (RBAC) enforced at the API service layer.
- SQL injection prevention via parameterised queries (ORM-enforced).
- CSRF protection via `SameSite=Strict` cookies and `Origin` header validation.
- Secrets managed via environment variables; never committed to version control.

### 5.4 Accessibility

- WCAG 2.1 AA compliance.
- Full keyboard navigability for all student and TA workflows.
- Screen reader compatibility (ARIA labels on all interactive elements).
- Minimum colour contrast ratio 4.5:1 for normal text.

### 5.5 Maintainability

- TypeScript throughout (frontend and backend) for type safety and refactoring confidence.
- Test coverage minimum: 80% line coverage for business logic modules.
- All API contracts documented via OpenAPI 3.1 specification.
- Modular NestJS architecture enabling feature-level code isolation.

### 5.6 Portability

- The system shall be deployable on any Linux-based server with Docker and Docker Compose support.
- No cloud-provider-specific services shall be used in MVP; infrastructure choices favour portability.
- Environment-specific configuration shall be isolated to `.env` files and Kubernetes ConfigMaps.

---

## 6. System Architecture

### 6.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │          React SPA / PWA (TypeScript + Vite)                    │   │
│   │     Student UI │ TA Dashboard │ Instructor Review │ Admin       │   │
│   └────────────────────────┬─────────────────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │ HTTPS (REST + Server-Sent Events)
┌───────────────────────────▼──────────────────────────────────────────────┐
│                       REVERSE PROXY / GATEWAY                            │
│                   Nginx (TLS termination, rate limiting,                 │
│                    static asset serving, /api proxy)                     │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ HTTP (internal)
┌───────────────────────────▼──────────────────────────────────────────────┐
│                        API SERVICE LAYER                                 │
│                   NestJS Application (TypeScript)                        │
│                                                                          │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │  Auth      │ │  Booking     │ │  Eval     │ │  Notification      │  │
│  │  Module    │ │  Module      │ │  Module   │ │  Module            │  │
│  └────────────┘ └──────────────┘ └───────────┘ └────────────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │  Course    │ │  Slot        │ │  Export   │ │  Audit             │  │
│  │  Module    │ │  Module      │ │  Module   │ │  Module            │  │
│  └────────────┘ └──────────────┘ └───────────┘ └────────────────────┘  │
└────────┬────────────────┬──────────────────────────────────┬────────────┘
         │                │                                  │
┌────────▼──────┐ ┌───────▼────────┐              ┌─────────▼──────────┐
│  PostgreSQL   │ │  Redis         │              │  Email / Push      │
│  (Primary DB) │ │  (Session +    │              │  Service           │
│               │ │   Cache +      │              │  (Nodemailer /     │
│               │ │   Job Queue)   │              │   Web Push)        │
└───────────────┘ └────────────────┘              └────────────────────┘
```

### 6.2 Low-Level Architecture

#### 6.2.1 Frontend Architecture

The React frontend adopts a **feature-based folder structure** combined with a **layered internal architecture** per feature. This prevents the common "components-soup" anti-pattern seen in growing SPAs.

```
src/
├── app/                    # App shell: router, providers, global layout
│   ├── App.tsx
│   ├── Router.tsx          # React Router v6 with lazy-loaded routes
│   └── providers/          # AuthProvider, QueryClientProvider, ThemeProvider
├── features/               # One folder per bounded domain
│   ├── auth/
│   │   ├── components/     # LoginPage, OAuthCallback
│   │   ├── hooks/          # useAuth, useCurrentUser
│   │   └── api.ts          # Auth API calls
│   ├── booking/
│   │   ├── components/     # SlotBrowser, BookingConfirmCard, RescheduleModal
│   │   ├── hooks/          # useAvailableSlots, useCreateBooking
│   │   └── api.ts
│   ├── slots/              # TA slot management
│   ├── evaluation/         # TA mark recording
│   ├── courses/            # Course / assignment management
│   ├── instructor/         # Instructor review + export
│   └── notifications/      # Notification centre
├── shared/                 # Cross-feature shared code
│   ├── components/         # Button, Modal, Table, Badge, Spinner
│   ├── hooks/              # useDebounce, useEventSource, useLocalStorage
│   ├── lib/                # axios instance, date utils, formatters
│   └── types/              # Shared TypeScript interfaces
├── styles/                 # Tailwind config, global CSS tokens
└── sw.ts                   # Service Worker (PWA, Workbox)
```

**State Management Strategy:**

- **Server state:** TanStack Query (React Query) for all API data, providing caching, background refetching, and optimistic updates.
- **UI state:** React `useState` / `useReducer` for component-local state (modals, form steps).
- **Global auth state:** React Context (lightweight; changes infrequently).
- **No Redux:** Complexity is not warranted for this application's state surface.

**Real-time Updates:**

Slot availability and booking status updates are delivered via **Server-Sent Events (SSE)** on a per-user channel. SSE is preferred over WebSockets for this use case because communication is unidirectional (server to client) and SSE is natively supported without additional infrastructure.

#### 6.2.2 Backend Architecture (NestJS)

NestJS enforces a modular structure via its dependency injection container. The application is composed of **bounded feature modules**, each encapsulating its controllers, services, repositories, and DTOs.

```
src/
├── main.ts                  # Bootstrap: NestFactory, global pipes, Swagger
├── app.module.ts            # Root module: imports all feature modules
├── config/                  # ConfigModule, validated with Joi
│   └── configuration.ts
├── database/
│   ├── database.module.ts   # TypeORM / pg connection
│   ├── migrations/          # SQL migrations (numbered, timestamped)
│   └── seeds/               # Dev/test seed data
├── modules/
│   ├── auth/                # OAuth flow, session guard, RBAC decorators
│   ├── users/               # User CRUD, allowlist check
│   ├── courses/             # Course + enrollment management
│   ├── assignments/         # Assignment CRUD + config
│   ├── slots/               # Slot lifecycle management
│   ├── bookings/            # Booking, reschedule, cancel (atomic)
│   ├── evaluations/         # Mark recording + batch submission
│   ├── notifications/       # Dispatch orchestration
│   ├── exports/             # CSV + JSON export generation
│   └── audit/               # AuditEvent appender (called by all modules)
├── shared/
│   ├── guards/              # RolesGuard, SessionGuard
│   ├── decorators/          # @Roles(), @CurrentUser()
│   ├── filters/             # GlobalExceptionFilter
│   ├── interceptors/        # LoggingInterceptor, TransformInterceptor
│   └── pipes/               # ValidationPipe (class-validator)
└── jobs/                    # Bull queue workers
    ├── notification.worker.ts
    └── reminder.worker.ts
```

**Request Lifecycle:**

```
HTTP Request
  → Nginx (TLS, rate limit)
  → NestJS HTTP Adapter
    → Global Middleware (cookie-session, helmet, cors)
    → Guard Pipeline (SessionGuard → RolesGuard)
    → Validation Pipe (class-validator DTOs)
    → Controller
    → Service (business logic)
      → Repository (TypeORM → PostgreSQL)
      → AuditService.append()
      → NotificationService.enqueue() [async, Bull queue]
    → TransformInterceptor (response shape)
  → HTTP Response
```

---

## 7. Component Breakdown

### 7.1 Auth Module

**Responsibilities:** Initiating and completing the Google OAuth 2.0 flow, validating the authenticated account against the allowlist, creating or updating the `users` record, and issuing a server-side session.

**Key files:**
- `auth.controller.ts` — `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`
- `google.strategy.ts` — Passport.js `GoogleStrategy` configured with `profile` and `email` scopes
- `session.guard.ts` — Applied globally; passes if `req.session.userId` is set
- `roles.guard.ts` — Checks `@Roles()` decorator against the user's `role` field
- `allowlist.service.ts` — Queries `allowed_domains` and `allowed_emails` configuration tables

**Allowlist Enforcement Logic:**
```
IF user.email domain IN allowed_domains → PERMIT
ELSE IF user.email IN allowed_emails → PERMIT
ELSE → return HTTP 403 with error code ACCESS_DENIED_ALLOWLIST
```

### 7.2 Booking Module

This is the most critical module. It handles the booking creation, reschedule, and cancellation flows, all of which require transactional integrity.

**Booking Creation — Atomic Flow:**

```
BEGIN TRANSACTION
  1. SELECT slot FOR UPDATE WHERE id = :slotId AND status = 'published'
  2. COUNT active bookings WHERE slot_id = :slotId → assert < capacity
  3. COUNT active bookings WHERE student_id = :userId AND assignment_id = :assignmentId → assert = 0
  4. INSERT INTO bookings (slot_id, student_id, assignment_id, status='booked', booked_at=NOW())
  5. IF bookings_count + 1 = capacity THEN UPDATE slots SET status = 'booked' WHERE id = :slotId
  6. INSERT INTO audit_events (...)
COMMIT
→ Enqueue notification job (outside transaction)
```

The `SELECT ... FOR UPDATE` pessimistic lock on the slot row is the concurrency control mechanism. It serialises concurrent booking attempts for the same slot at the database level, guaranteeing that exactly one transaction sees capacity available when the slot reaches maximum capacity.

**Reschedule — Atomic Flow:**

```
BEGIN TRANSACTION
  1. SELECT current_booking FOR UPDATE WHERE id = :bookingId AND student_id = :userId
  2. Assert booking.status = 'booked' AND NOW() < slot.starts_at - freeze_before_min
  3. UPDATE current_booking SET status = 'cancelled-by-student', cancelled_at = NOW(), cancel_reason = 'reschedule'
  4. [Booking Creation steps 1–5 for new slot]
  5. INSERT two audit_events (cancel + rebook)
COMMIT
```

### 7.3 Slot Module

**Responsibilities:** Slot generation from assignment window, individual slot publication controls, venue update with version increment and notification dispatch.

**Slot Generation Algorithm:**
```
slots = []
current = assignment.demo_window_start
WHILE current + slot_duration ≤ assignment.demo_window_end:
  slots.append({
    starts_at: current,
    ends_at: current + slot_duration,
    venue: assignment.default_venue,
    capacity: assignment.capacity,
    status: 'draft',
    version: 1
  })
  current += slot_duration
RETURN slots
```

The TA then selects a subset to publish. Unpublished slots remain as drafts and are not visible to students.

### 7.4 Evaluation Module

**Responsibilities:** Accepting mark entry from TAs for completed bookings, enforcing pre-submission privacy, handling batch submission, and making records available to the Instructor module post-submission.

**Privacy Enforcement:**
- The `evaluations` table has a `visible_to_instructor` boolean (default `false`).
- The Instructor-facing API endpoint joins `evaluations` with `WHERE visible_to_instructor = true`.
- Submission sets `visible_to_instructor = true` and `submitted_at = NOW()` atomically.
- No column-level encryption is required; RBAC at the API layer is sufficient given the access model.

### 7.5 Notification Module

Notifications are dispatched asynchronously via a **Bull queue** backed by Redis. This decouples notification delivery from the request-response cycle, ensuring that a slow email provider does not degrade booking confirmation latency.

**Queue Architecture:**

```
notification_queue (Redis/Bull)
  └── notification.worker.ts (consumer)
        ├── channel: 'email'  → Nodemailer (SMTP)
        ├── channel: 'inapp'  → Upsert to notifications table → SSE push
        └── channel: 'push'   → web-push library (VAPID)
```

**Job Payload Structure:**
```typescript
interface NotificationJob {
  recipientId: string;
  type: 'booking_confirmed' | 'booking_cancelled' | 'venue_changed'
      | 'time_changed' | 'reminder';
  channels: ('email' | 'inapp' | 'push')[];
  data: Record<string, unknown>; // Contextual data for template rendering
}
```

**Reminder Scheduling:**

A separate `reminder.worker.ts` runs a cron job (via Bull's repeatable jobs) every 15 minutes. It queries bookings with `starts_at` within the next `reminder_lead_time_min` and whose reminder has not yet been sent, enqueues reminder jobs, and marks them as dispatched.

### 7.6 Export Module

**Responsibilities:** Generating CSV and JSON exports for Instructors on demand.

**Implementation:**

- CSV is generated using the `csv-stringify` library (streaming mode for large datasets).
- JSON is assembled as a structured object with courses → assignments → bookings → evaluations hierarchy.
- Exports are streamed directly to the HTTP response; files are not persisted on disk.
- Export operations are recorded in the audit log.

**CSV Schema (Booking + Evaluation export):**

```
course_code, course_title, assignment_title, student_email, student_roll_number,
slot_date, slot_start, slot_end, venue, booking_status, cancelled_at,
cancel_reason, ta_email, evaluation_status, total_score, rubric_json,
submitted_at
```

### 7.7 Audit Module

The `AuditService` exposes a single method: `append(event: CreateAuditEventDto): Promise<void>`. It is injected into every other service and called within or immediately after each state-changing transaction.

**Design Principle:** The audit append operation is intentionally **not transactional with the business operation** in the normal case, to avoid extending lock hold time. For high-integrity scenarios (e.g., evaluation submission), it is included within the transaction.

---

## 8. Data Flow

### 8.1 Student Booking Flow

```
Student selects slot
      │
      ▼
POST /api/bookings
      │
      ▼
SessionGuard validates cookie
      │
      ▼
RolesGuard asserts role = STUDENT
      │
      ▼
BookingService.create()
  ├── Validate: assignment open + freeze window not started
  ├── BEGIN TRANSACTION
  │     ├── SELECT slot FOR UPDATE
  │     ├── Assert capacity available
  │     ├── Assert no duplicate booking for student+assignment
  │     ├── INSERT booking
  │     └── UPDATE slot status if full
  ├── COMMIT
  ├── AuditService.append(BOOKING_CREATED)
  └── NotificationQueue.enqueue(booking_confirmed, student)
      │
      ▼
HTTP 201 { booking: { id, slot, status, venue, ... } }
      │
      ▼
Client displays confirmation card
SSE channel pushes slot availability update to other browsing students
```

### 8.2 TA Venue Change Flow

```
TA updates venue on published slot
      │
      ▼
PATCH /api/slots/:id/venue
      │
      ▼
BEGIN TRANSACTION
  ├── SELECT slot FOR UPDATE
  ├── Assert slot.ta_id = currentUser.id
  ├── UPDATE slot SET venue = newVenue, version = version + 1
  └── INSERT audit_event(VENUE_CHANGED, { old_venue, new_venue })
COMMIT
      │
      ▼
Query all active bookings for this slot → collect student IDs
      │
      ▼
For each affected student: NotificationQueue.enqueue(venue_changed)
      │
      ▼
HTTP 200 { slot: { ..., venue: newVenue, version: N+1 } }
SSE push updates any student currently viewing the slot browser
```

### 8.3 Evaluation Submission Flow

```
TA clicks "Submit Evaluation Batch"
      │
      ▼
POST /api/evaluations/submit?assignment_id=:id
      │
      ▼
BEGIN TRANSACTION
  ├── SELECT all evaluations WHERE assignment_id = :id AND ta_id = :userId FOR UPDATE
  ├── Assert all completed bookings have an evaluation record
  ├── UPDATE evaluations SET visible_to_instructor = true, submitted_at = NOW()
  └── INSERT audit_event(EVALUATION_SUBMITTED, { assignment_id, ta_id, count })
COMMIT
      │
      ▼
HTTP 200 { submitted: N }
Instructor's course view now reflects new evaluation count
```

---

## 9. Database Design

### 9.1 Design Principles

- **PostgreSQL 15+** as the sole relational store.
- All tables use **UUID v4 primary keys** to avoid sequential ID enumeration attacks and to simplify future data federation.
- **`created_at` and `updated_at`** columns on every mutable table, maintained via trigger or ORM lifecycle hooks.
- **Foreign key constraints** enforced at the database level (not only ORM layer).
- **Indexes** defined explicitly for all foreign keys and high-cardinality query columns.
- **Soft deletion** is used for users and courses (via `deleted_at` nullable column) to preserve referential integrity without cascading deletes.
- Slot and booking concurrency managed via **row-level `SELECT FOR UPDATE` locks** within explicit transactions.

### 9.2 Schema Definitions

#### 9.2.1 `users`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)        NOT NULL,
  email         VARCHAR(320)        NOT NULL UNIQUE,
  roll_number   VARCHAR(50),
  role          VARCHAR(20)         NOT NULL
                  CHECK (role IN ('student', 'ta', 'instructor', 'admin')),
  status        VARCHAR(20)         NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'pending_verification', 'disabled')),
  google_id     VARCHAR(128)        UNIQUE,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_email    ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role     ON users (role)  WHERE deleted_at IS NULL;
```

#### 9.2.2 `allowed_list`

```sql
CREATE TABLE allowed_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(10) NOT NULL CHECK (type IN ('domain', 'email')),
  value         VARCHAR(320) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 9.2.3 `courses`

```sql
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20)         NOT NULL,
  title         VARCHAR(255)        NOT NULL,
  owner_id      UUID                NOT NULL REFERENCES users(id),
  term          VARCHAR(50)         NOT NULL,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (code, term)
);

CREATE INDEX idx_courses_owner ON courses (owner_id);
```

#### 9.2.4 `enrollments`

```sql
CREATE TABLE enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role_in_course VARCHAR(10) NOT NULL CHECK (role_in_course IN ('student', 'ta')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, user_id)
);

CREATE INDEX idx_enrollments_course ON enrollments (course_id);
CREATE INDEX idx_enrollments_user   ON enrollments (user_id);
```

#### 9.2.5 `assignments`

```sql
CREATE TABLE assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID            NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title               VARCHAR(255)    NOT NULL,
  demo_window_start   TIMESTAMPTZ     NOT NULL,
  demo_window_end     TIMESTAMPTZ     NOT NULL,
  slot_duration_min   SMALLINT        NOT NULL CHECK (slot_duration_min > 0),
  capacity            SMALLINT        NOT NULL DEFAULT 1 CHECK (capacity > 0),
  freeze_before_min   INTEGER         NOT NULL DEFAULT 60,
  max_cancellations   SMALLINT        NOT NULL DEFAULT 1,
  default_venue       VARCHAR(512),
  is_published        BOOLEAN         NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_window CHECK (demo_window_end > demo_window_start)
);

CREATE INDEX idx_assignments_course ON assignments (course_id);
```

#### 9.2.6 `assignment_ta`

```sql
-- Many-to-many: which TAs are assigned to which assignments
CREATE TABLE assignment_ta (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  ta_id         UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, ta_id)
);
```

#### 9.2.7 `demo_slots`

```sql
CREATE TABLE demo_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  ta_id         UUID        NOT NULL REFERENCES users(id),
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  venue         VARCHAR(512),
  capacity      SMALLINT    NOT NULL DEFAULT 1,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'booked', 'completed', 'cancelled')),
  version       INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_slot_times CHECK (ends_at > starts_at)
);

CREATE INDEX idx_demo_slots_assignment ON demo_slots (assignment_id);
CREATE INDEX idx_demo_slots_ta         ON demo_slots (ta_id);
CREATE INDEX idx_demo_slots_status     ON demo_slots (status, starts_at);
```

#### 9.2.8 `bookings`

```sql
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID        NOT NULL REFERENCES demo_slots(id),
  student_id      UUID        NOT NULL REFERENCES users(id),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id),
  status          VARCHAR(30) NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked', 'completed', 'no_show',
                                      'cancelled_by_student', 'cancelled_by_ta')),
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   VARCHAR(50),
  cancel_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce at most one active booking per student per assignment
CREATE UNIQUE INDEX uq_active_booking
  ON bookings (student_id, assignment_id)
  WHERE status = 'booked';

CREATE INDEX idx_bookings_slot      ON bookings (slot_id);
CREATE INDEX idx_bookings_student   ON bookings (student_id);
CREATE INDEX idx_bookings_assignment ON bookings (assignment_id);
CREATE INDEX idx_bookings_status    ON bookings (status);
```

**Note:** The partial unique index `uq_active_booking` enforces the business rule "at most one active booking per student per assignment" at the database level, providing a safety net even if the application-layer check fails under race conditions.

#### 9.2.9 `evaluations`

```sql
CREATE TABLE evaluations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID        NOT NULL UNIQUE REFERENCES bookings(id),
  ta_id                 UUID        NOT NULL REFERENCES users(id),
  rubric_scores         JSONB       NOT NULL DEFAULT '{}',
  total_score           NUMERIC(5,2),
  private_note          TEXT,
  submitted_at          TIMESTAMPTZ,
  visible_to_instructor BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluations_booking ON evaluations (booking_id);
CREATE INDEX idx_evaluations_ta      ON evaluations (ta_id);
CREATE INDEX idx_evaluations_visible ON evaluations (visible_to_instructor)
  WHERE visible_to_instructor = true;
```

#### 9.2.10 `notifications`

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user   ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id)
  WHERE read_at IS NULL;
```

#### 9.2.11 `audit_events`

```sql
CREATE TABLE audit_events (
  id          BIGSERIAL   PRIMARY KEY,  -- Sequential for efficient log streaming
  actor_id    UUID        REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id   UUID        NOT NULL,
  event_type  VARCHAR(50) NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity   ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_actor    ON audit_events (actor_id);
CREATE INDEX idx_audit_created  ON audit_events (created_at DESC);
```

**Note:** `audit_events` uses `BIGSERIAL` (not UUID) as the primary key because it is an append-only log with no cross-system references, and sequential IDs provide efficient range scans for log streaming.

### 9.3 Entity Relationship Diagram (Logical)

```
users ───────────── enrollments ─────────── courses
  │                                             │
  │  (owner_id)                                 │
  │◄────────────────────────────────────────────┘
  │
  ├────────── assignment_ta ───────── assignments
  │                                       │
  │                              ┌────────┴─────────┐
  │                           demo_slots         (course_id)
  │                              │
  │  (student_id)           (slot_id)
  └────────────────────── bookings
                               │
                           evaluations
                               │
                          audit_events (entity_id → any)
```

### 9.4 Migration Strategy

- Migrations use **numbered, timestamped SQL files** (`001_create_users.sql`, `002_create_courses.sql`, etc.).
- Applied via `node-pg-migrate` (CLI tool integrated into the NestJS startup sequence in non-production environments).
- Production migrations are applied manually via a CI pipeline step before the new application version is deployed (blue-green strategy).
- Rollback scripts accompany each migration file.

---

## 10. API Design

### 10.1 Design Conventions

- **Base path:** `/api/v1`
- **Content type:** `application/json` for all request and response bodies.
- **Authentication:** All endpoints (except `/auth/*`) require a valid session cookie. Unauthenticated requests return `401 Unauthorized`.
- **Authorisation:** Role violations return `403 Forbidden` with a structured error body.
- **Validation errors:** Return `422 Unprocessable Entity` with a `errors` array.
- **Not found:** `404 Not Found` with `{ error: { code: 'NOT_FOUND', message: '...' } }`.
- **Conflict:** `409 Conflict` for duplicate booking or over-capacity attempts.
- **Success responses** always include a root key matching the resource name (e.g., `{ "booking": { ... } }`).
- **Pagination:** Cursor-based pagination for list endpoints (`?cursor=<id>&limit=<n>`).
- All timestamps returned as **ISO 8601 UTC strings**.

### 10.2 Authentication Endpoints

```
GET  /api/v1/auth/google
  → Redirects to Google OAuth consent screen

GET  /api/v1/auth/google/callback?code=&state=
  → Validates OAuth code, checks allowlist, upserts user, sets session cookie
  → 302 Redirect to /dashboard on success
  → 302 Redirect to /login?error=access_denied on allowlist failure

POST /api/v1/auth/logout
  → Destroys server session, clears cookie
  → 204 No Content

GET  /api/v1/auth/me
  → Returns current user profile
  Response 200:
  {
    "user": {
      "id": "uuid",
      "name": "Alice Smith",
      "email": "alice@university.edu",
      "role": "student",
      "status": "active"
    }
  }
```

### 10.3 Course Endpoints

```
GET  /api/v1/courses
  → Returns courses visible to the current user
  Query: ?term=2026-S1
  Response 200: { "courses": [...], "meta": { "total": N } }

POST /api/v1/courses                             [admin]
  Body: { "code": "CS101", "title": "Intro to CS", "term": "2026-S1", "owner_id": "uuid" }
  Response 201: { "course": { "id": "...", ... } }

GET  /api/v1/courses/:courseId
  Response 200: { "course": { ... } }

POST /api/v1/courses/:courseId/enrollments       [admin]
  Body: { "user_id": "uuid", "role_in_course": "student" }
  Response 201: { "enrollment": { ... } }

POST /api/v1/courses/:courseId/enrollments/bulk  [admin]
  Body: { "csv_data": "email,role\nalice@uni.edu,student\n..." }
  Response 207: {
    "results": [
      { "email": "alice@uni.edu", "status": "created" },
      { "email": "bob@uni.edu",   "status": "already_enrolled" }
    ]
  }
```

### 10.4 Assignment Endpoints

```
GET  /api/v1/courses/:courseId/assignments
  Response 200: { "assignments": [...] }

POST /api/v1/courses/:courseId/assignments        [ta, instructor]
  Body: {
    "title": "Project Demo",
    "demo_window_start": "2026-05-01T09:00:00Z",
    "demo_window_end":   "2026-05-05T17:00:00Z",
    "slot_duration_min": 20,
    "capacity": 1,
    "freeze_before_min": 60,
    "max_cancellations": 1,
    "default_venue": "Lab 301"
  }
  Response 201: { "assignment": { "id": "...", ... } }

GET  /api/v1/assignments/:assignmentId
  Response 200: { "assignment": { ... } }

PATCH /api/v1/assignments/:assignmentId           [ta, instructor]
  Body: { "is_published": true }
  Response 200: { "assignment": { ... } }
```

### 10.5 Slot Endpoints

```
POST /api/v1/assignments/:assignmentId/slots/generate   [ta]
  → Generates draft slots from demo window + slot_duration
  Response 201: { "slots": [...], "count": N }

GET  /api/v1/assignments/:assignmentId/slots
  → Students see only published/available slots
  → TAs see all statuses for their assignment
  Query: ?status=published&date=2026-05-02
  Response 200: {
    "slots": [
      {
        "id": "uuid",
        "starts_at": "2026-05-02T09:00:00Z",
        "ends_at":   "2026-05-02T09:20:00Z",
        "venue": "Lab 301",
        "capacity": 1,
        "booked_count": 0,
        "status": "published",
        "ta": { "id": "uuid", "name": "Bob TA" }
      }
    ]
  }

PATCH /api/v1/slots/:slotId                             [ta]
  Body: { "status": "published" }   OR   { "venue": "Lab 405" }
  Response 200: { "slot": { ..., "version": 2 } }

GET  /api/v1/slots/:slotId/bookings                     [ta]
  → Returns all bookings for the slot (TA day view)
  Response 200: { "bookings": [...] }
```

### 10.6 Booking Endpoints

```
POST /api/v1/bookings                                   [student]
  Body: { "slot_id": "uuid" }
  Response 201: {
    "booking": {
      "id": "uuid",
      "slot": {
        "id": "uuid",
        "starts_at": "2026-05-02T09:00:00Z",
        "ends_at":   "2026-05-02T09:20:00Z",
        "venue": "Lab 301",
        "ta": { "name": "Bob TA" }
      },
      "assignment": { "id": "uuid", "title": "Project Demo" },
      "status": "booked",
      "booked_at": "2026-04-29T14:32:11Z"
    }
  }

GET  /api/v1/bookings                                   [student]
  → Returns the student's booking history across all assignments
  Response 200: { "bookings": [...] }

GET  /api/v1/bookings/:bookingId                        [student, ta]
  Response 200: { "booking": { ... } }

POST /api/v1/bookings/:bookingId/reschedule             [student]
  Body: { "new_slot_id": "uuid" }
  Response 200: { "booking": { ... } }  [new booking record]
  Error 422: {
    "error": {
      "code": "FREEZE_WINDOW_ACTIVE",
      "message": "Rescheduling is not permitted. The freeze window ends at 2026-05-02T08:00:00Z."
    }
  }

DELETE /api/v1/bookings/:bookingId                      [student]
  Body: { "cancel_reason": "other", "cancel_note": "Clash with exam." }
  Response 204: No Content
  Error 422: {
    "error": {
      "code": "CANCELLATION_QUOTA_EXCEEDED",
      "message": "You have used all 1 permitted cancellation(s) for this assignment."
    }
  }

PATCH  /api/v1/bookings/:bookingId/status               [ta]
  Body: { "status": "completed" }  OR  { "status": "no_show" }
  Response 200: { "booking": { ... } }
```

### 10.7 Evaluation Endpoints

```
POST /api/v1/evaluations                               [ta]
  Body: {
    "booking_id": "uuid",
    "rubric_scores": { "design": 8, "functionality": 9, "presentation": 7 },
    "total_score": 24,
    "private_note": "Strong demo, minor UI issues."
  }
  Response 201: { "evaluation": { "id": "uuid", "visible_to_instructor": false, ... } }

PATCH /api/v1/evaluations/:evaluationId                [ta]
  Body: { "total_score": 25, "private_note": "Revised after review." }
  Response 200: { "evaluation": { ... } }
  Error 403 (if already submitted):
  { "error": { "code": "EVALUATION_ALREADY_SUBMITTED", "message": "..." } }

POST /api/v1/assignments/:assignmentId/evaluations/submit  [ta]
  Response 200: {
    "submitted": 42,
    "submitted_at": "2026-05-10T16:00:00Z"
  }

GET  /api/v1/courses/:courseId/evaluations             [instructor]
  Query: ?assignment_id=uuid&submitted=true
  Response 200: { "evaluations": [...] }
```

### 10.8 Export Endpoints

```
GET  /api/v1/courses/:courseId/export                  [instructor]
  Query: ?format=csv  (or json)  &assignment_id=uuid
  Response 200:
    Content-Type: text/csv
    Content-Disposition: attachment; filename="slotty-export-{courseCode}-{date}.csv"
    [Streaming CSV body]
```

### 10.9 Notification Endpoints

```
GET  /api/v1/notifications                             [student, ta]
  Query: ?unread=true&limit=20&cursor=uuid
  Response 200: { "notifications": [...], "unread_count": N }

PATCH /api/v1/notifications/:notificationId/read       [student, ta]
  Response 200: { "notification": { ..., "read_at": "..." } }

POST /api/v1/notifications/push/subscribe              [student]
  Body: { "subscription": { ... } }   [Web Push subscription object]
  Response 204

GET  /api/v1/notifications/sse                         [student, ta]
  → Server-Sent Events stream; yields notification and slot_update events
  Content-Type: text/event-stream
```

### 10.10 Audit Endpoints

```
GET  /api/v1/audit                                     [admin]
  Query: ?entity_type=booking&entity_id=uuid&limit=50
  Response 200: { "events": [...] }
```

### 10.11 Error Response Standard

All error responses follow a consistent envelope:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description of the problem.",
    "details": {}
  },
  "requestId": "uuid-for-tracing"
}
```

HTTP status codes used: `400` (bad request), `401` (unauthenticated), `403` (forbidden), `404` (not found), `409` (conflict), `422` (validation / business rule), `500` (internal server error).

---

## 11. Technology Stack

### 11.1 Stack Summary

| Layer | Technology | Version | Justification |
|---|---|---|---|
| Frontend framework | React | 18.x | Mature ecosystem, team familiarity, strong TypeScript support. |
| Frontend build | Vite | 5.x | Fast HMR, native ESM, first-class PWA support via `vite-plugin-pwa`. |
| Frontend routing | React Router | 6.x | De-facto standard; file-system or code-based routing. |
| Server state | TanStack Query | 5.x | Purpose-built for async server state; replaces Redux for API data. |
| UI components | shadcn/ui + Tailwind CSS | Latest | Accessible, unstyled primitives + utility CSS; avoids opinionated design lock-in. |
| Backend framework | NestJS | 10.x | Structured, DI-based TypeScript framework; aligns with enterprise patterns. |
| Runtime | Node.js | 20 LTS | Active LTS; strong async I/O for API workloads. |
| Language | TypeScript | 5.x | Type safety across frontend and backend; shared type definitions possible. |
| ORM | TypeORM | 0.3.x | Mature, NestJS-native integration; supports migrations and query builder. |
| Database | PostgreSQL | 15+ | ACID compliance; advisory locks; JSONB for rubric scores; mature extension ecosystem. |
| Cache / Session / Queue | Redis | 7.x | Single dependency serving three roles; reduces infrastructure complexity. |
| Session management | `express-session` + `connect-redis` | Latest | HttpOnly cookie sessions backed by Redis; scalable and stateless at the app tier. |
| Job queue | BullMQ | 4.x | Redis-backed queue; retries, delays, scheduled jobs; production-tested. |
| Auth | Passport.js (`passport-google-oauth20`) | Latest | Standard OAuth2 integration; extensible for future strategies. |
| Email | Nodemailer | 6.x | SMTP-agnostic; works with SendGrid, Mailgun, university SMTP servers. |
| Push notifications | `web-push` | Latest | VAPID-based Web Push; no third-party dependency at runtime. |
| CSV generation | `csv-stringify` | 6.x | Streaming CSV; handles large datasets without memory pressure. |
| Reverse proxy | Nginx | 1.25 | TLS termination, rate limiting, static asset serving, upstream proxy. |
| Containerisation | Docker + Docker Compose | 24.x / 2.x | Reproducible environments; Compose for pilot deployment. |
| CI/CD | GitHub Actions | — | Tightly integrated with GitHub; free for university-tier usage. |
| Testing (unit) | Vitest (FE) + Jest (BE) | Latest | Vite-native Vitest for FE; Jest for NestJS testing ecosystem. |
| Testing (e2e) | Playwright | 1.x | Cross-browser; supports mobile viewports; component testing mode. |
| API documentation | Swagger / OpenAPI 3.1 | via `@nestjs/swagger` | Auto-generated from decorators; served at `/api/docs`. |
| Monitoring | Prometheus + Grafana | Latest | Pull-based metrics; standard dashboards; no SaaS lock-in. |
| Logging | Winston + Loki | Latest | Structured JSON logs; Loki for aggregation; Grafana for querying. |
| Error tracking | Sentry | Latest SDK | Source-map-enabled stack traces; session replay optional. |

### 11.2 Shared Type Definitions

A workspace monorepo structure (using **pnpm workspaces**) is recommended to share TypeScript interfaces between frontend and backend without duplication:

```
slotty/
├── packages/
│   ├── api-types/          # Shared TS interfaces (DTOs, response shapes)
│   ├── backend/            # NestJS application
│   └── frontend/           # React application
├── pnpm-workspace.yaml
└── package.json            # Root scripts: build, test, lint
```

This eliminates the most common class of frontend–backend integration bugs: mismatched field names and types.

### 11.3 Justification of Key Choices

**PostgreSQL over MongoDB:** The data model is fundamentally relational (users enrolled in courses, bookings linked to slots linked to assignments). PostgreSQL's row-level locking is essential for the atomic booking guarantee. JSONB columns (`rubric_scores`, `audit_events.payload`) handle the semi-structured data cases without sacrificing relational integrity.

**NestJS over Express:** The application will be built by a small team over multiple phases. NestJS's enforced module structure, dependency injection, and built-in support for guards, interceptors, and pipes provide structural discipline that prevents architectural drift in a growing codebase. The performance overhead over raw Express is negligible for this load profile.

**BullMQ over direct SMTP calls:** Decoupling notification dispatch from the booking transaction ensures that email provider latency (typically 100–500 ms) does not affect the p95 booking confirmation target of 1,500 ms. BullMQ also provides automatic retry with exponential backoff for transient delivery failures.

**SSE over WebSockets:** Slot availability updates are unidirectional. SSE uses standard HTTP/1.1, works through corporate firewalls, and requires no additional protocol upgrade logic. For this use case (≤50 concurrent users per TA session), SSE handles the concurrency without issue.

---

## 12. Security Design

### 12.1 Authentication Security

- **OAuth state parameter:** A cryptographically random `state` value is generated before each OAuth redirect and validated on callback to prevent CSRF attacks on the OAuth flow.
- **Session fixation prevention:** The session ID is regenerated immediately after successful login.
- **Session TTL:** Default 8 hours; configurable via environment variable. Sessions are invalidated on logout.
- **Allowlist check:** Performed server-side on every login, not only on account creation, to handle retroactive allowlist removals.

### 12.2 Transport Security

- All traffic served over HTTPS. Nginx is configured with:
  - TLS 1.2 minimum; TLS 1.3 preferred.
  - HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
  - OCSP stapling enabled.
- HTTP-only cookie attributes: `HttpOnly; Secure; SameSite=Strict`.

### 12.3 Application Security Headers

Nginx and NestJS (`helmet` middleware) set the following response headers on all API responses:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 12.4 Input Validation

- All API inputs are validated using `class-validator` DTOs at the NestJS controller layer before reaching services.
- TypeORM parameterised queries are mandatory; raw SQL concatenation is prohibited by linting rules (custom ESLint rule).
- File upload (CSV import) is limited to 1 MB; MIME type is validated; content is parsed with strict column definitions.

### 12.5 Role-Based Access Control

- The `RolesGuard` is applied globally and checks the `@Roles()` decorator on each route handler.
- Resource-level ownership is validated within the service layer (e.g., a TA may only modify their own slots).
- Students are prevented from accessing other students' booking data via service-layer filtering on `student_id = currentUser.id`.

### 12.6 Rate Limiting

Nginx enforces rate limits:
- `/api/v1/auth/*` — 10 requests per minute per IP.
- `/api/v1/bookings` (POST) — 5 requests per minute per authenticated user.
- All other API endpoints — 120 requests per minute per authenticated user.

### 12.7 Secrets Management

- All secrets (database credentials, Google OAuth client secret, Redis password, SMTP credentials, VAPID keys) are stored as **environment variables**, never in version control.
- A `.env.example` file with placeholder values is committed to document required variables.
- For production: secrets are injected via Kubernetes Secrets or a cloud-native secrets manager (HashiCorp Vault, if available).

### 12.8 Data Privacy

- Evaluation marks are isolated to the TA until submission via the `visible_to_instructor` flag.
- The private note field (`private_note`) is never returned in student-facing API responses; the API serialiser explicitly excludes it.
- Students can only retrieve their own bookings; the API enforces this at the query level, not only the application level.
- Audit events are accessible only to administrators; they are not exposed to students or TAs via the API.

---

## 13. Scalability Considerations

### 13.1 Pilot Scale Profile

The initial pilot is designed for a single department, estimated at:
- 500–2,000 enrolled students across active courses.
- 10–50 TAs across all courses.
- 5–20 Instructors.
- Peak concurrent booking sessions: 50–150 (during a demo window opening).

This load profile is comfortably served by a single Node.js process with a single PostgreSQL instance. The architecture is designed to scale horizontally without redesign.

### 13.2 Horizontal Scaling Path

**Application tier:** NestJS is stateless at the application layer (sessions stored in Redis). Multiple Node.js instances can run behind Nginx (or a cloud load balancer) without shared in-memory state. Scaling is achieved by increasing the number of application containers.

**Database tier:** PostgreSQL read replicas can be added to offload read-heavy queries (slot browsing, notification queries). The ORM connection pool is configured to route read-only queries to replicas. Write operations (bookings, evaluations) continue to target the primary.

**Queue tier:** BullMQ workers can scale independently by running additional worker containers. Redis Cluster is the upgrade path for queue persistence at very high notification volumes.

**SSE connections:** At pilot scale, SSE connections per instance are well within Node.js limits. At higher scale, a Redis Pub/Sub channel can broadcast slot update events to all application instances, which then fan out to their connected SSE clients.

### 13.3 Database Query Optimisation

- The partial unique index on `bookings (student_id, assignment_id) WHERE status = 'booked'` ensures the duplicate booking check is O(1) without scanning all historical bookings.
- Slot availability queries use the composite index `(assignment_id, status, starts_at)` to efficiently return available slots for a given assignment, date-ordered.
- Redis caches slot availability counts (invalidated on each booking or cancellation) to reduce database load during peak browsing periods. Cache TTL: 30 seconds.

### 13.4 Export Performance

For large courses (500+ students), exports are generated as streams to avoid loading the entire dataset into memory. The `csv-stringify` streaming API writes rows to the HTTP response as they are fetched, preventing out-of-memory errors.

---

## 14. DevOps and Deployment Strategy

### 14.1 Environment Strategy

| Environment | Purpose | Infrastructure |
|---|---|---|
| `local` | Individual developer machines | Docker Compose (`docker-compose.dev.yml`) |
| `dev` | Shared integration testing | Docker Compose on a shared VM |
| `staging` | Pre-release validation; mirrors production | Docker Compose or Kubernetes namespace |
| `production` | Live pilot deployment | Docker Compose (MVP) → Kubernetes (Phase 2) |

### 14.2 Docker Compose Configuration (MVP)

```yaml
# docker-compose.yml (production)
version: "3.9"
services:
  nginx:
    image: nginx:1.25-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
      - frontend_dist:/usr/share/nginx/html:ro
    depends_on: [api]

  api:
    image: slotty-api:${VERSION}
    env_file: .env.production
    depends_on: [postgres, redis]
    restart: unless-stopped
    deploy:
      replicas: 2

  worker:
    image: slotty-api:${VERSION}
    command: ["node", "dist/jobs/worker.js"]
    env_file: .env.production
    depends_on: [redis, postgres]
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]
    env_file: .env.production
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  frontend_dist:
```

### 14.3 Deployment Procedure (MVP)

```
1. CI pipeline builds and tests new image → tags as slotty-api:{git-sha}
2. Image pushed to container registry (GitHub Container Registry)
3. Deployment engineer pulls image on production server:
     docker pull ghcr.io/primeinnovators/slotty-api:{git-sha}
4. Run database migrations:
     docker run --rm slotty-api:{git-sha} npm run migrate:prod
5. Update VERSION in .env.production → {git-sha}
6. Rolling restart:
     docker-compose up -d --no-deps api worker
7. Monitor logs for 5 minutes:
     docker-compose logs -f api worker
8. Verify health check: GET /api/v1/health → 200
```

### 14.4 Nginx Configuration Highlights

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_zone $http_cookie_session zone=api:10m rate=120r/m;

server {
  listen 443 ssl http2;
  ssl_certificate     /etc/ssl/slotty.crt;
  ssl_certificate_key /etc/ssl/slotty.key;
  ssl_protocols       TLSv1.2 TLSv1.3;

  # Static assets (React SPA)
  root /usr/share/nginx/html;
  try_files $uri /index.html;  # SPA fallback

  location /api/ {
    proxy_pass         http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection '';  # SSE: disable buffering
    proxy_buffering    off;
    proxy_cache        off;

    limit_req zone=api burst=20 nodelay;
  }

  location /api/v1/auth/ {
    proxy_pass http://api:3000;
    limit_req  zone=auth burst=5 nodelay;
  }
}
```

---

## 15. CI/CD Pipeline

### 15.1 Pipeline Overview

The CI/CD pipeline uses **GitHub Actions** with three distinct workflows:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to any branch; PR to `main` | Lint, type-check, unit tests, integration tests |
| `build.yml` | Push to `main`; manual dispatch | Build Docker image, push to registry, deploy to staging |
| `release.yml` | Git tag `v*.*.*` | Deploy to production after manual approval |

### 15.2 CI Workflow (`ci.yml`)

```yaml
name: CI
on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r lint
      - run: pnpm -r typecheck

  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env: { POSTGRES_DB: slotty_test, POSTGRES_PASSWORD: test }
        options: --health-cmd pg_isready
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter backend test:unit
      - run: pnpm --filter backend test:integration
      - uses: codecov/codecov-action@v4

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter frontend test
      - run: pnpm --filter frontend build

  e2e:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: docker-compose -f docker-compose.test.yml up -d
      - run: pnpm --filter frontend e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### 15.3 Build and Deploy Workflow (`build.yml`)

```yaml
name: Build and Deploy to Staging
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/primeinnovators/slotty-api
          tags: |
            type=sha,prefix=
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: deploy
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/slotty
            VERSION=${{ needs.build.outputs.image-tag }} docker-compose up -d api worker
```

### 15.4 Branch and Merge Strategy

- **`main`** is the production branch; protected from direct push; requires passing CI and one approving review.
- Feature branches: `feature/<ticket-id>-short-description`.
- Hotfix branches: `hotfix/<ticket-id>-description`.
- **Squash merge** from feature branches to `main` for a clean linear history.
- **Conventional Commits** enforced via `commitlint` (`feat:`, `fix:`, `chore:`, `docs:`, etc.).
- Changelog auto-generated from commit messages via `semantic-release`.

---

## 16. Testing Strategy

### 16.1 Testing Pyramid

```
         ┌───────────┐
         │  E2E / UI │   ~20 tests  (critical user journeys)
         └─────┬─────┘
         ┌─────┴──────────┐
         │  Integration    │   ~80 tests  (API endpoints + DB)
         └─────┬───────────┘
      ┌────────┴────────────────┐
      │       Unit Tests        │   ~300+ tests (services, utilities)
      └─────────────────────────┘
```

### 16.2 Unit Tests

**Backend (Jest + NestJS Testing Module):**

Focus areas:
- `BookingService`: Freeze window validation, cancellation quota enforcement, duplicate booking detection.
- `SlotService`: Slot generation algorithm, venue change propagation logic.
- `EvaluationService`: Pre-submission visibility enforcement, submission state transition.
- `NotificationService`: Correct channel selection, job payload construction.
- `AuditService`: Event payload serialisation.

Example unit test (booking freeze window):
```typescript
describe('BookingService.validateFreezeWindow', () => {
  it('should throw when slot starts within freeze window', () => {
    const slot = { starts_at: addMinutes(new Date(), 30) };
    const assignment = { freeze_before_min: 60 };
    expect(() => service.validateFreezeWindow(slot, assignment))
      .toThrow(UnprocessableEntityException);
  });

  it('should pass when slot is outside the freeze window', () => {
    const slot = { starts_at: addMinutes(new Date(), 120) };
    const assignment = { freeze_before_min: 60 };
    expect(() => service.validateFreezeWindow(slot, assignment)).not.toThrow();
  });
});
```

**Frontend (Vitest + React Testing Library):**

Focus areas:
- `useCreateBooking` hook: Optimistic update and rollback behaviour.
- `SlotBrowser` component: Renders available slots; disabled state for full slots.
- `CancellationModal` component: Validates "Other" reason requires free-text note.
- `useAuth` context: Redirect behaviour for unauthenticated routes.

### 16.3 Integration Tests

Integration tests run against a real PostgreSQL instance (provisioned by Docker in CI). They test the full request pipeline from controller to database and back.

Key test suites:
- **Booking atomicity:** 50 concurrent POST `/api/v1/bookings` requests to a capacity-1 slot; assert exactly 1 success and 49 `409 Conflict` responses.
- **Reschedule rollback:** Simulate a failed rebook (target slot at capacity); assert original booking is preserved.
- **Allowlist enforcement:** Requests with non-allowlisted accounts receive `403`.
- **Venue change notification:** PATCH slot venue → assert notification jobs enqueued for all booked students.
- **Export completeness:** Seed 100 bookings + evaluations → GET export → assert row count and schema.

### 16.4 End-to-End Tests (Playwright)

Playwright tests cover the five critical user journeys:

1. **Student books a slot** — Login → select assignment → browse slots → confirm booking → receive confirmation.
2. **Student reschedules** — Navigate to booking → reschedule → confirm new slot.
3. **Student cancels** — Navigate to booking → cancel → select reason → confirm.
4. **TA records evaluation** — Login as TA → day view → mark complete → enter rubric → submit batch.
5. **Instructor exports** — Login as Instructor → course overview → export CSV → verify download.

Playwright is configured to run tests in Chromium, Firefox, and WebKit. Mobile viewport tests run on a 390×844 (iPhone 14) viewport profile.

### 16.5 Performance Tests

**Tool:** k6 (load testing framework).

Scenarios:
- **Booking storm:** 150 virtual users simultaneously attempt to book the same newly-published slot. Target: p95 response time ≤ 1,500 ms; booking collision rate = 0%.
- **Slot browsing:** 500 virtual users browse slot availability for the same assignment. Target: p95 response time ≤ 500 ms.

Performance tests run weekly in the staging environment via a scheduled GitHub Actions workflow.

### 16.6 Accessibility Tests

- **`axe-core`** is integrated into Playwright e2e tests via `@axe-core/playwright`. Every page visited during an e2e test is audited automatically.
- CI fails if any `critical` or `serious` violations are detected.

---

## 17. Monitoring and Logging

### 17.1 Structured Logging

All application log output is **structured JSON** via Winston. Each log entry includes:

```json
{
  "timestamp": "2026-04-29T14:32:11.000Z",
  "level": "info",
  "message": "Booking created",
  "context": "BookingService",
  "requestId": "uuid",
  "userId": "uuid",
  "bookingId": "uuid",
  "slotId": "uuid",
  "durationMs": 342
}
```

Log levels used: `error` (5xx conditions), `warn` (4xx, deprecations), `info` (state-changing operations), `debug` (not enabled in production).

Logs are shipped to **Grafana Loki** via the Promtail log collector. Grafana provides a LogQL query interface for searching and alerting.

### 17.2 Metrics

**Prometheus** scrapes metrics from the NestJS application via the `@willsoto/nestjs-prometheus` module.

Key metrics exposed:
- `http_requests_total{method, route, status}` — Request count by route and status.
- `http_request_duration_seconds{method, route}` — Histogram; drives p95 latency dashboards.
- `booking_created_total` — Counter for successful bookings.
- `booking_collision_total` — Counter for `409 Conflict` responses on booking attempts.
- `notification_queue_size` — BullMQ queue depth.
- `notification_job_duration_seconds` — Email and push delivery latency.

**Grafana Dashboards:**

1. **System Overview:** Request rate, error rate, p50/p95/p99 latency by route.
2. **Booking Health:** Bookings per assignment over time, collision rate, freeze window violations.
3. **Queue Monitor:** Notification queue depth, job success/failure rate, failed job inventory.
4. **Database:** Connection pool utilisation, query latency (via `pg_stat_statements`).

### 17.3 Alerting

Grafana Alertmanager is configured to notify the on-call engineer via:

| Alert | Condition | Channel |
|---|---|---|
| High error rate | 5xx rate > 1% over 5 min | Slack + Email |
| Booking p95 latency | > 2,000 ms over 5 min | Slack |
| Queue depth | > 500 jobs | Slack |
| Database connection pool | > 80% utilised | Slack |
| Failed notification jobs | > 10 per hour | Email |

### 17.4 Health Check Endpoint

```
GET /api/v1/health
Response 200:
{
  "status": "ok",
  "version": "1.2.3",
  "timestamp": "2026-04-29T14:32:11Z",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "queue": "ok"
  }
}
```

Used by Nginx as the upstream health check and by the deployment procedure as the post-deploy verification step.

### 17.5 Error Tracking

**Sentry** is integrated in both the frontend (browser SDK) and backend (NestJS SDK). Every uncaught exception and unhandled rejection is captured with:
- Full stack trace with source map resolution.
- Request context (route, method, HTTP status).
- User context (user ID, role — never PII like email in error payloads).
- Release version (linked to git SHA).

Sentry alerts are routed to the engineering Slack channel for triage.

---

## 18. Phased Implementation Roadmap

### 18.1 Overview

| Phase | Duration | Focus | Key Deliverables |
|---|---|---|---|
| MVP | Weeks 1–13 | Core booking and evaluation | All PRD MVP features |
| Phase 2 | Weeks 14–22 | Waitlist, health score, group bookings | PRD Phase 2 features |
| Phase 3 | Weeks 23–28 | Viva checklist, anonymous feedback | PRD Phase 3 features |

### 18.2 MVP Milestones

#### Milestone 1 — Foundation (Weeks 1–3)

**Goal:** Runnable skeleton with authentication and data model in place.

Tasks:
- Monorepo setup (pnpm workspaces, shared `api-types` package).
- NestJS project scaffold with all modules defined (empty).
- React project scaffold with router and auth provider.
- PostgreSQL schema: all tables created via migrations.
- Google OAuth flow end-to-end (login → session → allowlist check → `/dashboard`).
- Docker Compose development environment functional.
- GitHub Actions CI pipeline: lint + typecheck passing.

Acceptance: A developer can log in with an approved Google account and land on a (placeholder) dashboard.

#### Milestone 2 — Course and Assignment Management (Weeks 4–5)

**Goal:** Administrators can set up courses; TAs can configure assignments.

Tasks:
- Admin API: Create course, enroll users, CSV import.
- Assignment API: CRUD with full configuration fields.
- Frontend: Course list, assignment configuration form (TA).
- Integration tests for course/assignment APIs.

Acceptance: An administrator can import 50 students via CSV; a TA can create an assignment with all configuration fields; an enrolled student can see the assignment in their dashboard.

#### Milestone 3 — Slot Management (Weeks 6–7)

**Goal:** TAs can generate, publish, and manage slots.

Tasks:
- Slot generation algorithm + API.
- Slot publish/unpublish/cancel lifecycle.
- Venue update with version increment.
- Frontend: TA slot management view (list, status toggle, venue edit).
- Frontend: Student slot browser (published slots, availability indicator).
- SSE endpoint for real-time slot availability updates.

Acceptance: A TA can generate 20 slots for a demo window and publish 15; a student sees exactly 15 available slots in real time; venue update propagates within 5 seconds to a browsing student.

#### Milestone 4 — Booking Engine (Weeks 8–9)

**Goal:** Students can book, reschedule, and cancel; atomicity guaranteed.

Tasks:
- Booking creation with pessimistic lock.
- Reschedule atomic flow.
- Cancellation with reason and quota enforcement.
- TA booking status updates (completed, no-show).
- Performance test: booking storm (150 concurrent → 1 booking, 0 collisions).
- Frontend: Booking confirmation flow, booking history, reschedule and cancel modals.

Acceptance: Load test passes; all booking business rules enforced; student journey completable in under 3 minutes on mobile.

#### Milestone 5 — Notifications (Week 10)

**Goal:** Students receive all required notification types.

Tasks:
- BullMQ queue and worker setup.
- Nodemailer SMTP integration.
- Web Push VAPID setup.
- In-app notification store + SSE delivery.
- Reminder cron job.
- Frontend: Notification centre, push permission prompt.

Acceptance: Booking confirmation email arrives within 30 seconds; venue change notification reaches all affected students; reminder fires at configured lead time.

#### Milestone 6 — Evaluation (Week 11)

**Goal:** TAs can record and submit evaluations; Instructors can review.

Tasks:
- Evaluation CRUD API.
- Batch submission endpoint.
- Instructor review API (post-submission only).
- Frontend: TA day view with mark recording form; Instructor evaluation review table.

Acceptance: TA can record rubric scores for 20 bookings and submit; Instructor sees all 20 records post-submission; pre-submission records are not visible to Instructor.

#### Milestone 7 — Export and Audit (Week 12)

**Goal:** Instructors can export clean data; all actions are audited.

Tasks:
- CSV and JSON export streaming API.
- Audit event appenders in all services.
- Frontend: Instructor export button with format selector.
- Export test: 500-record export schema validation.

Acceptance: Instructor exports 200 records as CSV in under 5 seconds; every state-changing operation produces an audit record.

#### Milestone 8 — Hardening and Launch (Week 13)

**Goal:** Production-ready quality and deployment.

Tasks:
- Full Playwright e2e test suite for all 5 critical journeys.
- Accessibility audit (axe-core); resolve all critical/serious violations.
- Lighthouse performance audit (TTI ≤ 3,000 ms; PWA score ≥ 90).
- Penetration testing checklist (OWASP Top 10 manual review).
- Production Nginx configuration with TLS certificate.
- Prometheus + Grafana dashboards live.
- Sentry error tracking live.
- Runbook documentation (deployment, rollback, database backup/restore).
- Pilot user onboarding guide (student, TA, Instructor).

Acceptance: All e2e tests green; no critical accessibility violations; production deployment successful; monitoring dashboards populated.

### 18.3 Phase 2 Milestones (Weeks 14–22)

#### Milestone 9 — Waitlist (Weeks 14–16)

Design: A `waitlist` table with `(slot_id, student_id, position, claimed_at, claim_expires_at)`. When a booking is cancelled, a BullMQ job selects the next waitlisted student (by `position`), sets `claimed_at = NOW()` and `claim_expires_at = NOW() + 15 minutes`, and sends a timed claim notification. If the student books within the window, the waitlist record is resolved. If the window expires, the next student is offered the slot.

#### Milestone 10 — Booking Health Score (Weeks 17–18)

A computed view on the Instructor dashboard showing, for each assignment, the proportion of students who have booked, the proportion who have completed demos, and the number of unbooked students relative to available slots. Colour-coded as green / amber / red. Computed on-demand from existing tables; no new stored data required.

#### Milestone 11 — Group Assignments (Weeks 19–22)

A new `groups` table and `group_members` join table. One student is designated the group representative and books on behalf of the group. The booking record carries `group_id`. When the representative's booking status changes (completed, no-show, cancelled), all group members' derived statuses are updated. Rubric scores are recorded against the group booking; individual members inherit the total score.

### 18.4 Phase 3 Milestones (Weeks 23–28)

#### Milestone 12 — Lightweight Viva Checklist (Weeks 23–25)

TAs can attach a `checklist_template` (JSONB array of checklist items) to an assignment. During a live demo, the TA opens the checklist view (single-page step-through) and marks each item checked or unchecked. The completed checklist is stored against the booking but does not affect rubric scores or total marks.

#### Milestone 13 — Anonymous Demo Feedback (Weeks 26–28)

After a booking is marked `completed`, the student receives a notification with a link to a feedback form. Feedback is stored in an `anonymous_feedback` table with `assignment_id` and `ta_id` but without `student_id`. Feedback is aggregated and displayed to TAs and Instructors only at the assignment level, with a minimum aggregation threshold of 5 responses to protect anonymity.

---

## 19. Team Structure

### 19.1 Recommended Team Composition (MVP)

| Role | Headcount | Responsibilities |
|---|---|---|
| Tech Lead / Senior Full-Stack Engineer | 1 | Architecture decisions, code review, API design, unblocking the team. |
| Backend Engineer | 1–2 | NestJS modules, database schema, booking engine, notification worker. |
| Frontend Engineer | 1–2 | React components, TanStack Query integration, PWA configuration, accessibility. |
| QA / Automation Engineer | 1 | Integration test suite, Playwright e2e, performance tests, accessibility audit. |
| DevOps Engineer (part-time, 50%) | 0.5 | Docker configuration, CI/CD pipeline, Nginx, monitoring, deployment. |

**Total FTE:** 5–6.5 across a 13-week MVP.

### 19.2 Collaboration Model

- **Sprint duration:** 2 weeks.
- **Ceremonies:** Sprint planning (Monday, 2 hours), daily standup (15 minutes), sprint review + retrospective (Friday, 2 hours).
- **Issue tracking:** GitHub Issues with a Kanban board. Milestones map to GitHub Milestones.
- **Documentation:** Architectural decisions recorded as **Architecture Decision Records (ADRs)** in `/docs/adr/` within the repository.
- **Code review:** All PRs require at least one approving review before merge. The Tech Lead reviews all PRs touching the booking engine or security-critical code paths.

### 19.3 Onboarding Checklist for New Engineers

1. Clone the monorepo; run `docker-compose up` → verify all services healthy.
2. Run the seed script (`npm run seed:dev`) to populate development data.
3. Read the three most recent ADRs.
4. Review the `api-types` package for the canonical data contracts.
5. Complete one low-complexity "good first issue" ticket with Tech Lead review.

---

## 20. Development Workflow

### 20.1 Local Development Setup

```bash
# Prerequisites: Node.js 20, pnpm 9, Docker Desktop

git clone https://github.com/primeinnovators/slotty
cd slotty
pnpm install

# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Run migrations and seed development data
pnpm --filter backend migration:run
pnpm --filter backend seed:dev

# Start backend (with hot reload)
pnpm --filter backend dev

# Start frontend (with HMR)
pnpm --filter frontend dev
# → http://localhost:5173
```

### 20.2 Environment Variables Reference

```
# Database
DATABASE_URL=postgresql://slotty:password@localhost:5432/slotty_dev

# Redis
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Session
SESSION_SECRET=<random 64 chars>
SESSION_TTL_SECONDS=28800

# Email (SMTP)
SMTP_HOST=smtp.university.edu
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@slotty.university.edu

# Web Push
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@university.edu

# Sentry
SENTRY_DSN=...
SENTRY_ENVIRONMENT=development
```

### 20.3 Code Quality Gates

All code must pass the following before a PR is opened:

```bash
pnpm -r lint          # ESLint with strict TypeScript rules
pnpm -r typecheck     # tsc --noEmit
pnpm -r test          # Jest (BE) + Vitest (FE)
pnpm -r build         # Verify production build succeeds
```

These are enforced by the CI pipeline; PRs that do not pass all checks cannot be merged.

### 20.4 Database Migration Workflow

```bash
# Create a new migration
pnpm --filter backend migration:create add_waitlist_table

# Apply pending migrations (local)
pnpm --filter backend migration:run

# Rollback the last migration
pnpm --filter backend migration:revert

# Generate a migration from entity changes (TypeORM)
pnpm --filter backend migration:generate src/database/migrations/SyncEntities
```

All migrations must be reviewed by the Tech Lead before merge. Migrations that drop columns or tables require a separate "data migration" phase to ensure zero-downtime deployment.

---

## 21. Assumptions and Open Questions

### 21.1 Explicit Assumptions

| # | Assumption | Impact if Wrong |
|---|---|---|
| A1 | The university's SMTP server is accessible from the deployment host without VPN. | Email notifications would require an external SMTP relay (e.g., SendGrid). |
| A2 | The pilot will not exceed 2,000 concurrent registered users in the first academic term. | A single PostgreSQL instance and two API containers is sufficient; Kubernetes migration may need to be expedited. |
| A3 | Students will use modern browsers (Chrome, Firefox, Safari, Edge — versions within 2 years). | Older browser support would require transpilation and polyfill adjustments. |
| A4 | The Google OAuth app approval process will complete before the pilot launch date. | A fallback email/password authentication mechanism would be needed. |
| A5 | The demo window for any single assignment will not exceed 5 days, producing a maximum of ~360 slots at 20-minute duration. | Very large slot counts would require pagination optimisation in the slot browser. |
| A6 | Rubric structure (score categories and weights) is uniform per assignment and defined by the TA at assignment creation. | If rubrics vary per booking or are defined by the Instructor, additional schema and UI complexity is required. |

### 21.2 Open Questions for Stakeholders

| # | Question | Decision Required By |
|---|---|---|
| Q1 | Should students receive an in-app mark summary after the Instructor publishes final grades, or is the current design (export-only) sufficient? | Before Phase 2 begins |
| Q2 | What is the university's approved email domain list for the allowlist? Is a wildcard domain sufficient (e.g., `*.university.edu`)? | Before Milestone 1 |
| Q3 | Is the minimum cancellation reason list defined centrally, or can each Instructor customise it per course? | Before Milestone 4 |
| Q4 | Are TAs permitted to see other TAs' slot bookings within the same assignment, or only their own? (The current PRD is ambiguous.) | Before Milestone 3 |
| Q5 | What are the data retention requirements? Can booking and evaluation data be deleted after a configurable number of years? | Before production launch |
| Q6 | Should the TA day view support a calendar-style layout (timeline), or is a tabular list sufficient for MVP? | Before Milestone 3 |

---

## 22. Glossary

| Term | Definition |
|---|---|
| **Assignment** | A course component that requires a live demonstration, review, or viva from each enrolled student. |
| **Audit Event** | An immutable record of a state-changing operation, stored in `audit_events`. |
| **Booking** | A confirmed reservation of a demo slot by a student for a specific assignment. |
| **Demo Slot (Slot)** | A time-bounded availability window created by a TA, associated with a venue, and bookable by students. |
| **Demo Window** | The date/time range within which all demo slots for an assignment must fall. |
| **Evaluation** | A record of marks, rubric scores, and private notes created by a TA for a completed booking. |
| **Freeze Window** | A configurable period before a slot's start time during which students may not reschedule or cancel. |
| **Instructor** | A course owner who reviews submitted evaluations and exports data. |
| **RBAC** | Role-Based Access Control — the mechanism by which API access is governed based on user role. |
| **Reschedule** | An atomic operation that cancels an existing booking and creates a new one in a single transaction. |
| **Slot Capacity** | The maximum number of students who may book a single slot. |
| **Student** | An enrolled course participant who books demo slots and receives notifications. |
| **TA (Teaching Assistant)** | A course staff member who creates slots, conducts demos, and records evaluations. |
| **Viva** | An oral examination or live demonstration of work; the primary use case driving Slotty's booking model. |
| **Venue** | A physical room identifier or online meeting URL associated with a demo slot. |
| **Venue Version** | An integer incremented on the `demo_slots` table each time the venue is updated, used for concurrency control and change tracking. |

---

*End of Document*

---

**Document Control**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 29 Apr 2026 | Architecture Review Board | Initial draft from PRD v1.0 |

*This document is a living reference. Sections should be updated as architectural decisions evolve during implementation. All material changes require a version increment and a record in the Document Control table above.*
