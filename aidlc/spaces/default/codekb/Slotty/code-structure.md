# Code Structure — Slotty

## Repository Layout
| Path | Classification | Contents |
|---|---|---|
| `src/app/` | Controller/Handler, Static | App Router: `(app)/` signed-in pages, `(auth)/` sign-in pages, `actions/` Server Actions, `route.ts` handlers, `layout.tsx`, `globals.css`, `manifest.ts`, `offline/`, `dev/mail/` |
| `src/components/` | Static (UI) | App components (`action-form.tsx`, `demo-day.tsx`, `pwa.tsx`, …) and shadcn/ui primitives in `ui/` |
| `src/domain/` | Service (pure rules) | `booking-rules`, `evaluation`, `slots`, `demo-day`, `csv-roster`, `ics`, `roles`, `result` |
| `src/server/services/` | Service/UseCase | 20 modules: access, accounts, admin, assignments, audit, automations, bookings, calendar, courses, demo-day, evaluations, home, inbox, notify, push, reminders, reports, requests, slots, waitlist |
| `src/server/` (root) | Infrastructure, Utility | `db.ts`, `mailer.ts`, `push.ts`, `push-config.ts`, `outbox-signal.ts`, `action-utils.ts`, `page-utils.ts`, `app-url.ts`, `clock.ts`, `startup-checks.ts` |
| `src/server/auth/` | Middleware/Security | `session.ts`, `password.ts`, `password-policy.ts`, `tokens.ts` |
| `src/lib/` | Utility | `time.ts` (timezone formatting), `concurrency.ts` (`mapLimit`), `utils.ts` (`cn`) |
| `src/jobs/` | Entry point | `worker.ts` (delivery and schedule loops), `create-admin.ts` |
| `src/proxy.ts`, `src/instrumentation.ts` | Middleware, Configuration | Origin lock; start-up checks |
| `src/generated/` | Generated (gitignored) | Prisma client from `prisma generate` |
| `prisma/` | Model, Migration | `schema.prisma` (22 models, 11 enums), 7 migrations, `seed.ts` |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Test | Vitest unit and integration tests, Playwright specs |
| `public/` | Static | `sw.js` service worker, SVGs |
| `infra/` | Configuration (IaC) | `docker-compose.yml` (local Postgres, Mailpit, Caddy, `app` profile), `Caddyfile`, `postgres/init.sql`, `aws/org/` and `aws/app/` Terraform, `aws/deploy.sh` |
| `deploy/` | Configuration | Single-VPS Compose stack, Caddyfile, `backup.sh` |
| `docs/` | Documentation | LaTeX system documentation (`slotty.tex`, `chapters/`, `appendices/`, `figures/`, `style/`, `tooling/`) |
| `.github/workflows/` | CI/CD | `deploy.yml`, `docs.yml` |
| `.claude/`, `aidlc/` | AI-DLC framework and workspace (not project code) | Vendored hooks and tools (TypeScript) and workflow records. Out of scope for this knowledge base, but inside ESLint's reach (see `code-quality-assessment.md`) |

Root configuration files are listed in `technology-stack.md`.

## Code Patterns
- **Rule → service → action**: domain functions return `RuleResult` (`allow` / `deny(reason)`). Services call `assertRule(result, code)`, which throws `DomainError` (`FORBIDDEN | NOT_FOUND | INVALID | CONFLICT`). Actions wrap calls in `run()`, which maps `DomainError` and `ZodError` to `{ok:false, error}` and refreshes the page on success. Autosave uses `attempt()`.
- **Access in every service**: `assertCourseRole` / `assertStaff` / `assertAdmin` / `assertAssignmentRole`, with an optional `{write:true}` that refuses archived courses (`assertCourseWritable`).
- **Transaction-scoped side effects**: `notify(tx, userIds, …)` writes `Notification`, `PushMessage` and `EmailOutbox` rows and calls `signalOutbox(tx)`; `audit(tx, actor, …)` writes `AuditLog`.
- **Concurrency**: slot rows are locked in sorted id order; a unique-constraint violation (P2002) is translated to a `DomainError`.
- **Validation**: Zod schemas are exported next to the services (`courseInput`, `policyInput`, `evaluationInput`, …).
- **Testable time**: services take `now = new Date()` as their last parameter.
- **Server-only guard**: `import "server-only"` in `action-utils.ts`, `session.ts` and `clock.ts`.
- **Path alias**: `@/*` → `src/*` (tsconfig and Vitest).
- **Naming**: kebab-case file names, camelCase functions, PascalCase components; Server Actions end in `Action`.

## Dependency Direction
`app` → `server/services` → `domain` and `server/*` infrastructure → `generated/prisma`. `domain` imports only `domain/result` (no Prisma, no Next). `jobs/worker.ts` imports services and infrastructure, never `app`. No circular imports were seen in the modules read.
