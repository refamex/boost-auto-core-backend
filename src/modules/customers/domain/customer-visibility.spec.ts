import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { buildWhere, isVisibleToUser } from './customer-visibility';

const admin: AuthenticatedUser = {
  id: 'admin-user',
  roles: ['customers:read', 'customers:admin'],
};
const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['customers:read', 'customers:write'],
  salesRepId: 'rep-1',
};
const otherRep: AuthenticatedUser = {
  id: 'rep-2-user',
  roles: ['customers:read', 'customers:write'],
  salesRepId: 'rep-2',
};
const noScopeCaller: AuthenticatedUser = {
  id: 'nobody',
  roles: ['customers:read'],
};

describe('buildWhere', () => {
  describe('admin tier', () => {
    it('applies no owner filter, so unowned house accounts are included', () => {
      const where = buildWhere(admin, {})!;
      expect(where.ownerSalesRepId).toBeUndefined();
    });

    it('may still narrow by ownerSalesRepId via an explicit query filter', () => {
      const where = buildWhere(admin, { ownerSalesRepId: 'rep-1' })!;
      expect(where.ownerSalesRepId).toBe('rep-1');
    });
  });

  describe('rep tier', () => {
    it('is scoped to the rep own portfolio, with no salesRepId query param needed', () => {
      const where = buildWhere(rep, {})!;
      expect(where.ownerSalesRepId).toBe('rep-1');
    });

    it('admin wins over a rep id when the caller holds both', () => {
      const both: AuthenticatedUser = {
        id: 'u',
        roles: ['customers:admin'],
        salesRepId: 'rep-1',
      };
      expect(buildWhere(both, {})!.ownerSalesRepId).toBeUndefined();
    });

    it('cannot widen its scope by filtering for another rep id', () => {
      expect(buildWhere(rep, { ownerSalesRepId: 'rep-2' })).toBeNull();
    });

    it('may redundantly filter by its own rep id', () => {
      const where = buildWhere(rep, { ownerSalesRepId: 'rep-1' });
      expect(where!.ownerSalesRepId).toBe('rep-1');
    });
  });

  describe('customer tier — out of scope this change', () => {
    it('a caller with neither admin nor a salesRepId claim can never match', () => {
      // No self-service customer tier in this change (see spec Purpose note).
      expect(buildWhere(noScopeCaller, {})).toBeNull();
    });
  });

  describe('non-matching scope', () => {
    it('returns null so the caller gets an empty page, never an error', () => {
      expect(buildWhere(noScopeCaller, {})).toBeNull();
    });
  });

  describe('isActive filter', () => {
    it('passes isActive through for any tier that can see rows at all', () => {
      expect(buildWhere(admin, { isActive: false })!.isActive).toBe(false);
      expect(buildWhere(rep, { isActive: true })!.isActive).toBe(true);
    });

    it('is left unset when not requested', () => {
      expect(buildWhere(admin, {})!.isActive).toBeUndefined();
    });
  });
});

describe('isVisibleToUser', () => {
  it('admin sees every profile, including one with no owner', () => {
    expect(isVisibleToUser({ ownerSalesRepId: null }, admin)).toBe(true);
    expect(isVisibleToUser({ ownerSalesRepId: 'rep-1' }, admin)).toBe(true);
  });

  it('a rep sees only a profile it owns', () => {
    expect(isVisibleToUser({ ownerSalesRepId: 'rep-1' }, rep)).toBe(true);
    expect(isVisibleToUser({ ownerSalesRepId: 'rep-2' }, rep)).toBe(false);
  });

  it('a rep never sees an unowned house account', () => {
    expect(isVisibleToUser({ ownerSalesRepId: null }, rep)).toBe(false);
  });

  it('returns false when the profile does not exist', () => {
    expect(isVisibleToUser(null, admin)).toBe(false);
    expect(isVisibleToUser(undefined, otherRep)).toBe(false);
  });
});
