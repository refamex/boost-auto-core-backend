import { documentPriceListCode } from './document-price-list-code';

describe('documentPriceListCode', () => {
  it('ignores body when honorBodyCode is false and uses the profile', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: false,
        bodyCode: 'WHOLESALE',
        profileCode: 'STANDARD',
      }),
    ).toBe('STANDARD');
  });

  it('returns undefined when the customer has no profile assignment', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: false,
        bodyCode: 'WHOLESALE',
        profileCode: null,
      }),
    ).toBeUndefined();
  });

  it('lets staff body win over the profile assignment', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: true,
        bodyCode: 'VIP',
        profileCode: 'STANDARD',
      }),
    ).toBe('VIP');
  });

  it('uses the profile when staff omit a body code', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: true,
        profileCode: 'VIP',
      }),
    ).toBe('VIP');
  });

  it('treats empty or whitespace body as omitted', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: true,
        bodyCode: '  ',
        profileCode: 'VIP',
      }),
    ).toBe('VIP');
  });

  it('treats empty or whitespace profile as unassigned', () => {
    expect(
      documentPriceListCode({
        honorBodyCode: false,
        profileCode: '  ',
      }),
    ).toBeUndefined();
  });
});
