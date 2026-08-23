import { FindOptionsWhere, In, LessThan, MoreThanOrEqual } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { QuoteEntity } from './entities/quote.entity';
import {
  CUSTOMER_VISIBLE_STATUSES,
  QUOTE_STATUSES,
  QuoteEffectiveStatus,
  QuoteStatus,
} from './quote-status';

/**
 * Pure visibility and expiry rules for quotes.
 *
 * These are plain functions on purpose: `list` and `findById` must apply the
 * exact same predicate, and a rule that lives in one service method inevitably
 * drifts from its copy in the other. `now` is always a parameter so the tests
 * need no fake timers.
 */

/** Structural shape of the query filters; `QuoteQueryDto` satisfies it. */
export interface QuoteVisibilityQuery {
  status?: string;
  customerId?: string;
}

/**
 * Reader tiers, most privileged first:
 *
 *   `quotes:admin`      -> every quote, every status
 *   caller with a rep id -> own portfolio, every status (drafts included)
 *   anyone else          -> quotes addressed to them, and only once sent
 *
 * Returns `null` when the requested filter can never match anything the caller
 * is allowed to see — the caller gets an empty page, not a 403, because
 * refusing would confirm that matching quotes exist.
 */
export function buildWhere(
  user: AuthenticatedUser,
  query: QuoteVisibilityQuery,
  now: Date,
): FindOptionsWhere<QuoteEntity> | null {
  const isAdmin = user.roles.includes('quotes:admin');
  const isRep = !isAdmin && Boolean(user.salesRepId);

  const where: FindOptionsWhere<QuoteEntity> = {};
  if (isRep) {
    where.salesRepId = user.salesRepId;
  } else if (!isAdmin) {
    where.customerId = user.id;
  }

  // A customer filtering by their own id is redundant but harmless; a customer
  // filtering by somebody else's id must match nothing.
  if (query.customerId) {
    if (!isAdmin && !isRep && query.customerId !== user.id) return null;
    where.customerId = query.customerId;
  }

  const allowed: readonly QuoteStatus[] =
    isAdmin || isRep ? QUOTE_STATUSES : CUSTOMER_VISIBLE_STATUSES;

  return applyStatusFilter(where, allowed, query.status, now);
}

function applyStatusFilter(
  where: FindOptionsWhere<QuoteEntity>,
  allowed: readonly QuoteStatus[],
  requested: string | undefined,
  now: Date,
): FindOptionsWhere<QuoteEntity> | null {
  if (!requested) {
    return { ...where, status: In([...allowed]) };
  }

  // `expired` is derived, never stored: it is a sent quote past its validity.
  if (requested === 'expired') {
    if (!allowed.includes('sent')) return null;
    return { ...where, status: 'sent', validUntil: LessThan(now) };
  }

  if (!isPersistedStatus(requested) || !allowed.includes(requested))
    return null;

  // Symmetrically, a sent quote past its validity must not answer `?status=sent`.
  if (requested === 'sent') {
    return { ...where, status: 'sent', validUntil: MoreThanOrEqual(now) };
  }

  return { ...where, status: requested };
}

function isPersistedStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

/**
 * The single place expiry is derived. Only a sent quote can expire — once
 * approved, rejected or converted, the decision outlives the validity window.
 */
export function effectiveStatus(
  status: QuoteStatus,
  validUntil: Date,
  now: Date,
): QuoteEffectiveStatus {
  return status === 'sent' && validUntil.getTime() < now.getTime()
    ? 'expired'
    : status;
}
