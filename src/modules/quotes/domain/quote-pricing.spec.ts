import { BadRequestException } from '@nestjs/common';
import { negotiatedPrice } from './quote-pricing';

describe('negotiatedPrice', () => {
  it('honours the list price when nothing was negotiated', () => {
    expect(negotiatedPrice({ listPrice: 1000 })).toEqual({
      effective: 1000,
      discountPct: 0,
    });
  });

  it('applies a percentage off the list price', () => {
    expect(negotiatedPrice({ listPrice: 1000, discountPct: 10 })).toEqual({
      effective: 900,
      discountPct: 10,
    });
  });

  it('takes a manual price as given', () => {
    expect(negotiatedPrice({ listPrice: 1000, unitPrice: 850 }).effective).toBe(850);
  });

  it('derives the discount from a manual price instead of recording zero', () => {
    // The point of the derivation: a review months later asks "why was this
    // sold below list", and a 0% on a 850-against-1000 line hides the answer.
    expect(negotiatedPrice({ listPrice: 1000, unitPrice: 850 }).discountPct).toBe(15);
  });

  it('treats a price above list as a surcharge, not a negative discount', () => {
    expect(negotiatedPrice({ listPrice: 1000, unitPrice: 1200 })).toEqual({
      effective: 1200,
      discountPct: 0,
    });
  });

  it('rejects sending both a manual price and a discount', () => {
    // Honouring both would mean deciding whether the percentage applies before
    // or after the manual price; either answer contradicts the caller.
    expect(() =>
      negotiatedPrice({ listPrice: 1000, unitPrice: 900, discountPct: 5 }),
    ).toThrow(BadRequestException);
  });

  it('allows a manual price alongside an explicit zero discount', () => {
    // `discountPct: 0` is what a form sends when the field was left alone; it
    // must not read as a competing instruction.
    expect(
      negotiatedPrice({ listPrice: 1000, unitPrice: 900, discountPct: 0 }).effective,
    ).toBe(900);
  });

  it('rounds to two decimals', () => {
    expect(negotiatedPrice({ listPrice: 999.99, discountPct: 33.33 }).effective).toBe(
      666.69,
    );
  });

  it('gives away everything at 100% and nothing at 0%', () => {
    expect(negotiatedPrice({ listPrice: 1000, discountPct: 100 }).effective).toBe(0);
    expect(negotiatedPrice({ listPrice: 1000, discountPct: 0 }).effective).toBe(1000);
  });

  it('does not divide by zero when the list price is zero', () => {
    // `map-product.ts` turns a missing price into 0, so this reaches here.
    expect(negotiatedPrice({ listPrice: 0, unitPrice: 500 })).toEqual({
      effective: 500,
      discountPct: 0,
    });
  });
});
