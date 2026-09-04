import {
  buildObjectKey,
  checkUpload,
  isUploadPurpose,
  PURPOSE_RULES,
} from './upload-purpose';

/**
 * These rules are the ONLY enforcement point.
 *
 * The browser PUTs straight to S3, so after the signature is issued nothing of
 * ours sees the bytes. Every check that will ever happen happens here.
 */
describe('checkUpload', () => {
  const image = {
    purpose: 'product-image',
    contentType: 'image/jpeg',
    size: 500_000,
  };

  it('accepts a normal product photo', () => {
    const result = checkUpload(image);
    expect(result.ok).toBe(true);
  });

  it('rejects a purpose nobody defined', () => {
    // A free-form purpose would become a free-form key prefix.
    expect(checkUpload({ ...image, purpose: 'anything' })).toEqual({
      ok: false,
      rejection: { reason: 'unknown-purpose' },
    });
  });

  it('rejects SVG, which browsers execute', () => {
    // This is why the rule lists exact types instead of `image/*`: an SVG is a
    // script container, and it matches that wildcard.
    expect(
      checkUpload({ ...image, contentType: 'image/svg+xml' }),
    ).toMatchObject({ ok: false, rejection: { reason: 'content-type' } });
  });

  it('survives a charset parameter without loosening into a prefix match', () => {
    expect(
      checkUpload({
        purpose: 'invoice-document',
        contentType: 'text/xml; charset=utf-8',
        size: 4_000,
      }).ok,
    ).toBe(true);

    // ...but a type that merely STARTS with an allowed one is still rejected.
    expect(checkUpload({ ...image, contentType: 'image/jpeg-evil' }).ok).toBe(
      false,
    );
  });

  it('rejects a file over the limit and says what the limit is', () => {
    const result = checkUpload({ ...image, size: 11 * 1024 * 1024 });
    expect(result).toEqual({
      ok: false,
      rejection: { reason: 'too-large', maxBytes: 10 * 1024 * 1024 },
    });
  });

  it('rejects a zero or nonsense size', () => {
    // The size is part of what gets signed; a zero would sign an upload S3
    // could never accept, and the failure would surface as an opaque 403 in
    // the browser instead of a message here.
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkUpload({ ...image, size }).ok).toBe(false);
    }
  });

  it('keeps invoice documents and product images on separate permissions', () => {
    // Otherwise whoever can edit the catalogue can write fiscal documents.
    expect(PURPOSE_RULES['product-image'].permission).toBe('pim:write');
    expect(PURPOSE_RULES['invoice-document'].permission).toBe('billing:write');
  });

  it('gives each purpose its own key prefix', () => {
    expect(PURPOSE_RULES['product-image'].prefix).not.toBe(
      PURPOSE_RULES['invoice-document'].prefix,
    );
  });
});

describe('isUploadPurpose', () => {
  it('accepts only the declared purposes', () => {
    expect(isUploadPurpose('product-image')).toBe(true);
    expect(isUploadPurpose('invoice-document')).toBe(true);
    expect(isUploadPurpose('')).toBe(false);
    expect(isUploadPurpose('__proto__')).toBe(false);
  });
});

describe('buildObjectKey', () => {
  const rule = PURPOSE_RULES['product-image'];
  const now = new Date('2026-09-03T12:00:00Z');

  it('builds the key entirely server-side', () => {
    expect(buildObjectKey(rule, 'image/jpeg', 'abc-123', now)).toBe(
      'products/2026/09/abc-123.jpg',
    );
  });

  it('never lets a caller-shaped id escape the prefix', () => {
    // The id is a randomUUID in production. This asserts the shape of the key
    // so nobody later swaps in a filename: a path is a place to write, and the
    // caller does not get to choose one.
    const key = buildObjectKey(rule, 'image/png', 'x', now);
    expect(key.startsWith('products/')).toBe(true);
    expect(key).not.toContain('..');
  });

  it('maps both XML content types to the same extension', () => {
    const invoice = PURPOSE_RULES['invoice-document'];
    expect(buildObjectKey(invoice, 'application/xml', 'i', now)).toBe(
      'invoices/2026/09/i.xml',
    );
    expect(buildObjectKey(invoice, 'text/xml; charset=utf-8', 'i', now)).toBe(
      'invoices/2026/09/i.xml',
    );
  });

  it('pads the month so the bucket sorts correctly', () => {
    expect(
      buildObjectKey(rule, 'image/webp', 'z', new Date('2026-01-05T00:00:00Z')),
    ).toBe('products/2026/01/z.webp');
  });
});
