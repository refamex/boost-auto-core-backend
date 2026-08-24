import { FindOptionsWhere } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../orders/domain/entities/order.entity';
import { buildWhere } from '../../orders/domain/order-visibility';

/**
 * Shipping has no ownership column of its own: a shipment belongs to whoever
 * owns its ORDER. So this delegates entirely to `order-visibility` rather
 * than restating the tiering, and every shipping read resolves through the
 * same predicate `OrderService.list` uses.
 */

/**
 * The order-scoped filter a shipping read is allowed to use.
 *
 * NOT nullable, unlike `order-visibility.buildWhere`. That function returns
 * `null` only when a caller filters by a `customerId` that is not theirs, and
 * this one always passes an empty query — there is no customer filter to
 * reject. Declaring `| null` here would add a branch no caller could ever
 * reach and no test could ever cover.
 *
 * The order id is spread LAST on purpose: it must never be overwritten by an
 * ownership key, and the caller must never be able to widen the scope by
 * naming a different order.
 */
export function buildOrderWhere(
  user: AuthenticatedUser,
  orderId: string,
): FindOptionsWhere<OrderEntity> {
  const scope = buildWhere(user, {});
  // Unreachable in practice per the note above; `?? {}` keeps this total
  // without inventing a nullable contract for callers to handle.
  return { ...(scope ?? {}), id: orderId };
}
