# One image for every Slotty process: the web app (default), the worker and migrations.
#   docker build -t slotty-app .
# Configuration is read at runtime only, so the same image runs on a VPS or on AWS (ECS) unchanged.

FROM oven/bun:1.3.14 AS bun

FROM node:22-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
# `prisma generate` runs on postinstall; it needs a DATABASE_URL to load its config but never connects.
RUN DATABASE_URL=postgres://build@localhost/build bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgres://build@localhost/build bun run build && rm -rf .next/cache

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Web app on Node. The worker runs with `bun src/jobs/worker.ts`, migrations with `node_modules/.bin/prisma migrate deploy`.
CMD ["node_modules/.bin/next", "start"]
