# Slotty

Slotty is a scheduling and evaluation platform for academic demo sessions. This repo is a Turborepo monorepo with a Next.js web app and a NestJS API.

## Local development

### Prerequisites

- bun 1.3+
- Docker with Docker Compose
- Node.js 18+

### Quick start

```sh
bun install
docker compose -f docker-compose.dev.yml up -d
cp apps/api/.env.example apps/api/.env
bun run dev
```

### URLs and ports

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1/health
- Postgres: localhost:5432 (user: slotty, password: slotty, db: slotty_dev)
- Redis: localhost:6379

### Useful scripts

```sh
bun run dev --filter=web
bun run dev --filter=api
bun run lint
bun run check-types
```

### Notes

- The dev Compose file starts Postgres and Redis only. The API and web apps run locally.
- The API loads env values from apps/api/.env via NestJS ConfigModule.
