# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-16
- Commit: d74df214376505309c27eb390ff60902da946ae4
- Branch: docs/system-documentation (PR 19)
- Kind of run: first full scan (no existing store), Minimal depth, done by the developer alone
- Left out (not opened): `node_modules/`, `.next/`, `.next-e2e/`, `test-results/`, `src/generated/`, `docs/build/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `.env`, `certificates/`, `deploy/caddy-root.crt`, `bun.lock`, and the AI-DLC install and workspace (`.claude/`, `aidlc/`)

## Scope of Analysis

```yaml
scope_version: 1
kind: full
intent: ci-lint-fix
fingerprint: b097b997046c24a17dc35a8d2726d93a222fd14f
analyzed:
  paths:
    - ./
  components:
    - Web App Pages
    - Server Actions
    - Route Handlers
    - UI Components
    - Origin Proxy
    - Action Utilities
    - Session and Auth
    - Domain Services
    - Domain Rules
    - Time Utilities
    - Database Client
    - Outbox Signal
    - Background Worker
    - Admin Bootstrap Script
    - Startup Checks
    - Service Worker
    - Database Migrations
    - Test Suites
    - Container Image
    - Local Infrastructure
    - VPS Deployment
    - AWS Organization Terraform
    - AWS Application Terraform
    - Deploy Script
    - CI Workflows
    - Lint and Type Configuration
    - System Documentation
shallow:
  paths:
    - src/app/(app)/
    - src/app/(auth)/
    - src/components/
    - tests/
    - prisma/migrations/
    - infra/aws/app/
    - infra/aws/org/
    - deploy/
    - docs/
```
