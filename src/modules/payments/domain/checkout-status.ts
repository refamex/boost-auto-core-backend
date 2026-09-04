/**
 * Checkout statuses after which Polar will never charge the card.
 *
 * Extracted from `PolarCheckoutService` because a second module now has to ask
 * the same question. `ShippingQuoteService` refuses to re-price the freight
 * while a checkout is still live: that checkout was created with the OLD
 * `grand_total`, and Polar charges the amount it was opened with, not the one
 * the order carries when the customer finally clicks pay.
 *
 * Two copies of this list would mean the two modules disagree about when an
 * order is still chargeable, and the disagreement would surface as a customer
 * paying an amount nobody can reconstruct.
 */
export const TERMINAL_CHECKOUT_STATUSES = [
  'succeeded',
  'confirmed',
  'expired',
  'failed',
] as const;
