# customer-visibility Specification

## Purpose

Read/write scoping for `customer_profile` and `customer_branch`, derived only from the JWT
(`customers:admin` / `salesRepId`), never from client-supplied filters. Existence is never confirmed to a
caller outside their scope.

**No customer self-service tier in this change.** `quotes` gives a logged-in customer a third tier
(`quote-visibility.buildWhere` falls back to `where.customerId = user.id`), but this change is rep-facing
only, so a caller who is neither admin nor rep gets an empty page. Adding a self tier later means matching
the caller's `sub` against `auth_customer_id` — never against the surrogate `id` — and is additive.

## Requirements

### Requirement: Rep sees only own portfolio
A caller holding `customers:read` or `customers:write`, with a `salesRepId` claim and without `customers:admin`, MUST see only `customer_profile` rows where `owner_sales_rep_id` equals their `salesRepId` (and that profile's branches).

#### Scenario: Rep lists own customers
- GIVEN rep R1 owns customers A and B; rep R2 owns customer C
- WHEN R1 calls `GET /v1/customers` with only a JWT
- THEN the response contains A and B, not C, with no `salesRepId` query parameter

#### Scenario: Rep cannot read another rep's customer
- GIVEN customer C is owned by R2
- WHEN R1 requests `GET /v1/customers/{C.id}`
- THEN the response is 404, not 403

#### Scenario: Rep cannot write to another rep's customer or its branches
- GIVEN customer C is owned by R2
- WHEN R1 attempts to update C or attach a branch to C
- THEN the response is 404, not 403

### Requirement: Admin sees everything, including unowned
A caller with `customers:admin` MUST see all profiles and branches, including those with `owner_sales_rep_id IS NULL`, and is the only tier allowed to set or reassign `owner_sales_rep_id`.

#### Scenario: Admin lists all
- GIVEN customers with various owners and one unowned house account
- WHEN an admin calls `GET /v1/customers`
- THEN all profiles are returned, including the unowned one

### Requirement: Reps cannot browse unassigned customers
A caller without `customers:admin` MUST NOT see `customer_profile` rows where `owner_sales_rep_id IS NULL`, in single-object reads or list results.

#### Scenario: Unassigned hidden from rep
- GIVEN an unowned house-account customer exists
- WHEN a rep without `customers:admin` lists customers
- THEN the unowned customer is not in the results

### Requirement: Non-matching scope returns empty, not an error
When a caller's visibility filter can never match any row (e.g. `customers:read` with no `salesRepId` and no admin role), list endpoints MUST return a valid empty paginated page rather than an error. Single-object requests outside scope MUST return 404 (see `customer-registry`/`customer-branches`), never 403, so existence is never confirmed.

#### Scenario: No matching scope on list
- GIVEN a caller with `customers:read` but no `salesRepId` and no `customers:admin`
- WHEN they call `GET /v1/customers`
- THEN the response is a valid empty paginated page

#### Scenario: No relevant role at all
- GIVEN a caller with none of `customers:read`, `customers:write`, `customers:admin`
- WHEN they call any `/v1/customers` endpoint
- THEN the request is rejected (403) by the role guard before visibility filtering runs
