@AGENTS.md

# Slotty — working notes

- Package manager/runner is **bun** (`bun run …`, `bunx …`). No pnpm or sudo.
- Local services run in Docker: `bun run infra:up` (infra/docker-compose.yml) starts Postgres 17 on :5432 and Mailpit (SMTP :1025, inbox http://localhost:8025). One server holds three databases: `slotty` (dev, `.env`), `slotty_test` (tests, `.env.test`), and `slotty_app` (`bun run app:up`, the production image on :3001).
- If `docker` says permission denied in an agent shell, run it through `sg docker -c "…"`.
- `prisma migrate reset` is blocked for agents. Ask the user before wiping the dev DB.
- Checks: `bun run typecheck`, `bun run lint`, `bun run test` (unit + integration), `bun run test:e2e`.

## Architecture rules
- Business rules go in `src/domain/*` as pure functions returning `RuleResult`. Services call them with `assertRule`.
- Every service takes an `Actor` and checks access itself (`assertCourseRole` / `assertStaff` / `assertAdmin` in `services/access.ts`). Pages and actions never query Prisma for mutations.
- Services throw `DomainError` for user-facing failures. Server Actions wrap calls in `run()` (`server/action-utils.ts`), which refreshes the page and returns `{ok, message|error}` for `<ActionForm>`.
- Send notifications with `notify(tx, …)` inside the same transaction as the change (outbox pattern). Never send email directly from a request.
- Times are stored in UTC; display and input use the course timezone (`lib/time.ts`: `fmt`, `fromLocalInput`).
- Record moderation-relevant changes with `audit(tx, actor, …)`.
