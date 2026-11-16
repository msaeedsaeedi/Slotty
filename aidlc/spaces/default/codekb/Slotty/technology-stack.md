# Technology Stack — Slotty

Versions are from `package.json` and the installed `node_modules/*/package.json` at commit `d74df21`.

## Languages and Runtimes
| Item | Version | Where |
|---|---|---|
| TypeScript | 5.9.3 (`^5`), strict | all application code |
| Bun | 1.3.14 (`packageManager`, CI, Dockerfile) | package manager, script runner, worker bundler, local worker |
| Node.js | 22 (`node:22-bookworm-slim`) | production runtime for web and worker |
| SQL | PostgreSQL 17 | Prisma migrations |
| HCL | Terraform >= 1.10, AWS provider ~> 6.0, random ~> 3.6 | `infra/aws` |
| Bash / sh | — | `infra/aws/deploy.sh`, `deploy/backup.sh`, `docs/tooling/build.sh` |
| LaTeX | pinned TeX Live image (`docs/tooling/Dockerfile`), latexmk | `docs/` |

## Application Frameworks and Libraries
| Library | Version | Purpose |
|---|---|---|
| next | 16.3.6 | App Router, Server Actions, `proxy.ts`, standalone output |
| react / react-dom | 19.2.8 | UI |
| @prisma/client, @prisma/adapter-pg, prisma | 7.10.0 | ORM, migrations |
| pg | 8.23.0 | worker LISTEN connection; Prisma adapter driver |
| zod | 4.6.5 | input validation |
| date-fns / @date-fns/tz | 4.4.0 / 1.5.0 | timezone-aware formatting |
| @node-rs/argon2 | 2.2.1 | password hashing (kept external in the Bun bundle) |
| nodemailer | 10.0.10 | SMTP delivery |
| web-push | 3.6.7 | VAPID Web Push |
| papaparse | 5.7.0 | CSV roster parsing |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | styling |
| shadcn (style `radix-nova`), radix-ui | 4.21 / 1.6.7 | component primitives |
| lucide-react, sonner, next-themes | 1.48.0, 2.0.8, 0.4.6 | icons, toasts, theming |
| class-variance-authority, clsx, tailwind-merge, tw-animate-css | 0.7.1, 2.1.1, 3.7.0, 1.4.0 | styling helpers |
| server-only | 0.0.1 | server import guard |
| dotenv | 18.0.3 (dev) | env loading in worker, Prisma config, test configs |

## Tooling
| Tool | Version | Config |
|---|---|---|
| ESLint | 9.39.5 | `eslint.config.mjs` (flat config) |
| eslint-config-next | 16.3.6 | core-web-vitals + typescript presets |
| Vitest | 5.0.1 | `vitest.config.mts` (projects `unit`, `integration`) |
| Playwright | 1.63.0 | `playwright.config.ts` (Chromium, port 3100) |
| Prisma config | 7.10.0 | `prisma.config.ts` (seed `bun prisma/seed.ts`) |
| PostCSS | — | `postcss.config.mjs` |
| shadcn | — | `components.json` |
| Docker / Compose | — | `Dockerfile`, `infra/docker-compose.yml`, `deploy/docker-compose.yml` |
| GitHub Actions | `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `aws-actions/configure-aws-credentials@v4`, `amazon-ecr-login@v2`, `docker/build-push-action@v6` | `.github/workflows/` |

## Platform Services
- **Local**: Postgres 17, Mailpit (`axllent/mailpit`), Caddy 2 (local CA for https://slotty.local).
- **AWS (us-east-1, slotty-prod)**: CloudFront, API Gateway HTTP API, ECS Fargate ARM64 (Graviton), ECR, RDS PostgreSQL, SES v2 (SMTP, configuration set, bounce and complaint events), SSM Parameter Store, Route 53, Cloud Map, VPC with a NAT instance (fck-nat AMI on EC2) and one VPC endpoint, CloudWatch Logs and alarms, SNS, IAM (GitHub OIDC deploy role), Organizations SCPs, AWS Budgets, S3 plus CloudTrail for Terraform state. Details and costs: docs ch. 8 and ch. 12.
