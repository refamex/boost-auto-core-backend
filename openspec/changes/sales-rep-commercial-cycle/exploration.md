# Exploration — sales-rep-commercial-cycle

> ## CORRECTION (2026-08-19, orchestrator)
>
> The exploration below was written against a **stale local `main`** and reached two wrong conclusions.
> Re-verified against `origin/main` at `3de05df`:
>
> - **`quotes` IS merged into main** — module `src/modules/quotes/**` (including `QuoteService.convert()`
>   → `OrderService.create()`) plus migration `1779738126225-AddQuotesSchema.ts`. Goal #3 is **done**, not pending.
> - **`notifications` IS merged into main** — the full delivery pipeline (outbox, retries/backoff, dedupe,
>   `OutboxScheduler`, `InAppChannel`, event listeners) is in `src/modules/notifications/**`.
>   `ConsoleEmailChannel` still only logs, and `package.json` has **no email SDK**, so email delivery needs a
>   provider adapter swap — not the pipeline.
> - `stock-sync` is also merged (PR #4, 2026-08-19).
>
> Therefore proposed phases **B (land quotes)** and **D (land notifications)** no longer exist as work.
> The remaining gap against `origin/main` is:
>
> | Goal | State |
> |---|---|
> | 3 — quote → order | done, in main |
> | 1, 2 — customers + customer branches | **missing, from zero** |
> | 4, 7, 8 — orders / sales / tracking scoped to the rep | present but **no ownership enforcement**; `sales.sales` uses `employee_id`, unrelated to `sales_rep_id` |
> | 5 — invoices | CRUD only, no PDF |
> | 6 — share by email | pipeline in main; needs a **real provider adapter** + share actions emitting the events |
> | 9 — returns | **missing, from zero** |
>
> Decisions taken with the user after this exploration:
> 1. Customer identity stays in `autoboost-backend-auth`; core owns a **commercial profile** keyed by the
>    auth-issued `customer_id`.
> 2. First delivery is scoped to **customers + customer branches only**.
> 3. Email is a **separate later change** (provider adapter on the existing pipeline).


**Phase**: sdd-explore
**Change slug**: `sales-rep-commercial-cycle`
**Project**: autoboost-backend-core (Engram project `boost-auto`)
**Date**: 2026-08-19
**Artifact store**: hybrid (Engram topic `sdd/sales-rep-commercial-cycle/explore` + this file)

## Request

A service in the core that lets **sales representatives**:

1. Register their own customers
2. Register branches / addresses for those customers
3. Convert quotes into orders
4. Generate orders for customers
5. Generate invoices for customers
6. Share invoices and quotes by email
7. Register their own sales and know which customer each sale went to
8. Track their customers' orders
9. Handle returns

## Current State

### Customer concept — the crux finding

No local `customer` / `cliente` table or entity exists anywhere in `src/`. `customer_id` is a bare
`UUID NOT NULL` column on `orders.orders`, `sales.sales` and `billing.invoices`, always documented as a
*logical reference* to `autoboost-backend-auth`.

This is confirmed by a doc comment on the unmerged `feature/quotes-service` branch's `quote.entity.ts`:

> Both actors live in autoboost-backend-auth (`identity.customer_profiles`, `identity.sales_reps`), so
> these are bare UUIDs with no foreign key.

**Customer and sales-rep identity live in the separate auth service, not in core.** "Register customers"
therefore cannot mean creating auth identities here — it has to mean a core-side commercial extension
(branches/addresses, rep assignment) keyed by an auth-issued `customer_id`. This is the single biggest
open design question and needs product confirmation before `sdd-spec`.

### Sales-rep concept — exists, inconsistently enforced

- `src/shared/auth/jwt-payload.interface.ts` already carries `JwtPayload.sales_rep_id` / `.employee_id`
  and `AuthenticatedUser.salesRepId` / `.employeeId`. Live infrastructure — nothing to build.
- `orders.orders.sales_rep_id` already exists and is persisted by `OrderService.create()`.
- **But** `OrderController` never reads the caller's JWT (no `@CurrentUser()`); `customerId` / `salesRepId`
  are trusted verbatim from the request body, gated only by role `orders:write`. No ownership enforcement
  exists today.
- The only place that actually enforces rep-scoping is the unmerged quotes branch's `quote-visibility.ts`
  (`buildWhere()` — admin / rep / customer tiers, returning 404 rather than 403 so existence is not confirmed).

### Orders / Sales / Billing schema

Verified against `db.md` + TypeORM entities:

| Table | Notes |
|---|---|
| `orders.orders` | `customer_id`, `sales_rep_id`, `provider_branch_id` → `suppliers.provider_branch`; `status` is a free `VARCHAR(50)` with only `draft` / `confirmed` / `cancelled` actually used; `payment_status` / `shipping_status` free strings; flat `ship_to_*` snapshot |
| `orders.order_items` | line items |
| `orders.order_payments` | payment records |
| `sales.sales` | uses a *different* `employee_id` column, unrelated to `sales_rep_id`; plain CRUD only |
| `billing.invoices`, `billing.invoice_documents` | plain CRUD; **no PDF generation, no email-send capability anywhere** |

Stock reservation already goes through `ReserveStockUseCase` / `ReleaseStockUseCase` + `INVENTORY_REPOSITORY`
in-process. Any new flow must reuse this and never touch `stock` / `reserved_stock` directly.

### Branch pattern precedent

`suppliers.provider_branch` + `ProviderBranchService`
(`src/modules/suppliers/application/services/provider-branch.service.ts`), including its
`demoteOtherMainBranches(tx, providerId, exceptId?)` transaction helper, is the exact structural template
for a future `customer_branch`.

### Two unmerged sibling branches are substantial prior art

Worktrees at `backend/autoboost-backend-core-worktrees/{quotes,notifications}`, confirmed NOT on main
(main has only 3 migrations: `InitialSchema`, `AddPaymentsPolarSchema`, `AddShippingSchema`).

- **`feature/quotes-service`** — full working `quotes.quotes` / `quote_items` implementation: status
  lifecycle (`draft → sent → approved/rejected → converted`, plus derived `expired`), rep/customer/admin
  visibility rules, and `QuoteService.convert()` which claims the quote via compare-and-set then calls
  `OrderService.create()` in-process to produce a draft order. **This already implements goal #3 end to end.**
- **`feature/notifications-service`** — `notifications.notifications` / `outbox`, event-driven
  (`@nestjs/event-emitter`, `@OnEvent('order.**')`), a `NotificationChannel` port with `ConsoleEmailChannel`
  (logs only) and `InAppChannel`, plus an outbox retry/backoff drained by a scheduler. Its doc comment notes:
  *"Core has no mail credential of its own today: the Resend setup lives in autoboost-backend-auth and is two
  hardcoded methods, not something importable."*

Confirmed via `package.json` on main and both worktrees: **zero email-SDK dependency exists anywhere**
(no nodemailer / resend / sendgrid / ses / postmark). The pattern to copy for a real provider adapter is
`src/modules/shipping/infrastructure/skydropx/skydropx-http.client.ts` (Symbol port + adapter + native
`fetch` + `ConfigService` + feature flag).

### Returns / refunds

Confirmed absent. A targeted grep (`devoluc|refund|credit_note|creditNote|RMA`) across `src/` returned
exactly one file — Polar's payment-refund *webhook* handler, unrelated to a returns/RMA business domain.
No return-related order status, no credit-note / RMA table anywhere.

## Affected Areas

- `src/modules/orders/**`, `src/modules/sales/**` — rep/customer ownership enforcement (currently none)
- `src/modules/billing/**` — "share by email" action; no email capability exists yet
- `src/modules/suppliers/domain/entities/provider-branch.entity.ts` + `provider-branch.service.ts` —
  structural template for `customer_branch`
- `src/shared/auth/jwt-payload.interface.ts` — already has what's needed, just unconsumed by orders/sales
- `src/modules/shipping/infrastructure/skydropx/skydropx-http.client.ts` — outbound-integration pattern
- `db.md` + `src/shared/database/migrations/*` — new migrations needed (`customers`, `returns`). Note both
  unmerged branches independently claim migration timestamps `1779738126225` / `226` — merge order must be resolved
- `backend/autoboost-backend-core-worktrees/quotes` and `.../notifications` — must be reconciled
  (rebase / land), not reimplemented from scratch

## Approaches

### 1. One combined change as literally scoped

Spans 5+ bounded contexts, reconciling two entire unmerged branches plus new `customers` / `returns` work.
Rough estimate **3,000–5,000+ changed lines** — far past the 2000-line single-PR budget. Effort: Very High.

### 2. Phase-sliced changes, one bounded context per change/PR — **recommended**

| Phase | Scope | Rough size |
|---|---|---|
| A | `customers` + `customer_branch` (foundational) | ~300–600 LOC |
| B | Land / rebase `feature/quotes-service` | ~700–900 LOC, mostly already built |
| C | Rep-scoping retrofit on orders/sales, copying `quote-visibility.ts` | ~200–400 LOC |
| D | Land / rebase `feature/notifications-service` + real email adapter + share-by-email actions | ~900–1200 LOC |
| E | `returns` domain from zero (no prior art) | ~400–700 LOC |

Each phase fits the budget and has a clean rollback boundary. Effort: Medium per phase.

## Recommendation

Split at the bounded-context boundary. Start with **Phase A** (`customers` / `customer_branch`) since it
resolves the customer-identity ownership question every other phase depends on. Phases B and D should
evaluate rebasing the existing branches (both have their own `.spec.ts` coverage and already follow repo
conventions) rather than reimplementing.

## Risks

- **Scope vs budget**: full literal request ≈ 3,000–5,000+ changed lines vs. the 2000-line single-PR budget.
- **Customer identity ownership undecided** — auth already owns `identity.customer_profiles`. Must resolve
  before `sdd-spec`.
- **Two unmerged branches are living prior art with colliding migration timestamps** — reimplementing
  instead of rebasing would duplicate tested work.
- **No caller-ownership enforcement today** on orders/sales — adding it is a behavior change for existing consumers.
- **No outbound email capability anywhere** — goal #6 needs either a new provider integration or a
  deliberate decision to ship `ConsoleEmailChannel` as an interim.
- Any returns flow must go through `ReleaseStockUseCase`, never touch `stock` / `reserved_stock` directly.

## Ready for Proposal

Conditionally yes. `sdd-propose` should scope only **Phase A** (`customers` / `customer_branch`) as the
first change, and present the full A–E roadmap plus the two open questions (customer-identity ownership,
branch reconciliation) to the user before any spec/design work begins.
