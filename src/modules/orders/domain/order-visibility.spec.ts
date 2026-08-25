import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { buildWhere } from './order-visibility';

const admin: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };
const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['orders:write'],
  salesRepId: 'rep-1',
};
const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };

describe('buildWhere', () => {
  describe('admin tier', () => {
    it('applies no owner filter, so every order is visible', () => {
      const where = buildWhere(admin, {})!;
      expect(where.salesRepId).toBeUndefined();
      expect(where.customerId).toBeUndefined();
    });

    it('admin beats rep when the caller holds both', () => {
      const both: AuthenticatedUser = {
        id: 'u',
        roles: ['admin'],
        salesRepId: 'rep-1',
      };
      expect(buildWhere(both, {})!.salesRepId).toBeUndefined();
    });
  });

  describe('rep tier', () => {
    it('is scoped to the rep own portfolio', () => {
      const where = buildWhere(rep, {})!;
      expect(where.salesRepId).toBe('rep-1');
      expect(where.customerId).toBeUndefined();
    });
  });

  describe('customer tier', () => {
    it('is scoped to orders the caller placed', () => {
      const where = buildWhere(customer, {})!;
      expect(where.customerId).toBe('customer-1');
      expect(where.salesRepId).toBeUndefined();
    });

    it('cannot filter by somebody else customerId', () => {
      // null means "nothing this caller may see" — the controller must
      // answer an empty page rather than 403, which would confirm the
      // order exists.
      expect(buildWhere(customer, { customerId: 'customer-2' })).toBeNull();
    });

    it('may redundantly filter by its own customerId', () => {
      const where = buildWhere(customer, { customerId: 'customer-1' });
      expect(where!.customerId).toBe('customer-1');
    });
  });

  describe('status filter', () => {
    it('is passed through for any tier that can see rows at all', () => {
      expect(buildWhere(admin, { status: 'confirmed' })!.status).toBe(
        'confirmed',
      );
      expect(buildWhere(rep, { status: 'draft' })!.status).toBe('draft');
    });

    it('is left unset when not requested', () => {
      expect(buildWhere(admin, {})!.status).toBeUndefined();
    });
  });
});
