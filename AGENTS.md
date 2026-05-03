## Commands

- Package manager is Bun 1.3.13: use `bun run <script>` (not npm/yarn)
- Tests run from `apps/api`: `bun run test --testPathPatterns="<pattern>"` (NOT `--testPathPattern`)
- E2E/integration tests require Docker: `bun run docker:test:up` then `bun run test:e2e` or `test:integration`
- Lint (Biome): `bun run lint` from root (Turbo delegates to `biome check --write` per package)
- Typecheck: `bun run check-types` from root
- If Biome CLI schema mismatches: `biome migrate`

## Structure

- Monorepo: Turbo orchestrates `apps/*` and `packages/*` workspaces
- `apps/api` - NestJS API (main entrypoint for backend work)
- `apps/web` - Frontend app
- `packages/ui`, `packages/biome-config`, `packages/typescript-config` - shared packages
- API modules: `src/modules/{auth,users,bookings,slots,assignments,courses,evaluations,notifications,audit}`

## API Documentation (OpenAPI 3.1)

- Swagger UI: `http://localhost:<port>/api/docs` (served by `@nestjs/swagger`)
- JSON spec: `http://localhost:<port>/api/docs-json`
- YAML spec: `http://localhost:<port>/api/docs-yaml`
- Setup in `apps/api/src/main.ts` using `DocumentBuilder` with cookie auth (`connect.sid`)
- DTOs use `@ApiProperty()` / `@ApiPropertyOptional()` decorators from `@nestjs/swagger`
- Controllers use `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()`, `@ApiParam()` decorators
- When adding new endpoints: add `@ApiOperation` (summary), `@ApiResponse` (status codes), and `@ApiParam` (path params)
- When adding new DTOs: add `@ApiProperty()` with description, format, enum, min/max as applicable

## Testing

- Use test factories from `@test/utils/factories` (e.g. `createMockUser`, `createMockSlot`)
- Prisma mocks use `$transaction(fn)` and `$queryRaw` patterns - mirror this in new tests
- Jest path aliases: `@/` → `src/`, `@test/` → `test/`
- Test timeout: 10000ms; coverage thresholds enforced (80% lines/statements/functions, 75% branches)

## Conventions

- Keep changes scoped to module boundaries; avoid cross-package coupling
- Align feature work with FR/PRD references in `docs/`
- Biome format: tab indent (2 spaces), 120 line width

## OpenCode

- Reindex: `index_codebase` with flags (e.g. `force`, `estimate`); report final stats
- Index health: `index_status`, `index_metrics`; note provider, index location, and branch
