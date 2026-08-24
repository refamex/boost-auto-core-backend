import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { buildOrderWhere } from './shipping-visibility';

const ORDER_ID = 'order-1';

const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };
const admin: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };
const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: [],
  salesRepId: 'rep-9',
};

describe('shipping-visibility buildOrderWhere', () => {
  it('pins a plain caller to their own orders and to the requested order', () => {
    expect(buildOrderWhere(customer, ORDER_ID)).toEqual({
      customerId: 'customer-1',
      id: ORDER_ID,
    });
  });

  it('scopes a sales rep by their own salesRepId, inheriting the order tiering', () => {
    expect(buildOrderWhere(rep, ORDER_ID)).toEqual({
      salesRepId: 'rep-9',
      id: ORDER_ID,
    });
  });

  it('leaves an order admin unfiltered apart from the order id itself', () => {
    expect(buildOrderWhere(admin, ORDER_ID)).toEqual({ id: ORDER_ID });
  });

  it('keeps the order id even when the ownership filter is the whole scope', () => {
    const where = buildOrderWhere(customer, 'another-order');
    expect(where).toHaveProperty('id', 'another-order');
    expect(where).toHaveProperty('customerId', 'customer-1');
  });
});
