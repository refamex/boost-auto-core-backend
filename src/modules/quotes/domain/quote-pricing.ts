import { BadRequestException } from '@nestjs/common';
import { round2 } from '../../orders/domain/order-pricing';

export interface NegotiatedPriceInput {
  /** What the customer's price list resolved to for this line. */
  listPrice: number;
  /** A manually agreed unit price, replacing the list price. */
  unitPrice?: number;
  /** A percentage off the list price. */
  discountPct?: number;
}

export interface NegotiatedPrice {
  /** The price actually charged. */
  effective: number;
  /** How far below list that landed, always recorded even when derived. */
  discountPct: number;
}

/**
 * Resolves what a quote line actually costs, given what the list said and what
 * the rep negotiated.
 *
 * A quote is where a salesperson negotiates, so the list price is the default,
 * not the ceiling. But the outcome has to stay explainable months later, when
 * somebody asks why a line was sold below list — hence `discountPct` is always
 * returned, derived from a manual price when one was given rather than left at
 * zero. A line at 900 against a 1000 list reads as 10% off either way.
 *
 * The two inputs are mutually exclusive: honouring both would mean deciding
 * whether the percentage applies before or after the manual price, and both
 * answers silently contradict whoever sent them.
 */
export function negotiatedPrice({
  listPrice,
  unitPrice,
  discountPct,
}: NegotiatedPriceInput): NegotiatedPrice {
  const hasPrice = unitPrice !== undefined && unitPrice !== null;
  const hasDiscount =
    discountPct !== undefined && discountPct !== null && discountPct !== 0;

  if (hasPrice && hasDiscount) {
    throw new BadRequestException(
      'send either unitPrice or discountPct on a line, not both',
    );
  }

  if (hasPrice) {
    const effective = round2(unitPrice!);
    // Derived, not assumed zero: a manual price IS a discount when it lands
    // below list, and recording it as 0% would hide exactly what a later
    // review is looking for. A price ABOVE list is a surcharge, not a negative
    // discount, so it floors at 0 rather than going negative.
    const derived =
      listPrice > 0 ? round2(((listPrice - effective) / listPrice) * 100) : 0;
    return { effective, discountPct: Math.max(0, derived) };
  }

  if (hasDiscount) {
    return {
      effective: round2(listPrice * (1 - discountPct! / 100)),
      discountPct: round2(discountPct!),
    };
  }

  return { effective: listPrice, discountPct: 0 };
}
