import { DomainError } from '../../../shared/common/errors/domain.error';

/**
 * The two ways a shipping quote can fail to produce a price.
 *
 * Both answer 422 — the request was well formed, the outcome was not a rate —
 * but they are NOT the same event and must not share a message. The frontend
 * switches on `code`, because the only useful next step differs:
 *
 *   SHIPPING_MISSING_DIMENSIONS  our catalogue is incomplete. Nobody can fix
 *                                this by retrying, and it is not the carrier's
 *                                doing, so the copy must not blame coverage.
 *   SHIPPING_NO_COVERAGE         the carriers answered, and the answer was no.
 *                                A retry hits the same wall.
 *
 * A transport failure (timeout, Skydropx down) is neither of these: that stays
 * a `ServiceUnavailableException` (503), which IS worth retrying. Collapsing
 * the three into one message is what sends a person to press a button that
 * cannot help them.
 */
export class ParcelNotComputableError extends DomainError {
  readonly code = 'SHIPPING_MISSING_DIMENSIONS';
  readonly httpStatus = 422;

  constructor(readonly skus: string[]) {
    super(
      skus.length > 0
        ? `No shipping dimensions on file for: ${skus.join(', ')}. Load them in pim.product_dimension before quoting this order.`
        : 'Cannot build a parcel for an order with no items.',
    );
  }
}

export class NoShippingCoverageError extends DomainError {
  readonly code = 'SHIPPING_NO_COVERAGE';
  readonly httpStatus = 422;

  constructor() {
    super(
      'No carrier quoted this parcel to this destination. This is an answer, not an outage — retrying returns the same result.',
    );
  }
}
