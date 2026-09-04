import { FindOptionsWhere } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { CustomerProfileEntity } from './entities/customer-profile.entity';

/**
 * Pure read/write scoping for `customer_profile` (and, via `isVisibleToUser`,
 * its branches). Derived only from the JWT — never from client-supplied
 * filters — so `list()` and `findById()` cannot drift apart, the exact reason
 * `quote-visibility.ts` exists. Rep-facing only in this change: there is no
 * customer self-service tier (see `customer-visibility` spec Purpose note).
 */

/** Structural shape of the query filters; `CustomerQueryDto` satisfies it. */
export interface CustomerVisibilityQuery {
  ownerSalesRepId?: string;
  isActive?: boolean;
}

/**
 * Reader/writer tiers, most privileged first:
 *
 *   `customers:admin`     -> every profile, including unowned house accounts
 *   caller with a rep id  -> own portfolio only
 *   anyone else            -> can never match -> null
 *
 * Returns `null` when the requested filter can never match anything the
 * caller is allowed to see — the caller gets an empty page, not a 403, so
 * existence outside scope is never confirmed.
 */
export function buildWhere(
  user: AuthenticatedUser,
  query: CustomerVisibilityQuery,
): FindOptionsWhere<CustomerProfileEntity> | null {
  const isAdmin = user.roles.includes('customers:admin');
  const isRep = !isAdmin && Boolean(user.salesRepId);

  if (!isAdmin && !isRep) return null;

  const where: FindOptionsWhere<CustomerProfileEntity> = {};
  if (isRep) where.ownerSalesRepId = user.salesRepId;

  if (query.ownerSalesRepId) {
    // A rep narrowing to its own id is redundant but harmless; a rep
    // filtering by somebody else's id must match nothing.
    if (!isAdmin && query.ownerSalesRepId !== user.salesRepId) return null;
    where.ownerSalesRepId = query.ownerSalesRepId;
  }

  if (query.isActive !== undefined) where.isActive = query.isActive;

  return where;
}

/**
 * Same admin/rep tiers as `buildWhere`, applied to a single already-loaded
 * profile (or a branch's parent profile) instead of a query predicate. Lives
 * here — not duplicated in `customer-branch.service.ts` — so the two checks
 * never drift, mirroring why `buildWhere` itself exists (D2).
 *
 * PLUS A THIRD TIER, added when the shipping address book became self-service:
 * the customer the profile BELONGS TO. Without it a shopper could list their
 * own addresses but not edit one, because `CustomerBranchService.findById`
 * would 404 on a row they own.
 *
 * Deliberately NOT mirrored into `buildWhere`. That function backs
 * `GET /v1/customers`, an unfiltered staff listing; widening it would turn
 * "see your own profile" into "page through the book". The self-service routes
 * resolve the one profile by `auth_customer_id` instead, and never take a
 * caller-supplied id at all.
 */
export function isVisibleToUser(
  profile:
    | { ownerSalesRepId?: string | null; authCustomerId?: string | null }
    | null
    | undefined,
  user: AuthenticatedUser,
): boolean {
  if (!profile) return false;
  if (user.roles.includes('customers:admin')) return true;
  if (profile.authCustomerId && profile.authCustomerId === user.id) return true;
  return (
    Boolean(user.salesRepId) && profile.ownerSalesRepId === user.salesRepId
  );
}
