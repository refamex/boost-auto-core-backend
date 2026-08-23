# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`autoboost-backend-core` — NestJS 11 (TypeScript, Express) service for an automotive parts platform. Package manager is **pnpm**. Postgres via **TypeORM** across 12 schemas (incl. `payments`). Implemented modules: **PIM, Suppliers, Inventory, Vehicles, Compatibility, Commerce, Orders, Sales, Billing, Integrations, Payments (Polar.sh), Shipping (Skydropx), Stock Sync**.

Entry point: [src/main.ts](src/main.ts) — URI versioning (`/v1`), Swagger at `/docs`, Helmet, global `ValidationPipe` (`whitelist + forbidNonWhitelisted + transform`), global filters and logging interceptor.

## Commands

Use pnpm.

- `pnpm install` — dependencies
- `pnpm start:dev` — watch mode (preferred in dev)
- `pnpm start:prod` — run compiled `dist/main`
- `pnpm build` — `nest build` (clears `dist/`)
- `pnpm lint` / `pnpm format` — ESLint `--fix` / Prettier

Tests use **two Jest configs** (do not mix them):
- `pnpm test` — unit + integration. Config inline in [package.json](package.json), `rootDir: src`, matches `*.spec.ts`.
- `pnpm test:e2e` — config [test/jest-e2e.json](test/jest-e2e.json), matches `*.e2e-spec.ts`.
- Single test: `pnpm test -- src/modules/inventory/domain/inventory.aggregate.spec.ts` or `pnpm test -- -t "reserve"`.

Migrations (TypeORM CLI wired to [src/shared/database/data-source.ts](src/shared/database/data-source.ts)):
- `pnpm migration:run` / `pnpm migration:revert` / `pnpm migration:show`
- `pnpm migration:create ./src/shared/database/migrations/<Name>` — new empty migration
- `pnpm db:reset` — drop schema + re-run migrations (dev only)

Local DB: `docker compose up -d postgres` (Postgres 16, see [docker-compose.yml](docker-compose.yml)). There is **no `.env`** committed; env vars are validated by Joi at boot — see [src/shared/config/validation.schema.ts](src/shared/config/validation.schema.ts) for the required set.

## Architecture

### Bounded contexts (hexagonal-ish, pragmatic)

Each module under [src/modules/](src/modules/) follows `domain/` → `application/` → `infrastructure/`. The depth of the domain layer is **deliberately uneven** — match the existing module when adding code:

- **`pim`** and **`suppliers`** are CRUD over taxonomies. Thin layering: `domain/entities` (TypeORM entities) → `application/services` → `infrastructure/http` controllers. No rich domain objects; services talk to repositories directly.
- **`inventory`** is the only context with a **rich domain**. [inventory.aggregate.ts](src/modules/inventory/domain/inventory.aggregate.ts) holds invariants (`stock >= 0`, `reserved <= stock`) and is the source of truth for stock mutations. Use cases ([application/use-cases/](src/modules/inventory/application/use-cases/)) depend on the `INVENTORY_REPOSITORY` port; the TypeORM adapter ([typeorm-inventory.repository.ts](src/modules/inventory/infrastructure/persistence/typeorm-inventory.repository.ts)) implements `mutate()` with a transaction + `SELECT ... FOR UPDATE` (`setLock('pessimistic_write')`) for concurrency-safe reserve/release/adjust. When adding logic that touches stock, go through the aggregate — never mutate `stock`/`reserved_stock` columns directly. **One documented exception**: `bulkUpsertStock` / `zeroOutMissing` on the repository port, used only by `stock-sync` for supplier feed imports. A run writes ~15k rows twice a day and cannot afford one locked transaction each, so the invariant the aggregate protects (`reserved_stock <= stock`) is enforced in SQL with `GREATEST(EXCLUDED.stock, COALESCE(inv.reserved_stock, 0))` instead. This matters: `Inventory.fromSnapshot` asserts invariants in its constructor, so a row written with `stock < reserved_stock` would make every later reserve/adjust **and release** throw on load — breaking the very path needed to unwind the reservation.

`InventoryModule` **exports** `INVENTORY_REPOSITORY` and the reserve/release use cases so `orders` consumes them in-process (not over HTTP).

- **`payments`** — Polar.sh checkout for `orders.orders` (`@polar-sh/sdk`). Env: `POLAR_ENABLED`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID`, `POLAR_SUCCESS_URL`, `POLAR_CANCEL_URL`, `POLAR_SERVER` (`sandbox`|`production`). Webhook at `POST /v1/payments/webhooks/polar` is `@Public()` with HMAC validation; app boot uses `rawBody: true` in [main.ts](src/main.ts). Migration: [1779738126223-AddPaymentsPolarSchema.ts](src/shared/database/migrations/1779738126223-AddPaymentsPolarSchema.ts).

- **`stock-sync`** — scheduled supplier stock imports. [rough-country-stock-sync.service.ts](src/modules/stock-sync/application/services/rough-country-stock-sync.service.ts) runs at 11:00 and 15:00 `America/Mexico_City` via `@nestjs/schedule`, guarded by a Postgres advisory lock so only one replica imports. The feed is an xlsx whose second sheet expands to >100 MB of XML, so [xlsx-stock-sheet.parser.ts](src/modules/stock-sync/infrastructure/feed/xlsx-stock-sheet.parser.ts) reads only the first sheet's entries out of the zip (`fflate` + `sax`) rather than using a general xlsx library. Runs are recorded in `integrations.import_jobs` via the exported `ImportJobService`. Env: `ROUGH_COUNTRY_SYNC_ENABLED`, `ROUGH_COUNTRY_FEED_URL`, `ROUGH_COUNTRY_BRANCH_NV_ID`, `ROUGH_COUNTRY_BRANCH_TN_ID`, `ROUGH_COUNTRY_SYNC_TZ`. Manual trigger: `POST /v1/stock-sync/rough-country/run`.

### Shared layer ([src/shared/](src/shared/))

- **`config`** — `configuration.ts` (typed config) + `validation.schema.ts` (Joi). DB and JWT settings.
- **`database`** — single `DataSource` (`synchronize: false` always), `bigint.transformer.ts`, and the initial migration which **is the hand-written SQL schema, preserved verbatim** ([1700000000000-InitialSchema.ts](src/shared/database/migrations/1700000000000-InitialSchema.ts)). The DB schema is the source of truth — do NOT regenerate it from entities.
- **`auth`** — JWT validation consuming `autoboost-backend-auth` (RS256 via JWKS). Prod: `JWT_MODE=jwks` + `JWT_JWKS_URL` → `/.well-known/jwks.json` on the auth host (no `/api`). Dev: `mock` uses `X-User-Id` / `X-Roles` (core permission strings, not auth role codes like `customer`). Never put auth HS256 secrets (`JWT_ACCESS_SECRET`, etc.) in this service. See [docs/AUTH-CONSUMER.md](docs/AUTH-CONSUMER.md).
- **`common`** — `AllExceptionsFilter` + `DomainExceptionFilter` (maps `DomainError` subclasses to HTTP status via their `httpStatus`/`code`), `LoggingInterceptor` (adds `x-request-id`), `PaginationDto` + `paginated()` helper.
- **`health`** — Terminus DB ping at `/health` (public).

### Conventions and gotchas

- **Multi-schema entities**: every entity declares `@Entity({ schema: 'pim' | 'suppliers' | 'inventory', name: '...' })`.
- **Mixed ID types** match the SQL: INT IDENTITY → `@PrimaryGeneratedColumn()` (number); BIGINT → `@PrimaryGeneratedColumn({ type: 'bigint' })` (string PK) and `bigintTransformer` on BIGINT FK columns to map to `number`.
- **FKs by non-PK column** (e.g. `product_dimension.product_sku → product.sku`) use `@JoinColumn({ referencedColumnName: 'sku' })`.
- **`updated_at` is written by a Postgres trigger** (`utils.set_updated_at`) defined in the migration. Entities also carry `@UpdateDateColumn` — both write `NOW()`, harmless redundancy; do not rely on the trigger alone or remove the column blindly.
- **Boolean query params** (`?isVisible=true`) do NOT auto-convert cleanly with the current `class-transformer` setup — known pitfall; add `@Transform` if you need them.
- **Product search** uses QueryBuilder (not nested `find` relations) to hit the `idx_product_filter_*` indexes.

### Config relaxations to know

- TS `strictNullChecks: true` but `noImplicitAny: false` and `strictBindCallApply: false` ([tsconfig.json](tsconfig.json)).
- ESLint: `no-explicit-any` off; `no-floating-promises` and `no-unsafe-argument` are **warn**, not error — floating promises won't fail the build, flag them in review.

## Related service

Tokens are issued by a separate service `autoboost-backend-auth` (sibling repo). This service only **validates** them. Expected claims: `sub` (user UUID), `email`, `roles[]`, `iss=autoboost-auth`, `aud=autoboost-core`.

Integration: [docs/AUTH-CONSUMER.md](docs/AUTH-CONSUMER.md) (core + front); auth reference copies in [docs/INTEGRATION.md](docs/INTEGRATION.md) and [docs/RS256-JWKS.md](docs/RS256-JWKS.md). `@Roles` on controllers expect `module:action` strings in the JWT `roles` claim — distinct from auth identity roles (`admin`, `customer`, …).
