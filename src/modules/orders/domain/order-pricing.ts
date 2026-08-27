/**
 * Pure money arithmetic for order and quote lines.
 *
 * Exists because totals used to be whatever the request body said they were:
 * `buildItems` multiplied `line.qty * line.unitPrice` out of the DTO and handed
 * the result to `grand_total`, which `PolarCheckoutService` charges verbatim.
 * Pricing now happens here and in the services, never in the caller.
 *
 * Stays pure like `order-visibility.ts`: no file under `src/modules/**\/domain/**`
 * imports `@nestjs/common`, so a rejected price assertion is reported as a
 * boolean and the SERVICE maps it to 409.
 */

/**
 * How far a client-asserted unit price may sit from the resolved one before the
 * order is refused: one cent, the resolution of every `numeric(14,2)` money
 * column in the schema. Anything inside it is rounding, not disagreement.
 */
export const PRICE_ASSERTION_TOLERANCE = 0.01;

/**
 * Rounds to cents, half away from zero.
 *
 * Scales through a decimal string rather than `value * 100`: 1.005 is held as
 * 1.00499999999999989, so multiplying first yields 100.49999999999999 and
 * rounds *down* to 1.00. Going via `"1.005e2"` parses the decimal the source
 * actually wrote and answers 1.01.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`cannot round a non-finite amount: ${value}`);
  }

  const text = `${Math.abs(value)}`;
  const sign = value < 0 ? -1 : 1;

  // JS prints exponential notation below 1e-6 and above 1e20, which would make
  // the `e2` suffix unparseable. Both extremes are outside money: the small end
  // rounds to zero, the large end is far past `numeric(14,2)`.
  if (text.includes('e')) return Math.round(value * 100) / 100;

  return sign * Number(`${Math.round(Number(`${text}e2`))}e-2`);
}

export interface PricedLineInput {
  qty: number;
  /** Resolved server-side. Never the value the caller sent. */
  unitPrice: number;
  /** Fraction, not percent: 0.16 is 16%. */
  taxRate: number;
}

export interface PricedLine {
  /** `qty * unitPrice` at cent resolution — the taxable base. */
  net: number;
  tax: number;
  /** Exactly `net + tax`. */
  lineTotal: number;
}

/**
 * Taxes the *rounded* net rather than the raw product, so that summing lines
 * gives `subtotal + taxTotal === grandTotal` with no stray centavo — the three
 * are stored as separate `numeric(14,2)` columns and are expected to reconcile.
 */
export function priceLine({
  qty,
  unitPrice,
  taxRate,
}: PricedLineInput): PricedLine {
  const net = round2(qty * unitPrice);
  const tax = round2(net * taxRate);
  return { net, tax, lineTotal: round2(net + tax) };
}

/**
 * Whether a price the client claims matches the one the server resolved.
 *
 * `false` means the cart is stale (or forged) and the caller must be told to
 * refresh — never that the claimed price should be charged.
 */
export function quotedPriceMatches(claimed: number, resolved: number): boolean {
  return round2(Math.abs(claimed - resolved)) <= PRICE_ASSERTION_TOLERANCE;
}
