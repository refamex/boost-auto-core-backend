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
 * reject, so today the deny branch is unreachable.
 *
 * Fails CLOSED anyway, and that is the whole point. `?? {}` would be equally
 * total and would read as harmless, but it points the wrong way: if a future
 * deny case in `buildWhere` ever made the branch reachable — a suspended
 * customer, a rep tier with no `salesRepId` — TypeScript would report nothing,
 * no test would fail, and every shipping read would silently degrade to an
 * unscoped `{ id: orderId }`. That is the exact failure `order-visibility`
 * documents itself as avoiding. An unreachable branch that throws is a dead
 * branch; an unreachable branch that widens scope is a trap.
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
  if (!scope) {
    throw new Error(
      'order visibility denied this caller; refusing to build an unscoped shipping filter',
    );
  }
  return { ...scope, id: orderId };
}
