/**
 * Quote lifecycle.
 *
 * The rest of the codebase (orders, sales, shipping) keeps status as a bare
 * string. Quotes deviate deliberately: customer visibility depends on a status
 * allowlist, and `expired` is derived rather than stored. Typing both concepts
 * separately turns `quote.status = 'expired'` into a compile error instead of a
 * bug that silently persists on the next save.
 *
 * The SQL column stays `varchar(50)` with no CHECK constraint, matching the
 * existing convention.
 */

/** Statuses that are actually written to `quotes.quotes.status`. */
export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'approved',
  'rejected',
  'converted',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * What a read can report. `expired` is never stored — it is derived from
 * `valid_until` at read time, because there is no scheduler in this service.
 */
export type QuoteEffectiveStatus = QuoteStatus | 'expired';

/**
 * Persisted statuses a customer is allowed to see. An allowlist, not
 * `Not('draft')`: a status added later must be opted in explicitly rather than
 * leaking to customers by default.
 */
export const CUSTOMER_VISIBLE_STATUSES = [
  'sent',
  'approved',
  'rejected',
  'converted',
] as const satisfies readonly QuoteStatus[];

export type QuoteAction = 'send' | 'approve' | 'reject' | 'convert';

/** Legal transitions. Anything not listed here is a 409. */
export const QUOTE_TRANSITIONS: Record<
  QuoteAction,
  { from: readonly QuoteStatus[]; to: QuoteStatus }
> = {
  send: { from: ['draft'], to: 'sent' },
  approve: { from: ['sent'], to: 'approved' },
  reject: { from: ['sent'], to: 'rejected' },
  convert: { from: ['approved'], to: 'converted' },
};

/** Only a draft may be edited; sending freezes the quote. */
export const EDITABLE_STATUSES = [
  'draft',
] as const satisfies readonly QuoteStatus[];

export function isEditable(status: QuoteStatus): boolean {
  return (EDITABLE_STATUSES as readonly QuoteStatus[]).includes(status);
}
