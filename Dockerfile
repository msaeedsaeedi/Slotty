# One image for every Slotty process; the command picks the role:
#   web (default)   node server.js
#   worker          node dist/jobs/worker.js
#   first admin     node dist/jobs/create-admin.js   (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME)
# Migrations need the Prisma CLI (~270 MB), so they get their own image, the `migrate` target:
#   docker build -t slotty-app .                                  # web, worker, admin
#   docker build --target migrate -t slotty-app:migrate .         # prisma migrate deploy
# Configuration is read at runtime only, so the same image runs on a VPS or on AWS (ECS) unchanged.
# The runtime is plain Node: the web app is Next's standalone output (only the files it traces),
# and the worker scripts are bundled by Bun at build time.

FROM oven/bun:1.3.14 AS bun

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
# `prisma generate` runs on postinstall; it needs a DATABASE_URL to load its config but never connects.
RUN DATABASE_URL=postgres://build@localhost/build bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgres://build@localhost/build bun run build \
 && bun build src/jobs/worker.ts src/jobs/create-admin.ts --target=node --outdir dist/jobs --external @node-rs/argon2 \
 && echo '{"type":"module"}' > dist/jobs/package.json

# Just the Prisma CLI (and the dotenv its config imports), for `migrate deploy`.
FROM base AS migrate-deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app/migrate
RUN printf '%s' '{"name":"slotty-migrate","private":true,"dependencies":{"prisma":"7.10.0","dotenv":"18.0.3"},"trustedDependencies":["prisma","@prisma/engines"]}' > package.json \
 && bun install --production && rm -rf /root/.bun
COPY prisma.config.ts ./
COPY prisma ./prisma

FROM base AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# CA bundle for verified TLS to Amazon RDS (set NODE_EXTRA_CA_CERTS to this path and use sslmode=verify-full).
# If AWS reissues the bundle the checksum fails the build: download it, update the hash.
ADD --checksum=sha256:90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
RUN chmod 644 /app/certs/rds-global-bundle.pem
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM app AS migrate
USER root
# Prisma's engine uses OpenSSL and detects its version from the openssl binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
USER node
COPY --from=migrate-deps --chown=node:node /app/migrate ./migrate
WORKDIR /app/migrate
# The schema engine's `sslcert` URL option reads only the first certificate of a file, and the RDS
# bundle holds one root per region. So OpenSSL's default trust store is the whole bundle instead.
# This container only ever talks to the database. Elsewhere (Postgres without TLS) it's unused.
ENV SSL_CERT_FILE=/app/certs/rds-global-bundle.pem
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# Default target: the app image.
FROM app
