# customer-registry Specification

## Purpose

Commercial customer profile registry keyed by a surrogate `id`, with a nullable, unique auth-issued `auth_customer_id` so prospects can exist before an auth identity does. Rep ownership is stamped from the JWT.

## Non-Goals

This spec does NOT cover: creating auth identities, any change to `orders.orders`/`sales.sales`/`billing.invoices`, rep-ownership enforcement on orders/sales, quotes, invoice PDF/email, returns/RMA, price lists, credit limits, or commissions. `auth_customer_id` values are never minted here, only accepted and stored.

## Requirements

### Requirement: Create customer profile
The system MUST let a caller holding `customers:write` create a `customer_profile` with `display_name` mandatory; `auth_customer_id`, `legal_name`, `rfc`, `customer_type`, `email`, `phone`, `notes` optional. `owner_sales_rep_id` MUST be stamped from `AuthenticatedUser.salesRepId` and MUST NOT be accepted from the
request body. `ownerSalesRepId` MUST NOT appear on the create DTO, so the global `ValidationPipe`
(`forbidNonWhitelisted: true`) rejects it with **400** rather than silently dropping it. Reassignment is a
separate admin-only operation (see `Requirement: Admin reassigns ownership`).

*Resolution note*: an earlier draft said the field "MUST be ignored". Rejected — silently ignoring an
ownership field means a stripping bug becomes privilege escalation with no signal. Failing loud is also the
framework default here, so it costs nothing.

#### Scenario: Rep creates own customer
- GIVEN a caller with `customers:write` and JWT `salesRepId = R1`
- WHEN they POST a profile with only `display_name`
- THEN the created profile has `owner_sales_rep_id = R1`, stamped from the JWT

#### Scenario: Ownership cannot be set from the request body
- GIVEN a caller with `customers:write` and JWT `salesRepId = R1`
- WHEN they POST a profile carrying `ownerSalesRepId: R2`
- THEN the request is rejected with 400 by the global validation pipe, and no profile is created

#### Scenario: Admin creates an unowned house account
- GIVEN a caller with `customers:admin`
- WHEN they POST a profile without `ownerSalesRepId`
- THEN the profile is created with `owner_sales_rep_id = NULL`

#### Scenario: Rep JWT missing salesRepId
- GIVEN a caller with `customers:write`, without `customers:admin`, and no `salesRepId` claim
- WHEN they attempt to create a profile
- THEN the request is rejected (422) because ownership cannot be attributed

### Requirement: Register a prospect
The system MUST allow creating a `customer_profile` with `auth_customer_id = NULL`. A prospect MAY hold `customer_branch` rows. A prospect MUST NOT be usable as the customer on an order or a quote until linked; since order/quote creation is untouched by this change, no such reference can exist here — later consumers MUST treat a NULL `auth_customer_id` as ineligible.

#### Scenario: Rep registers a prospect
- GIVEN a rep with `customers:write`
- WHEN they POST a profile with `display_name` set and no `authCustomerId`
- THEN the profile is created with `auth_customer_id = NULL`, owned by the rep

#### Scenario: Prospect can hold a branch
- GIVEN an unlinked prospect owned by the caller
- WHEN they add a `customer_branch` to it
- THEN the branch is created and associated with the prospect's `id`

### Requirement: Link an auth identity to a prospect
The system MUST allow attaching a non-null `auth_customer_id` to a profile currently `NULL`. Two profiles MUST NOT share the same non-null `auth_customer_id`. Re-linking an already-linked profile to a different value MUST be rejected.

#### Scenario: Link succeeds
- GIVEN a prospect with `auth_customer_id = NULL`, owned by the caller
- WHEN they PATCH it with a valid `authCustomerId`
- THEN `auth_customer_id` is set and persisted

#### Scenario: Re-linking an already-linked profile is rejected
- GIVEN a profile whose `auth_customer_id` is already set
- WHEN a caller attempts to change it to a different value
- THEN the request is rejected (409) and the existing value is unchanged

#### Scenario: Duplicate auth_customer_id rejected
- GIVEN profile A has `auth_customer_id = X`
- WHEN a caller attempts to link `auth_customer_id = X` to profile B
- THEN the request is rejected (409) and B remains unlinked

### Requirement: Update and deactivate
The system MUST let the owning rep or an admin update a profile's commercial fields. Deactivation (`is_active = false`) MUST be supported as the only delete mechanism; hard delete of `customer_profile` is out of scope. Deactivating a profile MUST NOT delete or deactivate its branches.

#### Scenario: Owner deactivates a customer
- GIVEN a customer profile owned by the caller
- WHEN they PATCH `isActive: false`
- THEN the profile is inactive and its branches are unchanged

### Requirement: Ownership reassignment
Only `customers:admin` MUST be able to set or change `owner_sales_rep_id` on an existing profile.

#### Scenario: Admin reassigns a customer
- GIVEN a customer profile owned by rep R1
- WHEN an admin PATCHes `ownerSalesRepId: R2`
- THEN the owner becomes R2; historical records elsewhere referencing R1 are unaffected (point-in-time snapshot, not retroactive)

#### Scenario: Non-admin reassignment attempt
- GIVEN a caller with `customers:write` but not `customers:admin`
- WHEN they attempt to PATCH `ownerSalesRepId`
- THEN the field change is rejected; ownership stays with the current owner

### Requirement: Unknown customer
A request addressing a `customer_profile.id` that does not exist MUST return 404, for any caller.

#### Scenario: Unknown id
- GIVEN no profile exists with id `Z`
- WHEN any caller requests, updates, or deactivates profile `Z`
- THEN the response is 404
