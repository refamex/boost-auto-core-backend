/**
 * Pure link-once guard for attaching an auth-issued `authCustomerId` to a
 * prospect profile (D3). This is the synchronous, clear-error layer of the
 * three that enforce the invariant: this guard runs first, the service's
 * compare-and-set `UPDATE ... WHERE auth_customer_id IS NULL` is the
 * transactional layer, and `uq_customer_profile_auth_customer_id` (added in
 * Phase 5) is the final concurrency arbiter for two profiles racing to claim
 * the same auth id.
 *
 * A profile may only be linked while its `authCustomerId` is NULL. Re-linking
 * an already-linked profile is rejected unconditionally — even to the same
 * value — matching the CAS it mirrors.
 */
export function canLink(
  currentAuthCustomerId: string | null | undefined,
): boolean {
  return currentAuthCustomerId == null;
}
