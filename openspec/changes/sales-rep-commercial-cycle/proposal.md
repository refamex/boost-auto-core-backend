# Proposal: `customers` — Commercial Customer Registry for Sales Reps

**Change slug**: `sales-rep-commercial-cycle` · **Phase**: sdd-propose · **Base**: `origin/main` @ `3de05df`
**Artifact store**: hybrid (Engram `sdd/sales-rep-commercial-cycle/proposal` + this file)

## Intent

Nothing in the core describes a customer. `customer_id` is a bare `UUID NOT NULL` on `orders.orders`,
`sales.sales`, `billing.invoices` and `quotes.quotes` — a logical reference to `autoboost-backend-auth`
(`identity.customer_profiles`) with no FK and no local row behind it. Consequences today:

- A sales rep cannot answer "who are my customers" — there is no rep↔customer link anywhere.
- A customer's commercial data (legal name, RFC, segment, contacts) exists only re-typed per invoice.
- `orders.orders` carries a flat `ship_to_*` snapshot with **no address book behind it**: every order
  re-types the destination, and Skydropx quoting (`ShippingQuoteService.quoteForOrder`) fails with
  `Order is missing destination address` whenever someone forgets a field.
- `OrderController` never reads the JWT: `customerId` / `salesRepId` are trusted verbatim from the request
  body, gated only by `orders:write`. Any bearer can act for any rep.

This change introduces the missing foundation: a commercial customer profile keyed by the auth-issued
`customer_id`, an address book per customer, and rep ownership enforced from the JWT.

## Scope

### In Scope

1. New bounded context `src/modules/customers/**` (thin-CRUD depth, matching `suppliers`).
2. New Postgres schema `customers` with `customer_profile` and `customer_branch` (hand-written migration).
3. Rep ownership: `owner_sales_rep_id` stamped from the JWT, never from the request body.
4. Read/write endpoints scoped by a `customer-visibility.ts` pure module copying `quotes/domain/quote-visibility.ts`
   (admin / rep / customer tiers, 404-not-403).
5. Exactly-one-main-branch invariant, enforced in **both** the service transaction and a DB partial unique index.
6. Unit + integration specs (strict TDD, `pnpm test`) and an API e2e spec.

### Out of Scope (explicit non-goals)

| Not doing | Why |
|---|---|
| Creating auth identities / calling auth synchronously | Settled: identity stays in `autoboost-backend-auth` |
| Any change to `orders.orders`, incl. an FK from `ship_to_*` to a branch | Snapshot-at-order-time must be preserved |
| Rep-ownership retrofit on `orders` / `sales` | Behavior change for existing consumers — separate change |
| Quotes | Already merged (`src/modules/quotes/**`) |
| Invoices, PDF generation, share-by-email, a real email provider adapter | Separate change on the merged notifications pipeline |
| Returns / RMA | Separate change, no prior art |
| Per-customer price lists, credit limits, commissions | Not requested; `commerce.price_lists.customer_type` stays a segment tag |

## Capabilities

### New Capabilities

- `customer-registry`: commercial customer profile keyed by the auth `customer_id`; create, read, update, deactivate; rep ownership and admin reassignment.
- `customer-branches`: multiple named addresses per customer, exactly one main branch, deletion of the main branch blocked.
- `customer-visibility`: read/write scoping derived from the JWT (`customers:admin` / `salesRepId` / self), returning empty pages and 404s rather than 403s.

### Modified Capabilities

None. `openspec/specs/` is currently empty — these are the first specs in the repo.

## Approach

### Ownership model — one owning rep, not many (decided)

`customer_profile.owner_sales_rep_id UUID NULL` — a single owning rep.

| Option | Verdict |
|---|---|
| One owning rep (single column) | **Chosen.** Matches the existing `orders.sales_rep_id` single-column precedent and `quote-visibility`'s single-rep tier; "my customers" is one indexed predicate, no join; reassignment is an `UPDATE`. |
| Many reps (join table) | Rejected for this slice. Every visibility query becomes an `EXISTS` subquery, and it forces a "who is primary" rule for commission attribution that does not exist anywhere in core today. |

`NULL` owner = unassigned house account, visible only to `customers:admin`. A future team/shared-coverage
model is **additive** (add `customer_rep_assignment`, keep this column as the primary owner) — no rewrite.

### Data model sketch

`customers.customer_profile`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` — a core-owned surrogate.
- `auth_customer_id UUID NULL UNIQUE` — the auth-issued ID, when it exists. No FK (cross-service).
  **This resolves OQ-1: a rep can register a prospect immediately and the auth link is attached later.**
  A partial unique index (`WHERE auth_customer_id IS NOT NULL`) keeps one profile per auth customer while
  allowing many un-linked prospects.
- Consequence to design deliberately: `orders`, `sales`, `billing` and `quotes` all carry the **auth**
  `customer_id`, so joining them to a profile goes through `auth_customer_id`, not `id`. A profile with a
  NULL `auth_customer_id` has no orders/quotes by definition — it is a prospect. The spec MUST state what
  happens at link time (attach the auth id to an existing prospect) and MUST forbid re-pointing a profile
  that is already linked.
- `owner_sales_rep_id UUID NULL` (indexed), `display_name`, `legal_name`, `rfc`, `customer_type`,
  `email`, `phone`, `notes`, `is_active BOOLEAN DEFAULT TRUE`, `created_at`, `updated_at` + `utils.set_updated_at` trigger.

`customers.customer_branch`
- `id UUID PK DEFAULT gen_random_uuid()`, `customer_profile_id UUID NOT NULL REFERENCES customers.customer_profile(id) ON DELETE CASCADE` (a real intra-service FK, now against the surrogate PK).
- `branch_name`, `contact_person`, `phone`, `email`, `is_main_branch`, `is_active`, `notes`, timestamps + trigger.
- Address columns map **1:1 onto the existing `ship_to_*` snapshot**: `recipient_name`, `company`, `street1`,
  `postal_code`, `area_level1/2/3`, `country_code DEFAULT 'MX'`. Deliberate deviation from
  `suppliers.provider_branch` (`address TEXT` + `city`), which cannot feed Skydropx's structured shape.
- `CREATE UNIQUE INDEX ... ON customer_branch(customer_profile_id) WHERE is_main_branch` — DB-level hardening that
  `provider_branch` lacks (it relies on `demoteOtherMainBranches` alone).

**Relationship to `ship_to_*`**: none, structurally. `orders.orders` is untouched; the snapshot stays a
snapshot. The address book is a *source to copy from*, and the copy is wired in the follow-on
orders change. `CustomersModule` exports its branch service so that consumption is in-process, per repo convention.

### Authorization

Role strings follow the existing `module:action` convention (`suppliers:write`, `shipping:read`):
`customers:read`, `customers:write`, `customers:admin`.

| Caller | Reads | Writes |
|---|---|---|
| `customers:admin` | all profiles + branches, incl. unassigned | create anywhere; **only tier that may set/reassign `owner_sales_rep_id`** |
| Rep (`AuthenticatedUser.salesRepId` present) | own portfolio only | create — `owner_sales_rep_id` stamped from the JWT, body value rejected; update own only |
| The customer (`user.id === customer_id`) | own profile + branches | none |
| Anyone else | empty page | 403 |

Enforced via `@CurrentUser()` + `buildWhere(user, query)` in `customers/domain/customer-visibility.ts`,
returning `null` → empty page when a filter can never match. Single-object misses return **404, not 403**,
so existence is never confirmed.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/modules/customers/**` | New | Entities, DTOs, `CustomerProfileService`, `CustomerBranchService`, `customer-visibility.ts`, controller, module |
| `src/shared/database/migrations/1779738126227-AddCustomersSchema.ts` | New | Hand-written SQL; timestamp must be re-checked at apply time (see R4) |
| `src/app.module.ts` | Modified | Register `CustomersModule` (~3 lines) |
| `db.md` | Modified | Document the new schema |
| `src/shared/auth/jwt-payload.interface.ts`, `common/decorators/{current-user,roles}.decorator.ts`, `common/dto` pagination | Consumed, unchanged | Shared ports this change depends on |
| `src/modules/quotes/domain/quote-visibility.ts` | Reference only | Pattern copied, file untouched |
| `src/modules/suppliers/**` | Reference only | `provider-branch.service.ts` structural template, file untouched |
| `src/modules/orders/**`, `sales`, `billing`, `notifications` | **Untouched** | Deliberate — see non-goals |

**Bounded contexts**: one new (`customers`). No existing context is modified. **Shared ports touched**: none
modified; `AuthenticatedUser`, `@CurrentUser`, `@Roles`/`RolesGuard`, `PaginationDto`/`paginated()`, the
`DataSource` and `DomainExceptionFilter` are all consumed as-is.

## Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Orphan `customer_id` — a profile created for a UUID that does not exist (or no longer exists) in auth. No FK is possible across services. | Med | Validate UUID shape; `is_active` allows deactivation instead of deletion; accept eventual consistency for this slice; a reconciliation job or an auth lookup is a follow-on. |
| R2 | Split-brain with auth's `identity.customer_profiles` on name/email/phone. | Med | The core row is explicitly *commercial*, not identity; contact fields are display conveniences. Document on the entity, mirroring the doc-comment style already used on `quote.entity.ts`. |
| R3 | **Local checkout is stale** — verified: no `src/modules/quotes`, no `src/modules/notifications`, migrations stop at `1779738126224`. | High (already true) | Apply MUST start from a fresh worktree off `origin/main` @ `3de05df`, not the current working tree. |
| R4 | Migration timestamp collision (`1779738126225` = quotes; notifications also claimed `...226`). | Med | Apply re-lists `src/shared/database/migrations/` and picks a value strictly greater than every present migration. |
| R5 | Concurrent "set as main branch" races. | Low | Transactional `demoteOtherMainBranches` copy **plus** the partial unique index — the DB is the final arbiter. |
| R6 | Size vs. the 2000-line single-PR budget. | Med | Estimated 1,300–1,500 lines (below budget, not comfortably). Split point if it overruns: PR-1 = schema + profile + visibility; PR-2 = branches + main-branch invariant. |
| R7 | Reassigning a customer to a new rep leaves historical `orders.sales_rep_id` pointing at the old rep. | Low | Correct by design — order attribution is a point-in-time snapshot. Stated so it is not later filed as a bug. |

## Rollback Plan

The change is **purely additive**: a new schema, two new tables, no `ALTER` on any existing table, no
backfill, no destructive statement, and no other module imports `CustomersModule`.

1. **Schema**: `down()` drops the two triggers, drops both tables, then `DROP SCHEMA IF EXISTS customers CASCADE`
   — the exact shape of `AddShippingSchema1779738126224.down()`. `pnpm migration:revert` is therefore a complete
   rollback; the only data loss is rows in the new schema, which nothing else references.
2. **Code**: revert the PR. No existing module changes behavior, so the revert cannot regress orders, sales,
   billing, quotes, or shipping.
3. **Pre-merge proof**: on a throwaway DB, run `pnpm migration:run` → `pnpm migration:revert` → `pnpm migration:run`
   and confirm it is clean in both directions. `synchronize: false` stays; the migration is hand-written and is
   **never** regenerated from entities.

## Dependencies

- Branch from `origin/main` @ `3de05df` (has `quotes`, `notifications`, `stock-sync`).
- Auth must already have issued the `customer_id` the rep supplies — this change never mints one (see OQ-1).
- No new npm dependency.

## Success Criteria

- [ ] A rep calling `GET /v1/customers` with only a JWT sees exactly their own portfolio — no `salesRepId` query parameter, no body field.
- [ ] A rep cannot read, update, or attach a branch to another rep's customer; the attempt returns 404, not 403.
- [ ] `POST /v1/customers` ignores any `ownerSalesRepId` in the body and stamps the JWT's `salesRepId`; only `customers:admin` can reassign.
- [ ] A customer can hold several branches; promoting one demotes the previous main atomically, and the DB rejects a second main branch even under concurrent writes.
- [ ] Deleting the main branch is blocked while another branch exists.
- [ ] `pnpm migration:run` → `revert` → `run` is clean; `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build` all pass.
- [ ] Zero diff in `src/modules/orders/**`, `sales`, `billing`, `notifications`.

## Roadmap — follow-on changes (NOT part of this change)

| Order | Change | Sketch |
|---|---|---|
| 2 | Rep-ownership retrofit on `orders` + `sales` | `@CurrentUser()` on `OrderController` / `SaleController`, `buildWhere` scoping, "my customers' orders" and "my sales"; reconcile `sales.employee_id` vs. `sales_rep_id`; prefill `ship_to_*` from a chosen `customer_branch`. **Behavior change for existing API consumers.** |
| 3 | Invoice PDF + share-by-email | Real provider adapter behind the merged `NotificationChannel` port (Skydropx-client pattern: Symbol port + `fetch` + feature flag), replacing the log-only `ConsoleEmailChannel`; PDF generation and share actions on invoices and quotes. Needs an email-SDK decision — none is installed today. |
| 4 | Returns / RMA | New domain from zero. Any restock **must** go through `ReleaseStockUseCase` / `INVENTORY_REPOSITORY`; never touch `stock` / `reserved_stock`. |

## Proposal question round

Execution mode is `auto`, so these could not be asked interactively. Each carries the assumption taken.
Correct any of them before `sdd-spec` runs.

- **OQ-1 — RESOLVED BY THE USER (2026-08-19): prospects MUST be supported.** The rep has to be able to capture
  a customer before auth has issued an identity. The data model above was updated accordingly: surrogate
  `id` PK + nullable unique `auth_customer_id`. The core still never creates auth identities; it just stops
  requiring one to exist first. Spec and design MUST cover the prospect lifecycle: create unlinked, link
  later, reject re-linking an already-linked profile, and define what a prospect can and cannot do
  (it can hold branches; it cannot be the customer on an order/quote until linked).
- **OQ-2 — coverage and hand-off.** One owning rep is assumed. When a rep is on holiday or leaves, is
  admin-only reassignment enough, or do two reps genuinely need simultaneous access to the same customer?
  *Assumed*: admin reassignment is enough for now.
- **OQ-3 — can a rep see unassigned customers?** *Assumed*: no. Only `customers:admin` sees `owner_sales_rep_id IS NULL`
  rows, so reps cannot browse and self-claim the customer base.
- **OQ-4 — required fields. SUPERSEDED by the OQ-1 resolution.** `customer_id` can no longer be mandatory —
  a prospect has no `auth_customer_id` by definition. Resolved in the spec as: **only `display_name` is
  mandatory**; `auth_customer_id`, `rfc` and `legal_name` are all optional, so a rep is not blocked from
  registering before an identity or tax data exists. Invoicing already re-captures `rfc` / `legal_name` on
  `billing.invoices`.
- **OQ-5 — duplicate detection.** *Assumed*: none beyond the PK. Two profiles cannot share a `customer_id`, but no
  RFC or email uniqueness check is proposed.
