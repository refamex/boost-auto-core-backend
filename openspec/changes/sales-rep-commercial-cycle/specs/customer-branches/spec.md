# customer-branches Specification

## Purpose

Address book per `customer_profile`, structurally mapped onto the existing `ship_to_*` snapshot shape, with exactly one main branch enforced both transactionally and by the database.

## Requirements

### Requirement: Create and list branches
The system MUST allow multiple `customer_branch` rows per `customer_profile`, scoped by `customer-visibility`. Address fields MUST map 1:1 onto `recipient_name`, `company`, `street1`, `postal_code`, `area_level1`, `area_level2`, `area_level3`, `country_code` (default `MX`).

#### Scenario: Create a branch
- GIVEN a customer profile the caller can write to
- WHEN they POST a branch with the mapped address fields
- THEN the branch is persisted under that profile with those fields intact

### Requirement: Exactly one main branch
The system MUST guarantee at most one `is_main_branch = true` row per `customer_profile_id`, via a transactional demotion of the previous main branch on promotion, plus a partial unique index (`WHERE is_main_branch`) as the final arbiter.

#### Scenario: Promoting a branch demotes the previous main
- GIVEN customer C has main branch B1
- WHEN the caller creates or updates branch B2 with `isMainBranch: true`
- THEN B1's `is_main_branch` becomes `false` and B2's becomes `true`, atomically

#### Scenario: Concurrent promotion race
- GIVEN two concurrent requests each set a different branch as main for the same customer
- WHEN both transactions attempt to commit
- THEN the database's partial unique index allows only one to succeed; the other MUST receive a conflict error, never two simultaneous main branches

### Requirement: Main branch cannot be deleted
Deleting a branch with `is_main_branch = true` MUST always be rejected (409), matching `ProviderBranchService.remove` semantics — even when it is the customer's only branch. The caller MUST promote a different branch to main first.

#### Scenario: Delete main branch blocked while another exists
- GIVEN branch B1 is main for customer C, and C also has non-main branch B2
- WHEN the caller attempts to delete B1
- THEN the request is rejected and B1 remains

#### Scenario: Delete sole main branch blocked
- GIVEN branch B1 is the only branch of customer C and is main
- WHEN the caller attempts to delete B1
- THEN the request is rejected and B1 remains

#### Scenario: Delete non-main branch succeeds
- GIVEN customer C has main branch B1 and non-main branch B2
- WHEN the caller deletes B2
- THEN B2 is removed and B1 remains main

### Requirement: Unknown branch or customer
A request for a `customer_branch` whose `id` doesn't exist, or whose parent `customer_profile_id` doesn't exist or is outside the caller's scope, MUST return 404.

#### Scenario: Unknown branch id
- GIVEN no branch exists with id `Z`
- WHEN any caller requests, updates, or deletes branch `Z`
- THEN the response is 404
