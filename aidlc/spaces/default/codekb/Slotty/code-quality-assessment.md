# Code Quality Assessment — Slotty

## Summary
| Area | Rating | Evidence |
|---|---|---|
| Naming clarity | good | descriptive names, kebab-case files, `*Action` suffix |
| Function size | fair | services are mostly small functions; a few very large client components |
| Error handling | good | `DomainError` / `RuleResult` throughout; `run()` logs unexpected errors; each worker job is isolated by `job()` |
| Test presence | fair | every domain module has unit tests and services have integration tests; only unit tests run in CI; no coverage floor |
| Duplication | good | shared helpers (`notify`, `access`, `action-utils`) |
| Dead code | good | no TODO/FIXME/HACK markers in hand-written code |

## Linting — intent finding (PR 19 CI failure)
- `package.json`: `"lint": "eslint"`. With no path argument, ESLint 9 lints every file under the repository root that its config does not ignore.
- `eslint.config.mjs` `globalIgnores` lists only `.next/**`, `.next-e2e/**`, `test-results/**`, `playwright-report/**`, `out/**`, `build/**`, `next-env.d.ts`, `src/generated/**`.
- **There is no ignore for `.claude/**`** (nor for `aidlc/**`). PR 19 (`docs/system-documentation`, commit `d74df21`) adds the AI-DLC install, including 171 tracked `.ts` files under `.claude/` (hooks and tools). ESLint lints them under the Next.js and TypeScript rules, and the `check` job in `.github/workflows/deploy.yml` fails at `bun run lint`.
- Where the fix goes: `globalIgnores` in `eslint.config.mjs` (add `.claude/**`, and `aidlc/**` for the workspace). The other agent folders (`.kiro/`, `.codex/`, `.cursor/`, `.opencode/`, `.aidlc/`) are not present in the tree.
- Related type-check risk: `tsconfig.json` `include` has `**/*.ts` and `exclude` has only `node_modules`, so `tsc --noEmit` also compiles `.claude/**/*.ts`. Typecheck passed on PR 19, but it is not protected against a future framework update. Excluding `.claude` there too would keep the project's checks to the project's code.
- Existing suppressions: four `eslint-disable-next-line` (`src/components/pwa.tsx` lines 98 and 234; `marking-sheet.tsx` lines 294 and 332), each for a `react-hooks` rule.

## Testing
- **Unit** (`tests/unit/`, 8 files): booking rules, evaluation, slots, demo-day, CSV roster, ICS, `app-url`, `concurrency`. Runs in CI.
- **Integration** (`tests/integration/`, 10 files): services against `slotty_test`, run one file at a time, including a 20-way booking race. Local only.
- **E2E** (`tests/e2e/`, 2 specs): Playwright against `next build && next start` on :3100 with `ENABLE_DEV_MAIL=1`. Local only. An intermittent timeout is recorded in docs ch. 15.
- **Coverage**: no provider or threshold configured.

## CI/CD
- `deploy.yml`: `check` (frozen install, typecheck, lint, unit tests) on every push, PR and manual run; `deploy` on master only, gated on `vars.AWS_DEPLOY_ROLE_ARN` (OIDC, no long-lived keys), with a native ARM64 build, immutable SHA tags, a migrate task before rollout, and a check against circuit-breaker rollback.
- `docs.yml`: builds the PDF when `docs/**` changes and uploads it as an artifact.
- Gaps: integration and e2e tests are not in CI; no dependency or security scanning step.

## Documentation Quality
- `README.md`: thorough (local setup, demo accounts, tests, VPS deploy).
- `CLAUDE.md` / `AGENTS.md`: architecture rules and the Next.js 16 warning.
- Source comments explain why, especially in `worker.ts`, `proxy.ts`, `Dockerfile` and `deploy.sh`.
- `docs/` (LaTeX, first edition 2026-11-16 in PR 19). Chapter status from each `\chapterstatus` line:
  - **complete**: 1 Introduction, 3 Roles and journeys, 4 Business rules, 8 AWS platform, 9 Delivery, 12 Cost, 13 AI-DLC, 14 Decisions, 15 Roadmap
  - **draft**: 2 Context, 5 Building blocks, 7 Cross-cutting, 10 Operations, 11 Security (each has a `todo` block)
  - **stub**: 6 Data model
  - The ch. 11 todo still lists a threat model (STRIDE per entry point), an application security review (cookies, CSRF, CSP, sign-in rate limiting) and a personal-data inventory and retention.
- For the intent's "what's next for documentation" question, the evidence points to: finishing ch. 6 from `prisma/schema.prisma` (22 models, 11 enums, 7 migrations), then the drafts (5, 7, 2, 10), then the ch. 11 todo items. A lint fix in PR 19 touches CI checks, so by the project rule it also updates ch. 9 "Checks" if the behaviour it describes changes, and adds a line to `docs/appendices/c-changelog.tex`.

## Technical Debt
- Large files: `marking-sheet.tsx` (931 lines), `src/components/demo-day.tsx` (576), services `bookings.ts` (488), `evaluations.ts` (484), `admin.ts` (471).
- Prisma reads in pages and layouts (allowed by the rules, which forbid only mutations): `admin/layout.tsx`, `courses/[courseId]/page.tsx`, `manage/layout.tsx`, `mark/page.tsx`, `edit/page.tsx`, `dev/mail/page.tsx`, and one read in `actions/scheduling.ts`.
- Service reads without an `Actor` (`listCourseStaff`, `openRequestCount`): callers must check access first.
- Only one supported timezone (`SUPPORTED_TIMEZONES`).
- `@types/node` `^20` against the Node 22 runtime.
