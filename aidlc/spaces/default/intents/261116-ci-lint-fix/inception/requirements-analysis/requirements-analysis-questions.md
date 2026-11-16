# Requirements Analysis — Questions

Context: PR 19 (`docs/system-documentation`) fails the CI `check` job at `bun run lint`. All 56 errors are in the AI-DLC framework files under `.claude/tools/`, which ESLint picks up because `eslint.config.mjs` does not ignore `.claude/**` (see `aidlc/spaces/default/codekb/Slotty/code-quality-assessment.md`). The lint fix itself is clear; two choices around it are yours.

## Q1. [Developer] Should the type check skip the framework files too?

`tsconfig.json` includes `**/*.ts` and excludes only `node_modules`, so `bun run typecheck` also compiles the 171 framework `.ts` files under `.claude/`. It passes today, but a future framework update could break the project's typecheck the same way lint broke now.

A. Yes: exclude `.claude` (and `aidlc`) from `tsconfig.json` as well, so the project's checks cover only the project's code
B. No: change only the ESLint config; leave typecheck as it is
X. Other (please specify)

[Answer]: A

## Q2. [Developer] Where should the fix go?

PR 19 is the change that added the framework files, so it is the one that fails.

A. Commit the fix on the PR 19 branch (`docs/system-documentation`), so PR 19 itself goes green
B. Put the fix on its own branch and pull request into `master` first, then update PR 19 from `master`
X. Other (please specify)

[Answer]: A
