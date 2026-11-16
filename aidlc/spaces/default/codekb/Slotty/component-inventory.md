# Component Inventory — Slotty

Each heading is a component name, used verbatim in the Scope of Analysis block.

### Web App Pages
- **Location**: `src/app/(app)/`, `src/app/(auth)/`, `src/app/layout.tsx`, `src/app/offline/`, `src/app/dev/mail/`
- **Responsibility**: 33 server-rendered pages (dashboard, today, bookings, notifications, account, course and assignment views, staff "manage" area, admin area, sign-in flows)
- **Depends on**: Domain Services, Session and Auth, UI Components; some layouts read counts from Prisma directly

### Server Actions
- **Location**: `src/app/actions/` (8 modules, 61 actions)
- **Responsibility**: parse `FormData`, call one service inside `run()` / `attempt()`, return `ActionState`
- **Depends on**: Action Utilities, Session and Auth, Domain Services

### Route Handlers
- **Location**: `src/app/**/route.ts(x)`, `src/app/manifest.ts`
- **Responsibility**: health checks, logout, ICS feed and download, CSV export, notification redirect, PWA icons and manifest (see `api-documentation.md`)
- **Depends on**: Domain Services, Session and Auth, Database Client

### UI Components
- **Location**: `src/components/`, `src/components/ui/`
- **Responsibility**: `ActionForm` (binds Server Actions to forms, toasts), demo-day timeline, PWA install and push opt-in, status badges, shadcn/ui primitives
- **Depends on**: radix-ui, lucide-react, sonner, Tailwind; Domain Rules for timeline helpers

### Origin Proxy
- **Location**: `src/proxy.ts`
- **Responsibility**: refuse requests without the CloudFront `x-origin-verify` secret (when configured); restore the forwarded host and protocol from `APP_URL`
- **Depends on**: `node:crypto`, `next/server`

### Action Utilities
- **Location**: `src/server/action-utils.ts`, `src/server/page-utils.ts`
- **Responsibility**: `run()` / `attempt()` error mapping and page refresh; FormData helpers `str`, `optStr`, `bool`; page loading helper `load`
- **Depends on**: Domain Rules (`DomainError`), zod, `next/cache`, `next/navigation`

### Session and Auth
- **Location**: `src/server/auth/`
- **Responsibility**: cookie sessions with hashed tokens (30 days), `requireUser` / `requireAdminUser`, argon2 passwords, random tokens for invites and resets
- **Depends on**: Database Client, @node-rs/argon2, `next/headers`

### Domain Services
- **Location**: `src/server/services/` (20 modules)
- **Responsibility**: use cases with access checks per `Actor`. `access` (role checks), `accounts` (sign-in, invites, resets, profile), `admin` (moderation), `assignments` (policy, publish, close), `bookings` (book, reschedule, cancel, attendance, allowances), `slots` (availability → slots, slot edits), `waitlist`, `requests` (student requests), `evaluations` (marking, review), `courses` (courses, roster, members, venues), `demo-day`, `home` (dashboard tasks), `inbox`, `calendar` (ICS), `reports` (progress, CSV), `push` (subscriptions), `automations` and `reminders` (worker jobs), `notify` (outbox writes), `audit`
- **Depends on**: Domain Rules, Database Client, Outbox Signal, zod, Time Utilities

### Domain Rules
- **Location**: `src/domain/`
- **Responsibility**: pure business rules returning `RuleResult`; `DomainError` and `assertRule`; slot generation; evaluation state machine; CSV roster parsing; ICS building; demo-day timeline; role compatibility
- **Depends on**: nothing outside `src/domain` (papaparse in `csv-roster`)

### Time Utilities
- **Location**: `src/lib/time.ts`, `src/server/clock.ts`
- **Responsibility**: UTC ↔ course-timezone formatting and input parsing; per-request 12h/24h clock
- **Depends on**: date-fns, @date-fns/tz, React `cache`

### Database Client
- **Location**: `src/server/db.ts`, `prisma/schema.prisma`, `src/generated/prisma` (generated)
- **Responsibility**: one Prisma 7 client over `@prisma/adapter-pg` (optional `DATABASE_POOL_MAX`); the `Tx` type for transactions
- **Depends on**: PostgreSQL 17, `DATABASE_URL`

### Outbox Signal
- **Location**: `src/server/outbox-signal.ts`
- **Responsibility**: `pg_notify('slotty_outbox')` inside the writing transaction
- **Depends on**: Database Client

### Background Worker
- **Location**: `src/jobs/worker.ts`, `src/server/mailer.ts`, `src/server/push.ts`, `src/server/push-config.ts`
- **Responsibility**: delivery loop (email batches of 50, push batches of 100, LISTEN with polling fallback) and schedule loop (open announcements, nudges, auto-close, agendas, reminders); graceful shutdown
- **Depends on**: Domain Services, Database Client, pg, nodemailer, web-push

### Admin Bootstrap Script
- **Location**: `src/jobs/create-admin.ts`, `prisma/seed.ts`
- **Responsibility**: create the first platform admin (production); seed demo data (development only)
- **Depends on**: Database Client, Session and Auth (password hashing)

### Startup Checks
- **Location**: `src/instrumentation.ts`, `src/server/startup-checks.ts`, `src/server/app-url.ts`
- **Responsibility**: exit at start-up when `APP_URL` is invalid; build absolute links
- **Depends on**: environment

### Service Worker
- **Location**: `public/sw.js`
- **Responsibility**: offline page caching and push notification display
- **Depends on**: browser Push and Cache APIs

### Database Migrations
- **Location**: `prisma/migrations/` (7 migrations, 2026-09-25 to 2026-10-03), `prisma.config.ts`
- **Responsibility**: schema history, applied by `prisma migrate deploy` (migrate image)
- **Depends on**: Prisma CLI 7.10.0

### Test Suites
- **Location**: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `vitest.config.mts`, `playwright.config.ts`
- **Responsibility**: domain unit tests, service integration tests against `slotty_test`, browser flows against a production build on :3100
- **Depends on**: Vitest, Playwright, local PostgreSQL

### Container Image
- **Location**: `Dockerfile`, `.dockerignore`
- **Responsibility**: multi-stage build; `app` target (web `node server.js`, worker `node dist/jobs/worker.js`) and `migrate` target; RDS CA bundle pinned by checksum
- **Depends on**: oven/bun 1.3.14, node:22-bookworm-slim

### Local Infrastructure
- **Location**: `infra/docker-compose.yml`, `infra/Caddyfile`, `infra/postgres/init.sql`
- **Responsibility**: Postgres 17 (databases `slotty`, `slotty_test`, `slotty_app`), Mailpit, Caddy for https://slotty.local; `app` profile runs the production image
- **Depends on**: Docker

### VPS Deployment
- **Location**: `deploy/`
- **Responsibility**: single-host production Compose stack (Caddy, web, worker, migrate, Postgres) and `backup.sh`
- **Depends on**: Container Image, Docker

### AWS Organization Terraform
- **Location**: `infra/aws/org/`
- **Responsibility**: Organization OU and SCPs, budgets and billing alarms, the Terraform state bucket and CloudTrail
- **Depends on**: AWS provider ~> 6.0, S3 backend

### AWS Application Terraform
- **Location**: `infra/aws/app/`
- **Responsibility**: VPC and NAT instance, ECS Fargate (web, worker, migrate task definitions), ECR, RDS, API Gateway, CloudFront edge, Route 53, SES, SSM secrets, IAM, CloudWatch alarms and SNS
- **Depends on**: AWS Organization Terraform (state bucket, account role)

### Deploy Script
- **Location**: `infra/aws/deploy.sh`
- **Responsibility**: register new task-definition revisions, run migrations as a one-off task, update the web and worker services, check the rollout and `/health`
- **Depends on**: AWS CLI, jq, ECR images

### CI Workflows
- **Location**: `.github/workflows/deploy.yml`, `.github/workflows/docs.yml`
- **Responsibility**: `check` job (install, typecheck, lint, unit tests) on every push and PR; ARM64 image build and deploy on master; docs PDF build when `docs/` changes
- **Depends on**: oven-sh/setup-bun, aws-actions, docker/build-push-action, Deploy Script

### Lint and Type Configuration
- **Location**: `eslint.config.mjs`, `tsconfig.json`
- **Responsibility**: ESLint flat config (next core-web-vitals + typescript, `globalIgnores`); TypeScript strict, `@/*` alias, `include: **/*.ts`
- **Depends on**: eslint-config-next 16.3.6, typescript 5.9.3. Intent finding: no ignore for `.claude/**` (see `code-quality-assessment.md`)

### System Documentation
- **Location**: `docs/`
- **Responsibility**: LaTeX system documentation (15 chapters, 3 appendices, TikZ figures), built by `docs/tooling/build.sh` in a pinned TeX Live image
- **Depends on**: Docker, `docs/tooling/Dockerfile`
