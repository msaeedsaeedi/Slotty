Now I have a thorough understanding of the entire system. Here's the comprehensive frontend MVP plan:

---

## Slotty Frontend MVP — Implementation Plan

### Current State
- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS (not configured yet), `@repo/ui` with 3 basic components
- **Backend:** NestJS API with all endpoints ready under `/api/v1`
- **Auth:** Google OAuth with session cookies (HttpOnly, SameSite=Strict)
- **Monorepo:** Bun workspaces with Turborepo orchestration

---

### Step 1: Foundation Setup

**1a. Install dependencies**
- `tailwindcss`, `postcss`, `autoprefixer` (configure with `tailwind.config.ts`)
- `@tanstack/react-query` + `@tanstack/react-query-devtools`
- `shadcn/ui` CLI — initialize with default style (Neutral, CSS variables)
- `lucide-react` (icons, comes with shadcn)
- `date-fns` (date formatting), `axios` (HTTP client)
- `@biomejs/biome` already configured

**1b. Configure Tailwind**
- Setup `tailwind.config.ts`, `postcss.config.mjs`
- Add Tailwind directives to `globals.css`
- Wire up CSS variables for shadcn theme

**1c. Create API client layer**
- `src/lib/api.ts` — Axios instance with `baseURL: /api/v1`, `withCredentials: true`
- `src/lib/api/` — Endpoint modules: `auth.ts`, `courses.ts`, `assignments.ts`, `slots.ts`, `bookings.ts`, `evaluations.ts`, `notifications.ts`
- Response/error interceptors for `401` redirect to login

**1d. Set up React Query Provider**
- `src/lib/providers/query-client.tsx` — `QueryClientProvider` with sensible defaults (staleTime: 30s, retry: 1)

**1e. Set up Root Layout**
- Wrap `layout.tsx` with QueryClientProvider
- Add metadata (title: "Slotty")
- Add viewport meta for responsive/mobile

---

### Step 2: Auth & Routing

**2a. Auth Context + Hook**
- `src/lib/hooks/use-auth.tsx` — React Context with `user`, `isLoading`, `login()`, `logout()`
- On mount, call `GET /auth/me` to hydrate session
- Update `layout.tsx` with AuthProvider

**2b. Route structure (App Router)**
```
app/
├── layout.tsx                     # Root layout: providers, header, nav
├── page.tsx                       # Redirect to /dashboard
├── login/
│   └── page.tsx                   # Login page (Google OAuth button)
├── dashboard/
│   └── page.tsx                   # Role-based dashboard redirect
├── courses/
│   ├── page.tsx                   # Course list (all roles)
│   └── [courseId]/
│       ├── page.tsx               # Course detail
│       └── assignments/
│           └── [assignmentId]/
│               ├── page.tsx       # Assignment detail + slot browser (student)
│               └── manage/
│                   └── page.tsx   # TA slot management
├── bookings/
│   ├── page.tsx                   # Student booking history
│   └── [bookingId]/
│       └── page.tsx               # Booking detail
├── evaluations/
│   └── [assignmentId]/
│       └── page.tsx               # TA evaluation recording
├── instructor/
│   └── [courseId]/
│       └── page.tsx               # Instructor review + export
├── notifications/
│   └── page.tsx                   # Notification center
└── admin/
    ├── courses/
    │   ├── page.tsx               # Admin course management
    │   └── [courseId]/
    │       └── page.tsx           # Course detail + enrollments
    ├── users/
    │   └── page.tsx               # User management
    └── allowlist/
        └── page.tsx               # Allowlist management
```

**2c. Middleware** (`src/middleware.ts`)
- Check for auth cookie on protected routes
- Redirect to `/login` if not authenticated
- Role-based redirects

---

### Step 3: Shared Components (shadcn/ui)

Initialize shadcn components needed (all with default neutral theme):
- `button`, `card`, `badge`, `avatar`, `dialog` (modals)
- `select`, `input`, `label`, `form` (forms)
- `table`, `dropdown-menu`
- `sheet` (mobile nav), `tabs`
- `toast` / `sonner` (notifications)
- `separator`, `skeleton` (loading states)
- `calendar`, `popover` (date picking if needed)

Build custom shared components:
- `Header` — nav bar with user menu, role-based navigation, notification badge
- `Sidebar` / `MobileNav` — navigation sidebar
- `SlotCard` — slot display card with booking status
- `BookingCard` — booking summary card
- `EmptyState` — generic empty state component
- `LoadingScreen` — full-page loading spinner

---

### Step 4: Student Flows

**4a. Course & Assignment Listing** (`/dashboard` → `/courses` → `/courses/[courseId]`)
- Course list page (fetched from `GET /courses`)
- Assignment list per course (fetched from `GET /courses/:courseId/assignments`)
- Show assignment status: published/unpublished, demo window dates

**4b. Slot Browser** (`/courses/[courseId]/assignments/[assignmentId]`)
- Fetch slots: `GET /assignments/:assignmentId/slots?status=published`
- Filter by date/TA
- Show slot cards with: time, venue, TA name, capacity (e.g., "2/3 booked")
- Disabled state for full/expired slots
- "Book" button on available slots

**4c. Booking Flow**
- Click "Book" → confirmation dialog showing slot details
- Confirm → `POST /bookings { slot_id }`
- Show success state with booking details
- Handle HTTP 409 (slot full / already booked) with user-friendly error

**4d. Booking History** (`/bookings`)
- `GET /bookings` → list all student bookings
- Status badges: booked (blue), completed (green), no-show (red), cancelled (gray)
- Actions: Reschedule, Cancel (when applicable)

**4e. Reschedule Flow**
- "Reschedule" → pick new slot → atomic cancel-and-rebook
- `POST /bookings/:bookingId/reschedule { new_slot_id }`
- Handle freeze window errors (HTTP 422)

**4f. Cancel Flow**
- "Cancel" → reason selection dialog
- `DELETE /bookings/:bookingId { cancel_reason, cancel_note? }`
- "Other" reason → show required textarea (10 char min)
- Handle quota exceeded (HTTP 422)

---

### Step 5: TA Flows

**5a. TA Dashboard** (`/dashboard` for TA role)
- List assigned courses and their assignments
- Quick stats: total bookings, pending evaluations

**5b. Assignment Configuration** (`/courses/[courseId]/assignments/[assignmentId]/manage`)
- Toggle `is_published` via `PATCH /assignments/:assignmentId`
- Configure: demo window, slot duration, capacity, freeze window, max cancellations, default venue

**5c. Slot Management**
- Generate slots: `POST /assignments/:assignmentId/slots/generate`
- Slot list with status filter (draft/published/booked/completed/cancelled)
- Bulk publish selected slots via `PATCH /slots/:slotId { status }`
- Individual slot actions: publish, unpublish, edit venue
- Venue change dialog → `PATCH /slots/:slotId { venue }`
- Show slot bookings count

**5d. Day View** (`/slots/:slotId/bookings`)
- `GET /slots/:slotId/bookings` — list all bookings for a slot
- Booking status management: mark as completed/no-show via `PATCH /bookings/:bookingId/status`

**5e. Evaluation Recording** (`/evaluations/[assignmentId]`)
- List bookings needing evaluation (completed status)
- Evaluation form: rubric scores (JSON), total score, private notes
- `POST /evaluations { booking_id, rubric_scores, total_score, private_note }`
- All evaluations for assignment → "Submit Batch" → `POST /assignments/:assignmentId/evaluations/submit`
- Pre-submission: evaluations are editable
- Post-submission: evaluations are read-only

---

### Step 6: Instructor Flows

**6a. Course Overview** (`/instructor/[courseId]`)
- Booking progress stats per assignment
- Student count vs booking count

**6b. Evaluation Review** (`/courses/:courseId/evaluations`)
- `GET /courses/:courseId/evaluations?assignment_id=...`
- Table of submitted evaluations
- Filter by assignment

**6c. Export**
- Export button: format selector (CSV/JSON)
- `GET /courses/:courseId/export?format=csv&assignment_id=...`
- Triggers file download

---

### Step 7: Admin Flows

**7a. Course Management** (`/admin/courses`)
- Create course → `POST /courses`
- Enroll users → `POST /courses/:courseId/enrollments`
- Bulk CSV upload → `POST /courses/:courseId/enrollments/bulk` (multipart file)

**7b. User Management** (`/admin/users`)
- Create user → `POST /users`
- List/search users → `GET /users?email=...`

**7c. Allowlist Management** (`/admin/allowlist`)
- Add domain/email → from allowlist controller
- List/remove entries

---

### Step 8: Notifications & Realtime

**8a. Notification Center** (`/notifications`)
- `GET /notifications` with pagination
- Unread count badge in header
- Mark as read: `PATCH /notifications/:notificationId/read`
- Mark all read: `PATCH /notifications/read-all`

**8b. SSE Integration**
- Connect to `GET /notifications/sse` on auth
- Show toast for real-time notifications
- Refresh relevant data on slot update events

**8c. Push Notifications**
- Prompt for permission → `POST /notifications/push/subscribe`

---

### Step 9: Polish & Hardening

**9a. Loading states**
- Skeleton loaders on all list/detail pages
- Submit button loading spinners

**9b. Error states**
- Error boundaries per route group
- Toast notifications for API errors
- 404 pages, unauthorized redirects

**9c. Responsive design**
- Mobile-first with Tailwind breakpoints
- Bottom nav or hamburger menu on mobile
- Test at 320px+ width

**9d. Form validation**
- Client-side validation matching backend rules
- Cancel reason "Other" → 10 char note required

---

### Implementation Order (Phased)

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| **P1** (Steps 1-2) | Dependencies, Tailwind, shadcn setup, API client, Auth context, Middleware, Layout | Working login/logout, protected routing |
| **P2** (Step 3) | Shared components (Header, Nav, SlotCard, BookingCard, EmptyState, LoadingState) | Reusable component library |
| **P3** (Steps 4a-4d) | Course list, Assignment list, Slot browser, Booking creation | Student can find and book a slot |
| **P4** (Steps 4e-4f) | Reschedule & Cancel flows | Complete student lifecycle |
| **P5** (Steps 5a-5d) | TA dashboard, Assignment config, Slot generation & management, Day view | TA can set up and run demos |
| **P6** (Step 5e) | Evaluation recording & batch submission | TA can record and submit marks |
| **P7** (Steps 6a-6c) | Instructor review & export | Instructor can view and export data |
| **P8** (Steps 7a-7c) | Admin pages | Course, user, allowlist management |
| **P9** (Steps 8-9) | Notifications, SSE, Error/Loading states, Responsive polish | Production-ready UX |

---

### Key Files to Create/Modify

- `apps/web/tailwind.config.ts` (new)
- `apps/web/postcss.config.mjs` (new)
- `apps/web/components.json` (shadcn config)
- `apps/web/src/lib/api.ts` (new)
- `apps/web/src/lib/hooks/use-auth.tsx` (new)
- `apps/web/src/lib/providers/query-client.tsx` (new)
- `apps/web/src/lib/providers/auth-provider.tsx` (new)
- `apps/web/src/lib/types.ts` (shared types)
- `apps/web/src/middleware.ts` (new)
- `apps/web/app/layout.tsx` (modify)
- `apps/web/app/globals.css` (modify with Tailwind)
- Plus all route page.tsx files as listed above

---

Would you like me to proceed with implementation, starting from P1 (foundation setup)?