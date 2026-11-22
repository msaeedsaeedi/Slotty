@AGENTS.md

# Slotty — working notes

Slotty: demo scheduling and evaluation for university courses. System documentation is one LaTeX document in `docs/` (`bun run docs:build`); read the chapter for the area you change before designing.

- Package manager/runner is **bun** (`bun run …`, `bunx …`). No pnpm or sudo.
- Local services run in Docker: `bun run infra:up` (infra/docker-compose.yml) starts Postgres 17 on :5432 with the dev database `slotty` (`.env`), Mailpit (SMTP :1025, inbox http://localhost:8025) and Caddy, which serves `bun run dev` at https://slotty.local. Tests don't use it: each run starts a throwaway Postgres with Testcontainers.
- If `docker` says permission denied in an agent shell, run it through `sg docker -c "…"`.
- `prisma migrate reset` is blocked for agents. Ask the user before wiping the dev DB.
- Checks before a pull request: `bun run typecheck`, `bun run lint`, `bun run test` (unit + integration), and `bun run test:e2e` for user-facing changes. They need Docker running (in an agent shell: `sg docker -c "bun run test"`). CI (`.github/workflows/ci.yml`) runs them all; `dev` and `master` only take PRs with a green **CI ok** that are up to date.

## Way of working
- Work is planned in the **Slotty GitHub Project** (backlog, two-week sprints, release milestones; docs ch. 13). Build only issues in the current sprint; new ideas and findings become a Backlog issue, not code.
- Branch off `dev` (the default branch) as `<type>/<issue>-<slug>`; open a pull request into `dev` from the template with `Closes #<issue>` and a release-notes label. GitHub deletes the branch when the PR merges (repository setting; `dev` and `master` are protected).
- Conventional Commits for commit messages and PR titles: `type(scope): summary` (`feat`, `fix`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `perf`, `revert`; `!` for breaking), issue in the footer (`Refs #N`/`Closes #N`). Release PRs are `chore(release): vX.Y.Z`.
- GitOps (ADR-027): `master` is production. Merging into `dev` deploys nothing; merging a release PR (`dev` → `master`, with a new `package.json` version) deploys, then tags `vX.Y.Z` and publishes the release (`.github/workflows/deploy.yml`). Hotfixes are `hotfix/*` PRs into `master`; rollback is a revert PR into `master`. Merge the Back-merge PR it opens afterwards. Never open or merge a PR into `master` without the user's go-ahead.
- Security weaknesses are tracked in private draft advisories with neutrally worded public issues; the repository is public.
- Iterate on the design in conversation first; implement when the user says go.
- When a milestone's release is live, plan before building: triage the backlog (new issues and findings) and agree the next milestone and sprint with the user, then start its first issue.

## Architecture rules
- Business rules go in `src/domain/*` as pure functions returning `RuleResult`. Services call them with `assertRule`. Change the rule, its unit test and docs chapter 4 together.
- Every service takes an `Actor` and checks access itself (`assertCourseRole` / `assertStaff` / `assertAdmin` / `assertPlatform` in `services/access.ts`). Pages and actions never query Prisma for mutations.
- Services throw `DomainError` for user-facing failures. Server Actions wrap calls in `run()` (`server/action-utils.ts`), which refreshes the page and returns `{ok, message|error}` for `<ActionForm>`.
- Send notifications with `notify(tx, …)` inside the same transaction as the change (outbox pattern). Never send email or push directly from a request.
- Times are stored in UTC; display and input use the course timezone (`lib/time.ts`: `fmt`, `fromLocalInput`).
- Record moderation-relevant changes with `audit(tx, actor, …)`.
- Admins and platform accounts never join courses; a platform account is never an admin (ADR-016).

## Testing
- Business rules in `src/domain` have unit tests (`tests/unit`).
- Services are covered by integration tests against a throwaway Postgres (Testcontainers, `tests/support/postgres.ts`; `tests/integration`, `bun run test`); user flows by Playwright (`tests/e2e`, `bun run test:e2e` → `tests/e2e/run.ts`, a production build on :3100).

## Deployment
- Application: merge a release PR into `master` (docs ch. 9); `.github/workflows/deploy.yml` builds both ARM64 images (`docker-bake.hcl`), runs migrations as a one-off ECS task when `prisma/migrations` changed, rolls out web and worker and checks `/health` reports the new release (`infra/aws/deploy.sh`, ADR-022).
- Infrastructure: Terraform in `infra/aws/org` (management account) and `infra/aws/app` (slotty-prod). Always show `terraform plan` and get approval before `apply`; never apply unreviewed.
- Migrations must keep the previous release working (expand, then contract in a later release): rollback does not undo them.

## Decided (don't re-ask; propose a superseding ADR instead)
- AWS architecture and its trade-offs are ADR-001… in docs chapter 14 (`docs/chapters/14-decisions.tex`).
- Budget is $55/month for slotty-prod (ADR-030), enforced by SCPs and AWS Budgets; estimate cost changes in docs chapter 12.
- No RDS Proxy or transaction-mode pooler: the worker needs LISTEN/NOTIFY.

## Never
- Run `prisma migrate reset` or otherwise wipe a database without the user's explicit approval.
- Send email or push directly from a request; always through the outbox.
- Mutate data from pages or Server Actions with Prisma directly; go through a service.
- Commit `terraform.tfvars`, Terraform state or plans, `.env` files, or print secrets from SSM.

## Always
- Update the documentation chapters a change affects in the same pull request, and add a line to `docs/appendices/c-changelog.tex`. Map: user flows → ch. 3; rules → ch. 4; modules → ch. 5; schema → ch. 6; patterns → ch. 7; AWS → ch. 8 (and ch. 12 for cost); CI/CD → ch. 9; runbooks and alarms → ch. 10; security controls → ch. 11; roadmap → ch. 15.
- Record a deliberate trade-off as a new ADR in `docs/chapters/14-decisions.tex`.
- Check `bun run docs:build` succeeds when `docs/` changes.
