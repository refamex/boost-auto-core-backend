import { parcelFromLines, type ParcelLine } from './parcel-from-lines';

const line = (over: Partial<ParcelLine> = {}): ParcelLine => ({
  productId: 1,
  qty: 1,
  sku: 'SKU-1',
  weight: 2,
  length: 30,
  width: 20,
  height: 10,
  ...over,
});

const parcelOf = (lines: ParcelLine[]) => {
  const result = parcelFromLines(lines);
  if (!result.ok) throw new Error(`expected a parcel, got ${result.reason}`);
  return result.parcel;
};

describe('parcelFromLines', () => {
  it('passes a single item through, rounding up its dimensions', () => {
    expect(parcelOf([line({ weight: 2.5, length: 30.2, width: 20.7, height: 10.1 })])).toEqual({
      weight: 2.5,
      length: 31,
      width: 21,
      height: 11,
    });
  });

  it('adds weight across quantity', () => {
    expect(parcelOf([line({ qty: 4, weight: 2.5 })]).weight).toBe(10);
  });

  it('stacks height while length and width stay the largest piece', () => {
    // The rule in one assertion: a tower of three, in a carton sized by the
    // biggest footprint.
    expect(parcelOf([line({ qty: 3 })])).toEqual({
      weight: 6,
      length: 30,
      width: 20,
      height: 30,
    });
  });

  it('sorts each line by its own dimensions before stacking', () => {
    // A piece described as 10×20×30 is the same box as 30×20×10; whoever loaded
    // the catalogue should not decide how it packs.
    expect(parcelOf([line({ length: 10, width: 20, height: 30 })])).toEqual(
      parcelOf([line({ length: 30, width: 20, height: 10 })]),
    );
  });

  it('takes the largest footprint across different products', () => {
    const parcel = parcelOf([
      line({ productId: 1, sku: 'A', length: 30, width: 20, height: 10 }),
      line({ productId: 2, sku: 'B', length: 175, width: 92, height: 24 }),
    ]);
    expect(parcel.length).toBe(175);
    expect(parcel.width).toBe(92);
    expect(parcel.height).toBe(34);
  });

  it('never quotes cheaper for more items', () => {
    // Monotonicity is what keeps the rule honest: nobody should be able to lower
    // the freight by adding to the cart.
    const one = parcelOf([line({ qty: 1 })]);
    const five = parcelOf([line({ qty: 5 })]);
    expect(five.weight).toBeGreaterThan(one.weight);
    expect(five.height).toBeGreaterThan(one.height);
  });

  it('rejects a line with no weight instead of assuming one kilo', () => {
    // Defaulting here is how the fixed 1kg parcel survived this long: the quote
    // comes back plausible and wrong, and nothing says so.
    const result = parcelFromLines([line({ sku: 'NO-WEIGHT', weight: null })]);
    expect(result).toEqual({
      ok: false,
      reason: 'missing-dimensions',
      skus: ['NO-WEIGHT'],
    });
  });

  it('names every offending SKU, not just the first', () => {
    // The person fixing the catalogue needs the whole list, or they fix one and
    // hit the same wall again.
    const result = parcelFromLines([
      line({ sku: 'A' }),
      line({ sku: 'B', height: null }),
      line({ sku: 'C', weight: 0 }),
    ]);
    expect(result).toMatchObject({ ok: false, skus: ['B', 'C'] });
  });

  it('treats a zero dimension as missing', () => {
    expect(parcelFromLines([line({ sku: 'FLAT', width: 0 })])).toMatchObject({
      ok: false,
      reason: 'missing-dimensions',
    });
  });

  it('rounds a fractional quantity up — half a bumper still fills a box', () => {
    expect(parcelOf([line({ qty: 1.5, weight: 2 })]).weight).toBe(4);
  });

  it('refuses an empty order rather than quoting an empty box', () => {
    expect(parcelFromLines([])).toMatchObject({ ok: false });
  });

  it('does NOT reject an oversize piece — that answer belongs to Skydropx', () => {
    // A third of this catalogue exceeds ordinary parcel limits. Refusing them
    // here would block those sales on our guess about what carriers accept.
    const parcel = parcelOf([line({ sku: 'HUGE', length: 251, width: 92, height: 24, weight: 80 })]);
    expect(parcel).toEqual({ weight: 80, length: 251, width: 92, height: 24 });
  });
});
