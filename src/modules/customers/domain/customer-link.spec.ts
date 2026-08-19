import { canLink } from './customer-link';

describe('canLink', () => {
  it('allows linking a prospect whose auth_customer_id is NULL', () => {
    expect(canLink(null)).toBe(true);
  });

  it('allows linking a prospect whose auth_customer_id is undefined', () => {
    expect(canLink(undefined)).toBe(true);
  });

  it('rejects re-linking a profile that is already linked to a different value', () => {
    expect(canLink('11111111-1111-4111-8111-111111111111')).toBe(false);
  });

  it('rejects re-linking a profile even to the same value it already has', () => {
    // The CAS this guard mirrors (`WHERE auth_customer_id IS NULL`) rejects
    // any already-linked row unconditionally — a same-value "re-link" is not
    // treated as an idempotent no-op.
    expect(canLink('22222222-2222-4222-8222-222222222222')).toBe(false);
  });
});
