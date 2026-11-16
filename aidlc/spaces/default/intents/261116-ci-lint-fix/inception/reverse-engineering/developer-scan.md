# Developer Code Scan — Slotty

Full first scan (no existing store) at Minimal depth, commit `d74df214376505309c27eb390ff60902da946ae4`, branch `docs/system-documentation` (PR 19). Nothing was built, run or fixed.

## Developer Code Scan Results

### Scan Coverage
- **Analyzed deeply**:
  - `./` (whole repository, at Minimal depth), in particular:
  - `package.json`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `vitest.config.mts`, `playwright.config.ts`, `prisma.config.ts`, `components.json`, `postcss.config.mjs`, `.gitignore`, `.dockerignore`, `.env.example`, `CLAUDE.md`, `AGENTS.md`
  - `.github/workflows/deploy.yml`, `.github/workflows/docs.yml`
  - `src/domain/` (all 8 modules), `src/server/` core (`action-utils.ts`, `db.ts`, `outbox-signal.ts`, `clock.ts`, `startup-checks.ts`, `auth/session.ts`), `src/server/services/access.ts`, `notify.ts`, `audit.ts`, the head of `bookings.ts`, and the exported surface of every service
  - `src/app/actions/bookings.ts` and the exported surface of every action module; every route handler under `src/app/**/route.ts(x)`; `src/proxy.ts`; `src/instrumentation.ts`; `src/jobs/worker.ts`
  - `Dockerfile`, `infra/docker-compose.yml`, `infra/aws/deploy.sh`, `infra/aws/app/main.tf`
- **Skimmed only**:
  - `src/app/(app)/`, `src/app/(auth)/` pages and layouts (structure, direct `db` reads)
  - `src/components/` and `src/components/ui/` (file list and sizes)
  - `src/server/services/*` bodies beyond the exported signatures; `src/server/mailer.ts`, `src/server/push.ts`
  - `tests/unit/`, `tests/integration/`, `tests/e2e/` (file list and sizes)
  - `prisma/schema.prisma` (model and enum list), `prisma/migrations/` (names), `prisma/seed.ts`
  - `infra/aws/app/*.tf`, `infra/aws/org/*.tf` (resource types per file)
  - `deploy/` (VPS compose), `public/sw.js`
  - `docs/` (chapter list, headings, chapter status, roadmap, security gaps, changelog, build script)
  - `README.md`
- **Left out**:
  - `node_modules/` (dependencies; only `version` fields of key packages read)
  - `.next/`, `.next-e2e/` (Next build output)
  - `test-results/` (Playwright output)
  - `src/generated/` (Prisma client, generated)
  - `docs/build/` (PDF output)
  - `tsconfig.tsbuildinfo`, `next-env.d.ts` (generated)
  - `.env`, `certificates/`, `deploy/caddy-root.crt` (local secrets and certificates)
  - `bun.lock` (lockfile)
  - `.claude/`, `aidlc/` (AI-DLC install and workspace, not project code)

### Packages Found
- `slotty` (single package, `package.json` v1.0.0-alpha.1) — Next.js web application plus background worker — TypeScript — demo scheduling and evaluation for university courses
- `infra/aws/org` — Terraform root module — HCL — AWS Organization, SCPs, budgets, state bucket and trail (management account)
- `infra/aws/app` — Terraform root module — HCL — slotty-prod application stack (VPC, ECS, RDS, API Gateway, CloudFront, SES, SSM, alarms)
- `docs/` — LaTeX document (`docs/slotty.tex`, 15 chapters, 3 appendices) built in a pinned TeX Live Docker image

### Build System
- **Type**: Bun 1.3.14 (`packageManager`) driving Next.js 16 (`next build`, standalone output); Bun bundles the worker scripts; Docker multi-stage image (Node 22 runtime); Terraform >= 1.10 for infrastructure; latexmk in Docker for docs
- **Config Files**: `package.json`, `bun.lock`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `prisma.config.ts`, `vitest.config.mts`, `playwright.config.ts`, `Dockerfile`, `infra/docker-compose.yml`, `deploy/docker-compose.yml`, `docs/tooling/Dockerfile`, `docs/latexmkrc`
- **Build Dependencies**: `postinstall` → `prisma generate` → `src/generated/prisma`; `typecheck` → `next typegen` → `tsc --noEmit`; Docker `build` stage → `next build` + `bun build src/jobs/*.ts` → `dist/jobs`; `migrate` target → Prisma CLI `migrate deploy`

### APIs Discovered
- Server Actions — `src/app/actions/*.ts` — 61 exported actions across 8 modules (account 5, admin 10, auth 4, bookings 12, courses 10, evaluations 7, push 2, scheduling 11)
- Route handlers (HTTP GET/POST) — `src/app/**/route.ts(x)` — 9 endpoints (`/health`, `/health/live`, `/logout`, `/calendar/[token]`, `/bookings/[bookingId]/calendar`, `/notifications/[notificationId]`, `/courses/.../export`, `/icons/[kind]`, plus `src/app/manifest.ts`)
- App Router pages — `src/app/(app)`, `src/app/(auth)`, `src/app/dev/mail`, `src/app/offline` — 33 pages
- Internal service API — `src/server/services/*.ts` — 20 modules, about 120 exported functions, each taking an `Actor`
- Domain rules — `src/domain/*.ts` — pure functions returning `RuleResult`
- Edge proxy — `src/proxy.ts` — origin lock (`x-origin-verify`) for the CloudFront → API Gateway path
- Postgres channel `slotty_outbox` (LISTEN/NOTIFY) between web and worker

### Frameworks & Libraries
- next — 16.3.6 — App Router, Server Actions, standalone server
- react / react-dom — 19.2.8 — UI
- typescript — 5.9.3 — language
- prisma / @prisma/client / @prisma/adapter-pg — 7.10.0 — ORM over PostgreSQL 17
- pg — 8.23.0 — LISTEN connection in the worker
- zod — 4.6.5 — input validation in services
- tailwindcss — 4.3.3, shadcn 4.21 (`radix-nova` style), radix-ui 1.6.7, lucide-react 1.48.0, sonner 2.0.8, next-themes 0.4.6 — UI kit
- date-fns 4.4.0 / @date-fns/tz 1.5.0 — course-timezone formatting
- nodemailer — 10.0.10 — SMTP delivery (worker only)
- web-push — 3.6.7 — PWA push delivery (worker only)
- @node-rs/argon2 — 2.2.1 — password hashing
- papaparse — 5.7.0 — CSV roster import
- eslint 9.39.5 + eslint-config-next 16.3.6 — linting
- vitest — 5.0.1 — unit and integration tests
- @playwright/test — 1.63.0 — end-to-end tests

### Test Coverage
- **Test Directories**: `tests/unit/` (8 files: domain rules, `app-url`, `concurrency`), `tests/integration/` (10 files: services against `slotty_test`, global setup), `tests/e2e/` (2 specs plus helpers and DB setup)
- **Test Frameworks**: Vitest 5 (two projects, `unit` and `integration`), Playwright 1.63 (Chromium, against a production build on :3100)
- **Coverage Config**: absent (no coverage provider or threshold configured in `vitest.config.mts`)

### Code Quality Indicators
- **Linting**: ESLint 9 flat config `eslint.config.mjs` (next core-web-vitals + next typescript), run as `eslint` with no path argument, so it lints every file under the repository root that is not ignored. Its `globalIgnores` list is `.next/**`, `.next-e2e/**`, `test-results/**`, `playwright-report/**`, `out/**`, `build/**`, `next-env.d.ts`, `src/generated/**`. **There is no ignore for `.claude/**` (or `aidlc/**`)**, so the 171 vendored AI-DLC TypeScript files under `.claude/` that PR 19 adds are linted. This is why PR 19 fails CI at `bun run lint`.
- **CI/CD**: `.github/workflows/deploy.yml` (`check` job: install, typecheck, lint, unit tests on every push and PR; `deploy` job on master: ARM64 images to ECR, then `infra/aws/deploy.sh`); `.github/workflows/docs.yml` (builds the PDF when `docs/**` changes)
- **Documentation**: `README.md` (setup, tests, VPS deploy), `CLAUDE.md` (architecture rules), LaTeX system documentation in `docs/` with a per-chapter status line (complete: 1, 3, 4, 8, 9, 12, 13, 14, 15; draft: 2, 5, 7, 10, 11; stub: 6). Source comments are thorough and explain why.

### Technical Debt Signals
- `eslint.config.mjs`: no `globalIgnores` entry for `.claude/**` / `aidlc/**` (CI lint failure on PR 19).
- `tsconfig.json`: `include` holds `**/*.ts` with only `node_modules` excluded, so `tsc --noEmit` also takes in `.claude/**/*.ts`. The typecheck step passed on PR 19, but nothing keeps framework files out of the project's type check.
- Four `eslint-disable-next-line` suppressions: `src/components/pwa.tsx` (lines 98, 234), `marking-sheet.tsx` (lines 294, 332).
- Large client components: `marking-sheet.tsx` (931 lines), `src/components/demo-day.tsx` (576 lines); large services: `bookings.ts` (488), `evaluations.ts` (484), `admin.ts` (471).
- Pages and layouts read Prisma directly (reads only, which the rules allow): `admin/layout.tsx`, `courses/[courseId]/page.tsx`, `manage/layout.tsx`, `mark/page.tsx`, `edit/page.tsx`, `dev/mail/page.tsx`, `actions/scheduling.ts`.
- A few service reads take no `Actor` (`listCourseStaff`, `openRequestCount`); callers must check access first.
- No unit or integration coverage threshold; integration and e2e tests do not run in CI (they need PostgreSQL).
- Only one timezone is supported (`SUPPORTED_TIMEZONES` in `src/lib/time.ts`).
- No TODO/FIXME/HACK markers in hand-written code.

## Handoff Summary
- **Intent-relevant finding**: `eslint.config.mjs` lines 9–19 ignore only build output and `src/generated/**`. `package.json` runs `"lint": "eslint"` over the whole tree, and `.github/workflows/deploy.yml` runs `bun run lint` in the `check` job, so the vendored `.claude/` TypeScript (hooks and tools, 171 `.ts` files) that PR 19 adds is linted and fails. The fix belongs in `globalIgnores` (`.claude/**`, and `aidlc/**` for the workspace).
- **Risks / follow-up**: (1) `tsconfig.json` `include: ["**/*.ts", …]` also sweeps in `.claude/**/*.ts`. Consider adding it to `exclude` in the same change so a future framework update cannot break `typecheck`. (2) The project rules require a `docs/` update and a line in `docs/appendices/c-changelog.tex` in the same PR, and ch. 9 (`docs/chapters/09-delivery.tex`, "Checks") describes the lint step. (3) For the documentation question: ch. 6 Data model is a stub, chapters 2, 5, 7, 10 and 11 are drafts with `todo` blocks, and the ch. 11 security todo (threat model, application security review, personal-data inventory) is still open.
