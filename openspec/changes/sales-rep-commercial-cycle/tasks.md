# Tasks: `customers` — Commercial Customer Registry for Sales Reps

**Change slug**: `sales-rep-commercial-cycle` · **Phase**: sdd-tasks · **Base**: `origin/main` @ `3de05df`

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,400–1,700 (proposal R6, prospect lifecycle included) |
| 400-line budget risk | High |
| Actual session budget (2000 lines) | Medium — fits, ~15–30% margin only; migration + 2 entities + 2 domain + 2 services + dto + controller + module + 4 unit specs + 2 e2e specs + db.md is enough surface to land at the top of the range or past it |
| Chained PRs recommended | Yes |
| Suggested split | PR-1: schema + profile + visibility · PR-2: branches + main-branch invariant |
| Delivery strategy | single-pr |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

Rationale: estimate is 3.5–4x the generic 400-line default, so the guard fires regardless of this
session's elevated 2000-line budget. It likely fits under 2000, but with too little margin to treat
as safe without confirmation — `sdd-apply` should get an explicit `size:exception` or a chosen chain
strategy before starting, per `single-pr`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Schema (both tables) + `CustomerProfileService` + `customer-visibility`/`customer-link` + profile routes | PR-1 | `pnpm test -- src/modules/customers/domain/customer-visibility.spec.ts src/modules/customers/domain/customer-link.spec.ts src/modules/customers/application/services/customer-profile.service.spec.ts` | `pnpm test:e2e -- customers.e2e-spec.ts` (profile/link/400 cases) + `customers-constraints.e2e-spec.ts` (Docker up; `uq_customer_profile_auth_customer_id`, many-NULL prospects) | Revert migration + profile entity/service/dto/controller routes + `app.module.ts` line; no other module touched |
| 2 | `CustomerBranchService` + main-branch invariant + branch routes | PR-2 | `pnpm test -- src/modules/customers/application/services/customer-branch.service.spec.ts` | `pnpm test:e2e -- customers-constraints.e2e-spec.ts` (Docker up; `uq_customer_branch_main`, concurrent promote) + branch cases in `customers.e2e-spec.ts` | Revert branch entity/service/dto/controller routes + branch specs; profile registry from PR-1 stays functional unchanged |

## Phase 1: Foundation

- [ ] 1.1 Create a fresh worktree/branch off `origin/main@3de05df` (e.g. `../autoboost-backend-core-worktrees/sales-rep-commercial-cycle`, branch `feat/sales-rep-commercial-cycle`). Never build on the local tree — it lacks `quotes`/`notifications` and stops at migration `...224`.
- [ ] 1.2 Re-verify with `git ls-tree -r --name-only origin/main -- src/shared/database/migrations` that the max timestamp is `1779738126226`; confirm `1779738126227` is free.
- [ ] 1.3 Write `src/shared/database/migrations/1779738126227-AddCustomersSchema.ts`: `CREATE SCHEMA customers`, `customer_profile` + `customer_branch` tables, FK `customer_branch.customer_profile_id → customer_profile(id) ON DELETE CASCADE`, `idx_customer_profile_owner_sales_rep_id`, `idx_customer_branch_profile_id`, 2 `utils.set_updated_at` triggers, `up()`/`down()` shaped like `AddShippingSchema1779738126224`. **Do NOT add the two partial unique indexes yet** — Phase 5 proves them RED first per strict TDD.
- [ ] 1.4 Create `src/modules/customers/domain/entities/customer-profile.entity.ts` and `customer-branch.entity.ts` per design D5 (`@Entity({schema:'customers', name:...})`, UUID PK, no FK on `authCustomerId`/`ownerSalesRepId`).

## Phase 2: Domain rules (TDD — pure modules, zero mocks)

- [ ] 2.1 RED: `src/modules/customers/domain/customer-visibility.spec.ts` — admin (`{}`, incl. unowned), rep (`{ownerSalesRepId}`), customer tier absent (out of scope this change), no-match filter → `null` → empty page (per `customer-visibility` spec scenarios).
- [ ] 2.2 GREEN: `customer-visibility.ts` implementing `buildWhere(user, query)`.
- [ ] 2.3 RED: `customer-link.spec.ts` — allows `NULL → value`, rejects re-link to a different value.
- [ ] 2.4 GREEN: `customer-link.ts` link-once guard.

## Phase 3: Application services (TDD — mocked `Repository`/`DataSource`)

- [ ] 3.1 RED: `customer-profile.service.spec.ts` — create stamps `user.salesRepId`; body `ownerSalesRepId` never read; admin house account (`owner = NULL`); non-admin without `salesRepId` → 422; update/deactivate leaves branches untouched; scoped miss → 404 (never 403); link CAS `affected !== 1` → 409; `23505` on `uq_customer_profile_auth_customer_id` → 409.
- [ ] 3.2 GREEN: `customer-profile.service.ts`, incl. `findByAuthCustomerId(authCustomerId)`.
- [ ] 3.3 RED: `customer-branch.service.spec.ts` — `demoteOtherMainBranches` called with correct args before promote; `23505` on `uq_customer_branch_main` → `ConflictException`; delete-main blocked (sole branch and non-sole); delete non-main succeeds; scoped miss → 404.
- [ ] 3.4 GREEN: `customer-branch.service.ts` with transactional demote-then-promote.

## Phase 4: HTTP + wiring

- [ ] 4.1 `src/modules/customers/infrastructure/http/dto/customer.dto.ts` — Create/Update/Query/Link/ReassignOwner DTOs; `ownerSalesRepId` absent from `CreateCustomerDto` (D7) so the global `ValidationPipe` 400s it.
- [ ] 4.2 `customer.controller.ts` — `@Roles`/`@CurrentUser`; action routes (`:id/link`, `:id/owner`) declared before `:id`; branch routes under `/v1/customers/:customerId/branches` with a `loadOwnedProfile` check.
- [ ] 4.3 `customers.module.ts` — `TypeOrmModule.forFeature([CustomerProfileEntity, CustomerBranchEntity])`; export `CustomerProfileService`, `CustomerBranchService` only (no entities/repo exported).
- [ ] 4.4 Register `CustomersModule` in `src/app.module.ts`.
- [ ] 4.5 Document the `customers` schema in `db.md`.

## Phase 5: DB integration tests — Docker required

- [ ] 5.1 RED: `test/customers-constraints.e2e-spec.ts` (`@testcontainers/postgresql`, `describeWithDocker`) — asserts both partial unique indexes reject violations, many NULL `auth_customer_id` prospects allowed, concurrent promote leaves exactly one main, `ON DELETE CASCADE`, `updated_at` trigger fires, migration `up→down→up` clean. Run against the Phase-1.3 migration (no unique indexes yet) so it fails for the real reason, not a Docker skip.
- [ ] 5.2 GREEN: add `uq_customer_profile_auth_customer_id` and `uq_customer_branch_main` (`CREATE UNIQUE INDEX ... WHERE ...`) to the 1.3 migration file; re-run 5.1.
- [ ] 5.3 Run the full 5.1 suite with Docker actually running; record the exact pass/fail. A `describeWithDocker`-skipped run does not count as passing.

## Phase 6: API E2E tests

- [ ] 6.1 RED: `test/customers.e2e-spec.ts` (supertest + mock auth `X-User-Id`/`X-Roles`) — rep sees only own portfolio (no `salesRepId` query param); foreign `GET :id` → 404; `ownerSalesRepId` in create body → 400; non-admin reassignment attempt rejected; admin reassigns successfully.
- [ ] 6.2 GREEN: confirm 6.1 passes against the fully wired stack (Phase 4).

## Phase 7: Final verification

- [ ] 7.1 `pnpm migration:run` → `pnpm migration:revert` → `pnpm migration:run` clean on a throwaway DB.
- [ ] 7.2 `pnpm test`, `pnpm test:e2e` (Docker running), `pnpm lint`, `pnpm build` all pass; record results.
- [ ] 7.3 Confirm zero diff in `src/modules/orders/**`, `sales`, `billing`, `notifications` (`git diff --stat origin/main`).
