Closes #

## What changes

## Checklist
- [ ] Issue is in the current sprint (or labelled P0)
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` (and `bun run test:e2e` for user-facing changes)
- [ ] Rules in `src/domain` with unit tests; services check access with the `Actor`
- [ ] Docs chapters updated, plus a line in `docs/appendices/c-changelog.tex`; `bun run docs:build`
- [ ] Migrations are expand-only (the previous release keeps working); contract in a later release
- [ ] Terraform: `plan` posted below and reviewed before `apply`
- [ ] Label for release notes: `enhancement`, `bug`, `security`, `documentation`, `chore` or `skip-release-notes`
