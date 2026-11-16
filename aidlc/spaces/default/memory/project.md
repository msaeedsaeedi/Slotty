# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance.
> Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->
<!-- A project that merges into another branch than team.md names says so on its own line, read before team.md's: -->
<!-- - **Integration branch**: develop -->
- Slotty: demo scheduling and evaluation for university courses. System documentation: `docs/` (LaTeX, `bun run docs:build`); read the chapter for the area you change before designing.
- **Integration branch**: master
- Work on a branch and open a pull request. Merging to master deploys to production automatically (`.github/workflows/deploy.yml`).
- Package manager and runner is bun (`bun run …`, `bunx …`). Local services run in Docker (`bun run infra:up`); if docker says permission denied, run it through `sg docker -c "…"`.


## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->
- Business rules in `src/domain` have unit tests; change the rule, its test and docs chapter 4 together.
- Services are covered by integration tests against the `slotty_test` database (`bun run test`); user flows by Playwright (`bun run test:e2e`).
- Checks before a pull request: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:e2e` for user-facing changes.


## Guard Policy

<!-- Project-specific. Mode: strict, relaxed, or off. Strict here holds for every intent, whatever one person asks in chat; relaxed or off here applies to every intent whose policy came from its scope, unless the person sets another; changing this line changes it. A section under the retired Change Control heading, written by an earlier release, is still read. -->

## Deployment

<!-- Project-specific specialisation. -->
- Application: merge to master; CI builds ARM64 images, runs migrations as a one-off ECS task, rolls out web and worker (`infra/aws/deploy.sh`).
- Infrastructure: Terraform in `infra/aws/org` (management account) and `infra/aws/app` (slotty-prod). Always show `terraform plan` and get approval before `apply`; never apply unreviewed.
- Migrations must keep the previous release working (expand, then contract in a later release): rollback does not undo them.


## Code Style

<!-- Project-specific specialisation. -->
- Business rules go in `src/domain/*` as pure functions returning `RuleResult`; services call them with `assertRule`.
- Every service takes an `Actor` and checks access itself (`assertCourseRole` / `assertStaff` / `assertAdmin` in `src/server/services/access.ts`).
- Services throw `DomainError` for user-facing failures; Server Actions wrap calls in `run()` (`src/server/action-utils.ts`).
- Notifications via `notify(tx, …)` inside the same transaction as the change (outbox); record moderation-relevant changes with `audit(tx, actor, …)`.
- Times stored in UTC; displayed and entered in the course timezone (`src/lib/time.ts`).


## Tech Stack

<!-- Technology choices locked for this project. -->
- Next.js 16 (App Router; read `node_modules/next/dist/docs/` before writing Next code — APIs differ from older versions), React 19, TypeScript.
- Prisma 7 with PostgreSQL 17 (`@prisma/adapter-pg`); Bun for tooling and the worker build; Node 22 in production.
- AWS (us-east-1, account slotty-prod): ECS Fargate ARM64, API Gateway HTTP API + CloudFront, RDS PostgreSQL, SES, SSM, Terraform.


## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->
DECIDED: AWS architecture and its trade-offs are recorded as ADR-001..014 in docs chapter 14 (`docs/chapters/14-decisions.tex`); do not re-ask them, propose a superseding ADR instead (Stage infrastructure-design, 2026-11-16)
DECIDED: Budget is $50/month for slotty-prod, enforced by SCPs and AWS Budgets; cost changes are estimated in docs chapter 12 (Stage feasibility, 2026-11-16)
DECIDED: No RDS Proxy or transaction-mode pooler: the worker needs LISTEN/NOTIFY (Stage nfr-design, 2026-11-16)


## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: - NEVER [behavior] (affirmed [date]) -->
<!-- Example: - NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->
- NEVER run `prisma migrate reset` or otherwise wipe a database without the user's explicit approval (affirmed 2026-11-16)
- NEVER send email or push directly from a request; always through the outbox (affirmed 2026-11-16)
- NEVER mutate data from pages or Server Actions with Prisma directly; go through a service (affirmed 2026-11-16)
- NEVER commit `terraform.tfvars`, Terraform state or plans, `.env` files, or print secrets from SSM (affirmed 2026-11-16)


## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: - ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: - ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->
- ALWAYS update the documentation chapters a change affects, in the same pull request, and add a line to `docs/appendices/c-changelog.tex` (affirmed 2026-11-16). Map: user flows → ch. 3; rules → ch. 4; modules → ch. 5; schema → ch. 6; patterns → ch. 7; AWS → ch. 8 (and ch. 12 for cost); CI/CD → ch. 9; runbooks and alarms → ch. 10; security controls → ch. 11; roadmap → ch. 15
- ALWAYS record a deliberate trade-off as a new ADR in `docs/chapters/14-decisions.tex` (affirmed 2026-11-16)
- ALWAYS check `bun run docs:build` succeeds when `docs/` changes (affirmed 2026-11-16)


## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
