import { FindOptionsWhere } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { expand } from '../../../shared/auth/role-permissions';
import { OrderEntity } from './entities/order.entity';

/**
 * Pure visibility rules for orders, shared by `OrderService.list` and
 * `findById` so neither can drift from the other — the same reason
 * `quote-visibility.ts` / `customer-visibility.ts` exist. `orders:admin` is
 * never an issued role by itself; it only appears inside the `admin`
 * macro-role expansion (`role-permissions.ts`, D7), so it must be checked
 * through `expand()` rather than the raw `roles` claim.
 */

/** Structural shape of the query filters; `OrderQueryDto` satisfies it. */
export interface OrderVisibilityQuery {
  customerId?: string;
  status?: string;
}

/**
 * Reader tiers, most privileged first:
 *
 *   `orders:admin` (via macro `admin`) -> every order
 *   caller with a `salesRepId` claim    -> own portfolio (`salesRepId`)
 *   anyone else                          -> orders they placed (`customerId`)
 *
 * Returns `null` when the requested filter can never match anything the
 * caller is allowed to see — the caller gets an empty page, not a 403,
 * because refusing would confirm that matching orders exist.
 */
export function buildWhere(
  user: AuthenticatedUser,
  query: OrderVisibilityQuery,
): FindOptionsWhere<OrderEntity> | null {
  const isAdmin = expand(user.roles).has('orders:admin');
  const isRep = !isAdmin && Boolean(user.salesRepId);

  const where: FindOptionsWhere<OrderEntity> = {};
  if (isRep) {
    where.salesRepId = user.salesRepId;
  } else if (!isAdmin) {
    where.customerId = user.id;
  }

  // A caller filtering by their own id is redundant but harmless; a
  // non-admin, non-rep caller filtering by somebody else's id must match
  // nothing.
  if (query.customerId) {
    if (!isAdmin && !isRep && query.customerId !== user.id) return null;
    where.customerId = query.customerId;
  }

  if (query.status) where.status = query.status;

  return where;
}
