import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { buildWhere } from './invoice-visibility';

const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };
const admin: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };
// A sales rep is NOT a tier here: `InvoiceEntity` has no `salesRepId`
// column, so there is nothing to scope a rep to. They read as a plain
// caller, pinned to their own id.
const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: [],
  salesRepId: 'rep-9',
};

describe('invoice-visibility buildWhere', () => {
  it('leaves the query unfiltered for a billing admin', () => {
    expect(buildWhere(admin, {})).toEqual({});
  });

  it('pins a plain caller to their own customerId', () => {
    expect(buildWhere(customer, {})).toEqual({ customerId: 'customer-1' });
  });

  it('pins a caller holding only a salesRepId claim to their own id, since invoices carry no rep column', () => {
    expect(buildWhere(rep, {})).toEqual({ customerId: 'rep-user' });
  });

  it('returns null when a plain caller filters by somebody else customerId', () => {
    expect(buildWhere(customer, { customerId: 'someone-else' })).toBeNull();
  });

  it('accepts a plain caller filtering by their own customerId', () => {
    expect(buildWhere(customer, { customerId: 'customer-1' })).toEqual({
      customerId: 'customer-1',
    });
  });

  it('lets a billing admin filter by any customerId', () => {
    expect(buildWhere(admin, { customerId: 'someone-else' })).toEqual({
      customerId: 'someone-else',
    });
  });

  it('narrows by orderId without unpinning the ownership filter', () => {
    expect(buildWhere(customer, { orderId: 'order-9' })).toEqual({
      customerId: 'customer-1',
      orderId: 'order-9',
    });
  });

  it('still returns null for a foreign customerId even when an orderId is supplied', () => {
    expect(
      buildWhere(customer, { customerId: 'someone-else', orderId: 'order-9' }),
    ).toBeNull();
  });

  it('checks billing:admin through the macro expansion, not the raw roles claim', () => {
    const raw: AuthenticatedUser = { id: 'u', roles: ['billing:admin'] };
    expect(buildWhere(raw, {})).toEqual({});
  });
});
