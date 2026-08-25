import { FindOptionsWhere } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { expand } from '../../../shared/auth/role-permissions';
import { InvoiceEntity } from './entities/invoice.entity';

/**
 * Pure visibility rules for invoices, shared by `InvoiceService.list` and the
 * single-invoice loader so neither can drift from the other — the same reason
 * `order-visibility.ts` / `quote-visibility.ts` / `customer-visibility.ts`
 * exist. `billing:admin` is never an issued role by itself; it only appears
 * inside the `admin` macro-role expansion (`role-permissions.ts`), so it must
 * be checked through `expand()` rather than the raw `roles` claim.
 *
 * TWO tiers, not three. The order and quote modules carry a `rep` tier scoped
 * by `salesRepId`, but `InvoiceEntity` has no such column, so there is nothing
 * to scope a representative to. A caller holding only a `salesRepId` claim
 * therefore reads as a plain caller, pinned to their own id. That fails
 * CLOSED, which is the side to err on.
 */

/** Structural shape of the query filters; `InvoiceQueryDto` satisfies it. */
export interface InvoiceVisibilityQuery {
  customerId?: string;
  orderId?: string;
}

/**
 * Returns `null` when the requested filter can never match anything the
 * caller is allowed to see — the caller gets an empty page, not a 403,
 * because refusing would confirm that matching invoices exist.
 */
export function buildWhere(
  user: AuthenticatedUser,
  query: InvoiceVisibilityQuery,
): FindOptionsWhere<InvoiceEntity> | null {
  const isAdmin = expand(user.roles).has('billing:admin');

  const where: FindOptionsWhere<InvoiceEntity> = {};
  if (!isAdmin) where.customerId = user.id;

  // A caller filtering by their own id is redundant but harmless; a
  // non-admin caller filtering by somebody else's id must match nothing.
  if (query.customerId) {
    if (!isAdmin && query.customerId !== user.id) return null;
    where.customerId = query.customerId;
  }

  // Narrows within the ownership filter above; it never replaces it.
  if (query.orderId) where.orderId = query.orderId;

  return where;
}
