import {
  PRICE_ASSERTION_TOLERANCE,
  priceLine,
  quotedPriceMatches,
  round2,
} from './order-pricing';

describe('round2', () => {
  it('rounds to cents', () => {
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.346)).toBe(12.35);
  });

  it('rounds half away from zero on values binary floating point gets wrong', () => {
    // 1.005 is stored as 1.00499999999999989, so `Math.round(v * 100) / 100`
    // answers 1.00 here. This is the case the decimal-string scaling exists for.
    expect(round2(1.005)).toBe(1.01);
    expect(round2(8.075)).toBe(8.08);
  });

  it('leaves values that are already cents untouched', () => {
    expect(round2(0)).toBe(0);
    expect(round2(1999.99)).toBe(1999.99);
  });

  it('collapses magnitudes JS prints in exponential notation', () => {
    expect(round2(1e-7)).toBe(0);
  });

  it('refuses a non-finite amount rather than persisting NaN', () => {
    expect(() => round2(Number.NaN)).toThrow(RangeError);
    expect(() => round2(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('priceLine', () => {
  it('taxes the rounded net, and lineTotal is exactly net + tax', () => {
    const line = priceLine({ qty: 3, unitPrice: 100, taxRate: 0.16 });

    expect(line.net).toBe(300);
    expect(line.tax).toBe(48);
    expect(line.lineTotal).toBe(348);
    expect(line.lineTotal).toBe(round2(line.net + line.tax));
  });

  it('keeps net + tax === lineTotal even when the rate produces long decimals', () => {
    const line = priceLine({ qty: 7, unitPrice: 33.33, taxRate: 0.16 });

    // 7 * 33.33 = 233.31 -> tax 37.3296 -> 37.33
    expect(line.net).toBe(233.31);
    expect(line.tax).toBe(37.33);
    expect(line.lineTotal).toBe(270.64);
    expect(round2(line.net + line.tax)).toBe(line.lineTotal);
  });

  it('charges no tax at a zero rate', () => {
    expect(priceLine({ qty: 2, unitPrice: 50, taxRate: 0 })).toEqual({
      net: 100,
      tax: 0,
      lineTotal: 100,
    });
  });

  it('handles fractional quantities, which qty numeric(14,2) allows', () => {
    const line = priceLine({ qty: 1.5, unitPrice: 10.99, taxRate: 0.16 });

    expect(line.net).toBe(16.49); // 16.485 -> half away from zero
    expect(line.tax).toBe(2.64);
    expect(line.lineTotal).toBe(19.13);
  });
});

describe('quotedPriceMatches', () => {
  it('accepts an exact match', () => {
    expect(quotedPriceMatches(1499.99, 1499.99)).toBe(true);
  });

  it('accepts drift within one cent, which rounding alone can produce', () => {
    expect(quotedPriceMatches(1499.98, 1499.99)).toBe(true);
    expect(quotedPriceMatches(1500.0, 1499.99)).toBe(true);
    expect(PRICE_ASSERTION_TOLERANCE).toBe(0.01);
  });

  it('rejects anything further apart, in either direction', () => {
    expect(quotedPriceMatches(1499.97, 1499.99)).toBe(false);
    expect(quotedPriceMatches(1500.01, 1499.99)).toBe(false);
  });

  it('rejects the attack this guard exists for', () => {
    expect(quotedPriceMatches(0.01, 1499.99)).toBe(false);
  });
});
