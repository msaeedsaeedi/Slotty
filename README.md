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

| | Command | URL | Database |
| --- | --- | --- | --- |
| Development | `bun run dev` + `bun run worker` | https://slotty.local (Caddy) or http://localhost:3000 | `slotty` in the local Postgres (`.env`) |
| Tests | `bun run test`, `bun run test:e2e` | http://localhost:3100 (e2e) | a throwaway Postgres per run (Testcontainers) |

Production runs on AWS (`infra/aws`) and runs exactly what is on `master`; see [Deploying](#deploying).

### Development

```bash
cp .env.example .env # once
bun install
bun run infra:up     # Postgres, Mailpit and Caddy in Docker (infra/docker-compose.yml)
bun run db:migrate   # apply migrations
bun run db:seed      # demo data (see below)
bun run dev          # https://slotty.local
bun run worker       # in a second terminal: sends queued emails and schedules reminders
```

Caddy serves the dev server at **https://slotty.local**, using a certificate from its own local CA (`infra/Caddyfile`). This needs a one-time setup:

1. Add `127.0.0.1 slotty.local` to your hosts file. On WSL, edit the Windows file `C:\Windows\System32\drivers\etc\hosts` as Administrator.
2. Run `bun run infra:cert`, which copies Caddy's CA to `infra/caddy-root.crt`. Then trust it: on WSL, run `certutil.exe -user -addstore Root infra/caddy-root.crt` and restart the browser. The CA is kept in the `caddy_data` volume, so you only redo this if you delete that volume.

`APP_URL` in `.env` controls links in emails. Set it to `http://localhost:3000` if you skip Caddy.

Emails go to Mailpit, at **http://localhost:8025**. If `SMTP_HOST` is empty, the worker prints them to its console instead. **/dev/mail** also lists every queued email (development only). For push notifications (PWA), add VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`): `bunx web-push generate-vapid-keys`. The service worker only registers in production builds unless `NEXT_PUBLIC_ENABLE_SW=1` is set.

Other database scripts: `bun run db:studio` opens Prisma Studio, and `bun run db:reset` wipes the dev database and re-applies migrations and the seed.

### Demo accounts (after `db:seed`)

| Email | Password | What they see |
| --- | --- | --- |
| `admin@slotty.local` | `admin12345` | Admin pages |
| `prof@slotty.local` | `password123` | Instructor of CS 350 (review queue) |
| `ta@slotty.local` | `password123` | TA of CS 350; runs CS 101 alone |
| `student1@slotty.local` … `student6` | `password123` | Students |

## Tests

Tests need Docker running but nothing else: integration and e2e runs each start their own Postgres 17 container (Testcontainers, `tests/support/postgres.ts`), migrate it, and remove it afterwards. They never touch the dev database.

```bash
bun run test:unit     # domain rules: slot generation, booking rules, evaluation states, CSV parsing
bun run test:int      # services against a throwaway database (one copy per worker, files run in parallel)
bun run test:e2e      # Playwright: the full loop in a real browser (a production build on :3100)
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request, plus a Docker build of both images and the docs PDF when `docs/` changes. Work merges into `dev` (the default branch); `dev` and `master` only accept pull requests whose **CI ok** check is green and that are up to date.

## Deploying

`master` is production: merging a release pull request from `dev` (with a new version in `package.json`) deploys it (`.github/workflows/deploy.yml`) and, once it serves, tags `vX.Y.Z` and publishes the GitHub Release. Merging into `dev` deploys nothing. Both images are built on an ARM64 runner and pushed to ECR, then `infra/aws/deploy.sh` runs migrations as a one-off ECS task (skipped when `prisma/migrations` hasn't changed) and rolls out the web and worker services. The deploy finishes when `/health` reports the new release. Work is planned in the Slotty GitHub Project, in two-week sprints with one release each. Report security problems privately (see [SECURITY.md](SECURITY.md)). Details, runbooks and decisions are in the system documentation (chapters 8–10 and 14).

Building the images locally: `docker buildx bake` (see `docker-bake.hcl`).

## Project layout

```
src/domain/            Pure business rules (no DB); unit tested
src/server/services/   Use cases. Authorization and transactions live here
src/server/auth/       Password hashing, DB-backed sessions, invite/reset tokens
src/app/actions/       Server Actions: thin wrappers that call services
src/app/(auth)/        Sign in, invite, password reset
src/app/(app)/         Signed-in app: dashboard, student pages, /courses/[id]/manage (staff), /admin
src/jobs/worker.ts     Email/push outbox delivery, reminders, automations
infra/                 Local Docker services (Postgres, Mailpit, Caddy); infra/aws: AWS Terraform and deploy script
prisma/                Schema, migrations, seed
docs/                  System documentation (LaTeX): journeys, rules, architecture, AWS, operations, decisions
```

The system documentation is one LaTeX document in `docs/` (user journeys, business rules, architecture, AWS platform, operations, how changes are made, decision records, roadmap). Build it with `bun run docs:build` → `docs/build/slotty.pdf`; CI also attaches the PDF to every run that changes `docs/`.

## Key rules

- **No double booking.** Booking locks the slot row (`SELECT … FOR UPDATE`) before checking capacity. A partial unique index also allows only one active booking per student per assignment.
- **Freeze window.** Students can't book, cancel, or reschedule within *N* hours of a slot. Staff can still cancel.
- **Emails are transactional.** Notifications are written in the same DB transaction as the change, so a failed booking never sends a confirmation.
- **Evaluation states.** `DRAFT → SUBMITTED → FINALIZED`, or `RETURNED` for changes. Without an instructor, `submit` goes straight to `FINALIZED`. Students only ever see finalized marks and never see private notes.
