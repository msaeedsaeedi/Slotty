@AGENTS.md

# Slotty — working notes

- Package manager/runner is **bun** (`bun run …`, `bunx …`). There is no Docker, pnpm, or sudo on the dev machine; the local DB is `prisma dev`.
- Dev DB: `bunx prisma dev --name slotty --detach` (port 51214). Test DB: `--name slotty-test` (port 51218, `.env.test`). Both are PGlite, so keep `DATABASE_POOL_MAX=1`.
- `prisma migrate reset` is blocked for agents. Ask the user before wiping the dev DB.
- Checks: `bun run typecheck`, `bun run lint`, `bun run test` (unit + integration), `bun run test:e2e`.

## Architecture rules
- Business rules go in `src/domain/*` as pure functions returning `RuleResult`. Services call them with `assertRule`.
- Every service takes an `Actor` and checks access itself (`assertCourseRole` / `assertStaff` / `assertAdmin` in `services/access.ts`). Pages and actions never query Prisma for mutations.
- Services throw `DomainError` for user-facing failures. Server Actions wrap calls in `run()` (`server/action-utils.ts`), which refreshes the page and returns `{ok, message|error}` for `<ActionForm>`.
- Send notifications with `notify(tx, …)` inside the same transaction as the change (outbox pattern). Never send email directly from a request.
- Times are stored in UTC; display and input use the course timezone (`lib/time.ts`: `fmt`, `fromLocalInput`).
- Record moderation-relevant changes with `audit(tx, actor, …)`.
