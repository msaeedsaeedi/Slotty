# Requirements — CI lint fix for PR 19

## Intent Analysis

- **Request** (verbatim): "ci failed on pr 19. also what's next for the documentation?"
- **Goal**: get PR 19 (`docs/system-documentation`, "Docs: LaTeX system documentation; adopt AWS AI-DLC") through the CI `check` job so it can be merged, and keep the project's checks scoped to the project's own code so later AI-DLC framework updates cannot break them.
- **Type**: bug fix (CI configuration). **Scope**: build tooling only (`eslint.config.mjs`, `tsconfig.json`) plus the documentation the project rules require. **Complexity**: simple.
- **Cause** (from the code scan, `aidlc/spaces/default/codekb/Slotty/code-quality-assessment.md`): `"lint": "eslint"` lints the whole repository. `globalIgnores` in `eslint.config.mjs` does not list `.claude/**`, so the 171 framework `.ts` files PR 19 adds under `.claude/` are linted against the Next.js and TypeScript rules. The result is 56 errors and 53 warnings, and the job fails (GitHub Actions run 43882754367). None of the errors are in `src/`.
- **Context**: Slotty is a Next.js 16 app with a worker, described in `aidlc/spaces/default/codekb/Slotty/business-overview.md` and `architecture.md`. The two config files sit at the repository root, as described in `code-structure.md`. No application code changes.
- The second half of the request ("what's next for the documentation?") is a question, and it was answered in conversation. It adds no requirement here (see Out of Scope).

## Functional Requirements

### FR1: Lint covers only the project's code
- **FR1.1**: `eslint.config.mjs` adds `.claude/**` and `aidlc/**` to its `globalIgnores` list, next to the existing entries, with a comment saying they are the AI-DLC framework install and workspace. Source: the CI log, plus the AI-DLC rule that its own install is not project code.
- **FR1.2**: The existing ignores (`.next/**`, `.next-e2e/**`, `test-results/**`, `playwright-report/**`, `out/**`, `build/**`, `next-env.d.ts`, `src/generated/**`) and the `nextVitals`/`nextTs` rule sets stay unchanged. No rule is turned off or weakened, and no `eslint-disable` is added.

Acceptance criteria:
- Given the PR 19 branch with the fix, when `bun run lint` runs, then it exits 0 and reports no problem in any file under `.claude/` or `aidlc/`.
- Given a lint error introduced in a file under `src/`, when `bun run lint` runs, then it still fails. The project's own code is still linted.

### FR2: Typecheck covers only the project's code ([Q1] answer A)
- **FR2.1**: `tsconfig.json` `exclude` lists `.claude` and `aidlc` beside `node_modules`.
- **FR2.2**: `include` and every compiler option stay unchanged.

Acceptance criteria:
- Given the fix, when `bun run typecheck` runs, then it exits 0, and the files under `.claude/` are not part of the compilation (`bunx tsc --noEmit --listFilesOnly` lists none of them).
- Given a type error introduced in a file under `src/`, when `bun run typecheck` runs, then it still fails.

### FR3: Documentation updated in the same change (project rule: ALWAYS update affected chapters and the changelog)
- **FR3.1**: `docs/chapters/09-delivery.tex`, section "Checks": one sentence saying that typecheck and lint cover the project's code and skip the AI-DLC folders `.claude/` and `aidlc/`.
- **FR3.2**: `docs/appendices/c-changelog.tex`: one new line dated 2026-11-16, newest first, recording that CI checks exclude the AI-DLC framework folders.
- **FR3.3**: `bun run docs:build` succeeds after the change (project rule).

Acceptance criteria:
- Given the documentation edits, when `bun run docs:build` runs, then it produces `docs/build/slotty.pdf` with no error.
- Given the changelog, when it is read, then its newest row describes this change.

### FR4: The fix lands on PR 19 ([Q2] answer A)
- **FR4.1**: The changes are committed on the branch `docs/system-documentation` and pushed, so PR 19 reruns CI. Committing and pushing happen only when the person asks for it.

Acceptance criteria:
- Given the pushed commit, when the `Deploy` workflow's `check` job runs on PR 19, then the typecheck, lint and unit-test steps all pass.

## Non-Functional Requirements

- **NFR1 (no regression)**: `bun run test:unit` passes before and after the change, with the same number of tests. Lint and typecheck results for `src/`, `tests/`, `prisma/` and the other project folders are the same before and after: no new error and no lost error.
- **NFR2 (scope of the change)**: The diff touches exactly `eslint.config.mjs`, `tsconfig.json`, `docs/chapters/09-delivery.tex` and `docs/appendices/c-changelog.tex`. No file under `.claude/` or `aidlc/` is edited to satisfy lint.

## Constraints

- Package runner is bun (`bun run …`). The ESLint 9 flat config uses `globalIgnores` from `eslint/config` (project rules, Tech Stack).
- Work stays on the PR branch, and merging to `master` deploys to production (project rules, Way of Working). This change does not affect the deployed application.
- Framework files are vendored and regenerated by AI-DLC. Editing them to pass lint would be lost on the next update, so they are excluded rather than fixed.

## Assumptions

- [assumption] Nothing in the project's own code imports from `.claude/` or `aidlc/`, so excluding them from typecheck removes no type information the app needs. Rationale: the code scan found no such import (`code-structure.md`). Typecheck after the change confirms it (FR2 criteria).
- [assumption] `aidlc/` holds no `.ts` files today, so the `aidlc` entries are preventive. Rationale: the code scan lists it as Markdown and JSON workflow records.

## Out of Scope

- Fixing the lint findings inside the framework files themselves.
- The documentation roadmap (ch. 6 data model, drafts of chapters 2, 5, 7, 10 and 11). It was answered as a question and would be separate work.
- Changing CI steps in `.github/workflows/deploy.yml` or `docs.yml`.

## Open Questions

None.
