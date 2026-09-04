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

export type OrderActorTier = 'admin' | 'rep' | 'customer';

/**
 * The single definition of caller tier, shared by `buildWhere` (read scope)
 * and `bindCreate` (create-time ownership binding) so the two can never
 * diverge:
 *
 *   `orders:admin` (via macro `admin`) -> admin
 *   caller with a `salesRepId` claim    -> rep
 *   anyone else                          -> customer
 *
 * Fails CLOSED: anything not provably admin-or-rep is bound to its own id.
 * `user.roles.includes('customer')` is deliberately NOT used here — it
 * would fail OPEN, classifying a role-less token as staff.
 */
export function tierOf(user: AuthenticatedUser): OrderActorTier {
  if (expand(user.roles).has('orders:admin')) return 'admin';
  return user.salesRepId ? 'rep' : 'customer';
}

/**
 * Whether the caller works here.
 *
 * `employee_id` is the honest answer: auth mints it iff the person has a row in
 * `identity.employees`, and being staff is a fact about identity rather than a
 * permission. The role check is kept alongside it because `tierOf` already
 * treats admins and reps as staff everywhere else, and an operator whose token
 * predates the `employee_id` claim must not suddenly be gated as a shopper.
 *
 * Exists so the customer-profile gate has ONE definition to consult instead of
 * a condition rewritten at each call site.
 */
export function isStaff(user: AuthenticatedUser): boolean {
  return Boolean(user.employeeId) || tierOf(user) !== 'customer';
}

/**
 * Returns `null` when the requested filter can never match anything the
 * caller is allowed to see — the caller gets an empty page, not a 403,
 * because refusing would confirm that matching orders exist.
 */
export function buildWhere(
  user: AuthenticatedUser,
  query: OrderVisibilityQuery,
): FindOptionsWhere<OrderEntity> | null {
  const tier = tierOf(user);
  const isAdmin = tier === 'admin';
  const isRep = tier === 'rep';

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

/** The ownership + status pair a create call is allowed to persist. */
export interface OrderCreateBinding {
  customerId: string;
  status: string;
}

/**
 * `null` = the caller asserted an identity that is not theirs. The SERVICE
 * maps it to 403 (F10) — unlike the read path above, which maps `null` to
 * 404/empty page. Stays pure on purpose: no file under
 * `src/modules/**\/domain/**` imports `@nestjs/common`.
 */
export function bindCreate(
  user: AuthenticatedUser,
  dto: { customerId: string; status?: string },
): OrderCreateBinding | null {
  if (tierOf(user) !== 'customer') {
    return { customerId: dto.customerId, status: dto.status ?? 'draft' }; // staff keep both
  }
  if (dto.customerId !== user.id) return null; // F10 -> 403
  return { customerId: user.id, status: 'draft' }; // F8 — dto.status ignored
}
