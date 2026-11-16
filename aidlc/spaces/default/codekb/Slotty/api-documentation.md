# API Documentation — Slotty

Slotty has no public REST API. Its surfaces are Server Actions (form posts), a few HTTP route handlers, and the internal service layer.

## HTTP Route Handlers
| Method | Path | Auth | Response | Source |
|---|---|---|---|---|
| GET | `/health` | none (excluded from the origin lock) | `{ok:true}`, or 503 when `SELECT 1` fails | `src/app/health/route.ts` |
| GET | `/health/live` | none | `{ok:true}` with no DB call (container liveness) | `src/app/health/live/route.ts` |
| POST | `/logout` | session cookie | 303 to `/login` with `Clear-Site-Data: "cache", "storage"` | `src/app/logout/route.ts` |
| GET | `/calendar/[token](.ics)` | token in URL is the credential | `text/calendar` feed, `private, max-age=300`; 404 for an unknown token | `src/app/calendar/[token]/route.ts` |
| GET | `/bookings/[bookingId]/calendar` | session; 401 without one | `.ics` attachment; 404 on `DomainError` | `src/app/(app)/bookings/[bookingId]/calendar/route.ts` |
| GET | `/notifications/[notificationId]` | session; redirect to `/login` without one | 307 to the notification's same-origin link (marks it read) | `src/app/(app)/notifications/[notificationId]/route.ts` |
| GET | `/courses/[courseId]/manage/assignments/[assignmentId]/export` | session plus staff role | CSV with a UTF-8 BOM; 403 or 404 on `DomainError` | `.../export/route.ts` |
| GET | `/icons/[kind]` | none | PNG icon (`192`, `512`, `maskable`, `badge`), cached 7 days | `src/app/icons/[kind]/route.tsx` |
| GET | `/manifest.webmanifest` | none | PWA manifest | `src/app/manifest.ts` |

All responses carry `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options: DENY` (`next.config.ts`). `/sw.js` is served `no-store` with its own CSP.

**Origin lock** (`src/proxy.ts`): when `ORIGIN_VERIFY_SECRET` is set (AWS), every path except `/health*` needs `x-origin-verify` to match (SHA-256 digests compared in constant time), or it gets 403. The proxy then rewrites `x-forwarded-host` and `x-forwarded-proto` to `APP_URL` so the Server Actions origin check passes.

## Server Actions (`src/app/actions/`)
Signature `(prev: ActionState, fd: FormData) => Promise<ActionState>`, where `ActionState = {ok:true, message?, navigate?} | {ok:false, error} | null`. Each action calls `requireUser()` (redirects to `/login`), then one service, inside `run()`. `navigate` values are limited to same-origin paths (`/…`, not `//…`).

| Module | Count | Examples |
|---|---|---|
| `account.ts` | 5 | profile, password change, email preferences, time format, sign out other sessions |
| `admin.ts` | 10 | invite user, disable or enable, set admin, send access email, update user, assign staff, create or archive course, retry emails, mark all read |
| `auth.ts` | 4 | `loginAction`, `acceptInviteAction`, `forgotPasswordAction`, `resetPasswordAction` |
| `bookings.ts` | 12 | `bookSlotAction`, `rescheduleAction`, `cancelBookingAction`, `markAttendanceAction`, `staffPlaceStudentAction`, `setAllowanceAction`, waitlist, requests |
| `courses.ts` | 10 | create, update or archive course; roster preview and import; add or remove member; resend invite; venues |
| `evaluations.ts` | 7 | `saveDraftAction` (autosave, `attempt()`), `submitManyAction`, `reviewAction`, `unlockAction`, `clearMarksAction`, `finalizeManyAction`, `sheetAttendanceAction` |
| `push.ts` | 2 | save or remove a push subscription |
| `scheduling.ts` | 11 | assignment create, update, publish, close, delete; add availability; slot cancel, venue, host, capacity |

## Internal Service API (`src/server/services/`)
Convention: `fn(actor: Actor, …ids, input?, now = new Date())`. The service checks access, validates with Zod, runs a transaction, and throws `DomainError` for user-facing failures. Helpers that take `tx` (`notify`, `queueEmail`, `audit`, `notifyWaitlist`, `announceBookingOpen`, `loadChangeState`, `issueInvite`, `rolesElsewhere`, `courseRoleOf`) run inside the caller's transaction. Worker-only entry points take no actor: `announceOpenedBookings`, `nudgeUnbookedStudents`, `closeEndedAssignments`, `sendDailyAgendas`, `queueDueReminders`, `deliverPendingEmails`, `deliverPendingPush`. Each module's responsibility is listed in `component-inventory.md`.

## Domain API (`src/domain/`)
Pure functions, unit-tested: `canBookSlot`, `canCancelBooking`, `canReschedule`, `canMarkAttendance`, `changeBudget`, `isFrozen`, `freezeAt`, `bookingStage` (booking rules); `canTransition`, `nextStatus`, `validateScores`, `computeTotal`, `canSubmit`, `canChangeMarkedBooking` (evaluation); `generateSlots`, `overlaps` (slots); `buildTimeline` (demo day); `parseRoster` (CSV); `buildCalendar`, `calendarLinks` (ICS); `canTakeRole` (roles). The rules themselves are in `docs/chapters/04-business-rules.tex`.

## Asynchronous Interfaces
- Postgres channel `slotty_outbox`: `pg_notify` after outbox writes; the worker LISTENs on a dedicated `pg` connection and falls back to polling (`WORKER_INTERVAL_MS`).
- Outbox tables: `EmailOutbox` (status `PENDING | SENT | FAILED`, at most 5 attempts), `PushMessage` → `PushSubscription`.
