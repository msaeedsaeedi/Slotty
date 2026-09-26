# Slotty

Slotty is a scheduling and evaluation tool for university demos, vivas, and code reviews. It covers the whole demo lifecycle, **schedule → book → conduct → evaluate → record**, in one place instead of spreadsheets and chat threads.

- **Students** see which assignments need a demo and book a free slot. They can reschedule or cancel within the course rules, get confirmations, reminders, and venue changes by email, and see their marks once they're released.
- **TAs** set the demo rules and add their availability, which Slotty splits into slots. On the day they run from a "Today" list: mark attendance, score against a rubric, keep private notes, and submit. A TA can run a course **completely alone**; if the course has no instructor, submitting releases the marks directly.
- **Instructors** see progress across the course, review TA submissions (finalize or return with a comment), and export bookings with marks as CSV.
- **Admins** moderate. They can open any course, disable accounts, and read the audit log. Nobody needs an admin to get started.

Students join when a TA or instructor imports a class list by email (CSV, including Google Classroom exports). New people get an email with a link to set their password. There are no join codes.

## Stack

Next.js 16 (App Router, Server Actions), TypeScript, PostgreSQL with Prisma 7, Tailwind 4 with shadcn/ui, and Bun. Background email and reminders use a transactional outbox table and a small worker process.

## Getting started

```bash
bun install
bun run db:up        # local Postgres via `prisma dev` (runs in the background)
bun run db:migrate   # apply migrations
bun run db:seed      # demo data (see below)
bun run dev          # http://localhost:3000
bun run worker       # in a second terminal: sends queued emails and schedules reminders
```

Copy `.env.example` to `.env` first if you don't have one. For push notifications (PWA), add VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`): `bunx web-push generate-vapid-keys`. The service worker only registers in production builds unless `NEXT_PUBLIC_ENABLE_SW=1` is set. When `SMTP_HOST` is empty, the worker prints emails to its console. You can also read every queued email at **http://localhost:3000/dev/mail** (development only), which is the easiest way to follow invite links locally.

### Demo accounts (after `db:seed`)

| Email | Password | What they see |
| --- | --- | --- |
| `admin@slotty.local` | `admin12345` | Admin pages |
| `prof@slotty.local` | `password123` | Instructor of CS 350 (review queue) |
| `ta@slotty.local` | `password123` | TA of CS 350; runs CS 101 alone |
| `student1@slotty.local` … `student6` | `password123` | Students |

## Tests

```bash
bun run test:unit     # domain rules: slot generation, booking rules, evaluation states, CSV parsing
bunx prisma dev --name slotty-test --detach   # once: separate test database (see .env.test)
bun run test:int      # services against the test DB, including a 20-way booking race
bun run test:e2e      # Playwright: the full loop in a real browser (starts its own server on :3100)
```

## Deploying (single VPS)

Slotty runs as one Docker image in three roles: **web** (`next start`), **worker** (email, push, reminders and automations) and a one-off **migrate** step. `deploy/docker-compose.yml` runs these together with Postgres and Caddy, which provides HTTPS automatically.

1. Get a VPS with Docker (2 GB RAM is enough), and point your domain's DNS at it.
2. Clone the repo, then `cd deploy && cp .env.example .env` and fill it in. You need the domain, `APP_URL`, a Postgres password, SMTP details and VAPID keys.
3. `docker compose up -d --build`. Migrations run first, then the web app and worker start, and Caddy fetches the certificate.
4. Create the first admin. Don't run `db:seed` in production, because it creates demo accounts:
   `docker compose run --rm -e ADMIN_EMAIL=you@uni.edu -e ADMIN_PASSWORD='…' web bun run admin:create`
5. Back up nightly with `deploy/backup.sh` (the cron line is in the file), and copy the dumps off the server. To restore: `docker compose exec -T postgres pg_restore -U slotty -d slotty --clean < backups/<file>.dump`.

To update: `git pull && docker compose up -d --build`. To check it's running: `docker compose ps`, `docker compose logs -f web worker`, or `https://<domain>/health`.

**Rules to keep in mind:**
- One worker is enough. Every job claims its rows before acting, so a second worker shares the work instead of sending duplicates. Delivery is at-least-once: a crash mid-send can repeat that one message.
- Keep the VAPID keys stable. New keys invalidate existing push subscriptions.
- HTTPS is required for login cookies, the service worker and push. `APP_URL` must be the public `https://` address.
- All configuration is read at runtime, so the same image works in every environment.

**Moving to AWS later:**
- Push the image to ECR.
- Run web as an ECS service behind an ALB, which does TLS and uses `/health` for health checks.
- Run the worker as an ECS service (1 task is enough), with a stop timeout of at least 30 seconds.
- Run migrations as a one-off task on each deploy.
- Use RDS for Postgres, and SES for SMTP.
- Before running more than one web instance, set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on every instance (see Next's self-hosting guide).

## Project layout

```
src/domain/            Pure business rules (no DB); unit tested
src/server/services/   Use cases. Authorization and transactions live here
src/server/auth/       Password hashing, DB-backed sessions, invite/reset tokens
src/app/actions/       Server Actions: thin wrappers that call services
src/app/(auth)/        Sign in, invite, password reset
src/app/(app)/         Signed-in app: dashboard, student pages, /courses/[id]/manage (staff), /admin
src/jobs/worker.ts     Email/push outbox delivery, reminders, automations
deploy/                Production stack for one VPS (compose, Caddy, backups)
prisma/                Schema, migrations, seed
docs/                  User journeys, business rules, roadmap
```

See [docs/user-journeys.md](docs/user-journeys.md), [docs/business-rules.md](docs/business-rules.md) and [docs/roadmap.md](docs/roadmap.md).

## Key rules

- **No double booking.** Booking locks the slot row (`SELECT … FOR UPDATE`) before checking capacity. A partial unique index also allows only one active booking per student per assignment.
- **Freeze window.** Students can't book, cancel, or reschedule within *N* hours of a slot. Staff can still cancel.
- **Emails are transactional.** Notifications are written in the same DB transaction as the change, so a failed booking never sends a confirmation.
- **Evaluation states.** `DRAFT → SUBMITTED → FINALIZED`, or `RETURNED` for changes. Without an instructor, `submit` goes straight to `FINALIZED`. Students only ever see finalized marks and never see private notes.

## Local database notes

`prisma dev` runs PGlite, a single-session Postgres, so `.env` sets `DATABASE_POOL_MAX=1`. With a normal Postgres server (for example `docker compose up` using the included `docker-compose.yml`), remove that line.
