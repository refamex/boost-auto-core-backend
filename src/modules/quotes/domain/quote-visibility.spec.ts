import { FindOperator } from 'typeorm';
import { AuthenticatedUser } from '../../../shared/auth/jwt-payload.interface';
import { buildWhere, effectiveStatus } from './quote-visibility';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const PAST = new Date('2026-06-01T00:00:00.000Z');
const FUTURE = new Date('2026-07-01T00:00:00.000Z');

const admin: AuthenticatedUser = {
  id: 'admin-user',
  roles: ['quotes:read', 'quotes:admin'],
};
const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['quotes:read'],
  salesRepId: 'rep-1',
};
const customer: AuthenticatedUser = {
  id: 'customer-1',
  roles: ['quotes:read'],
};

/** In()/LessThan() produce FindOperator wrappers; assert on the wrapped value. */
const operand = (v: unknown): unknown =>
  v instanceof FindOperator ? v.value : v;

describe('buildWhere', () => {
  describe('admin tier', () => {
    it('applies no owner filter', () => {
      const where = buildWhere(admin, {}, NOW)!;
      expect(where.salesRepId).toBeUndefined();
      expect(where.customerId).toBeUndefined();
    });

    it('sees every status, drafts included', () => {
      const where = buildWhere(admin, {}, NOW)!;
      expect(operand(where.status)).toContain('draft');
    });
  });

  describe('rep tier', () => {
    it('is scoped to the rep own portfolio', () => {
      const where = buildWhere(rep, {}, NOW)!;
      expect(where.salesRepId).toBe('rep-1');
      expect(where.customerId).toBeUndefined();
    });

    it('sees its own drafts', () => {
      const where = buildWhere(rep, { status: 'draft' }, NOW)!;
      expect(where.status).toBe('draft');
      expect(where.salesRepId).toBe('rep-1');
    });

    it('admin wins over a rep id when the caller holds both', () => {
      const both: AuthenticatedUser = {
        id: 'u',
        roles: ['quotes:admin'],
        salesRepId: 'rep-1',
      };
      expect(buildWhere(both, {}, NOW)!.salesRepId).toBeUndefined();
    });
  });

  describe('customer tier', () => {
    it('is scoped to quotes addressed to the caller', () => {
      const where = buildWhere(customer, {}, NOW)!;
      expect(where.customerId).toBe('customer-1');
      expect(where.salesRepId).toBeUndefined();
    });

    it('never sees drafts', () => {
      expect(operand(buildWhere(customer, {}, NOW)!.status)).not.toContain(
        'draft',
      );
    });

    it('asking for drafts yields an empty page, not an error', () => {
      // null means "nothing this caller may see" — the controller must answer
      // an empty page rather than 403, which would confirm drafts exist.
      expect(buildWhere(customer, { status: 'draft' }, NOW)).toBeNull();
    });

    it('cannot filter by somebody else customer id', () => {
      expect(
        buildWhere(customer, { customerId: 'customer-2' }, NOW),
      ).toBeNull();
    });

    it('may redundantly filter by its own customer id', () => {
      const where = buildWhere(customer, { customerId: 'customer-1' }, NOW);
      expect(where!.customerId).toBe('customer-1');
    });
  });

  describe('derived expiry in filters', () => {
    it('status=expired becomes sent past its validity', () => {
      const where = buildWhere(rep, { status: 'expired' }, NOW)!;
      expect(where.status).toBe('sent');
      expect((where.validUntil as FindOperator<Date>).type).toBe('lessThan');
      expect(operand(where.validUntil)).toBe(NOW);
    });

    it('status=sent excludes quotes past their validity', () => {
      const where = buildWhere(rep, { status: 'sent' }, NOW)!;
      expect(where.status).toBe('sent');
      expect((where.validUntil as FindOperator<Date>).type).toBe(
        'moreThanOrEqual',
      );
    });

    it('a customer may ask for expired quotes', () => {
      const where = buildWhere(customer, { status: 'expired' }, NOW)!;
      expect(where.customerId).toBe('customer-1');
      expect(where.status).toBe('sent');
    });

    it('rejects a status that does not exist', () => {
      expect(buildWhere(rep, { status: 'cancelled' }, NOW)).toBeNull();
    });
  });
});

describe('effectiveStatus', () => {
  it('reports a sent quote past its validity as expired', () => {
    expect(effectiveStatus('sent', PAST, NOW)).toBe('expired');
  });

  it('leaves a sent quote inside its validity alone', () => {
    expect(effectiveStatus('sent', FUTURE, NOW)).toBe('sent');
  });

  it('does not expire a decision once taken', () => {
    // A decision outlives the validity window: approving on the last valid day
    // must not turn into "expired" the next morning.
    expect(effectiveStatus('approved', PAST, NOW)).toBe('approved');
    expect(effectiveStatus('rejected', PAST, NOW)).toBe('rejected');
    expect(effectiveStatus('converted', PAST, NOW)).toBe('converted');
  });

  it('does not expire a draft that was never sent', () => {
    expect(effectiveStatus('draft', PAST, NOW)).toBe('draft');
  });

  it('treats the exact validity instant as still valid', () => {
    expect(effectiveStatus('sent', NOW, NOW)).toBe('sent');
  });
});
