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
 */
export function isVisibleToUser(
  profile: { ownerSalesRepId?: string | null } | null | undefined,
  user: AuthenticatedUser,
): boolean {
  if (!profile) return false;
  if (user.roles.includes('customers:admin')) return true;
  return (
    Boolean(user.salesRepId) && profile.ownerSalesRepId === user.salesRepId
  );
}
