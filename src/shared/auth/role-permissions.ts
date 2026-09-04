/**
 * Explicit, auditable macro-role -> `module:action` permission expansion
 * (D1). `RolesGuard` consults this map before checking `@Roles(...)`, so a
 * new grant must be added here in writing — never inferred from a role name
 * such as `roles.includes('admin')`.
 *
 * `admin` is 24 strings: the 20 distinct `@Roles(...)` strings already used
 * across controllers, plus `quotes:admin` (D4 — already checked directly via
 * `user.roles.includes('quotes:admin')` in `quote-visibility.ts` /
 * `quote.service.ts`, but never gated by an `@Roles(...)` decorator, so it
 * is not among those 20), `orders:admin` (D7), `billing:admin` (F11 —
 * mirrors D7's reasoning for billing) and `orders:create` (F6/F11). The
 * first three are visibility-only signals, never used as an `@Roles` route
 * gate. `orders:create` is the exception: it IS a route gate on
 * `POST /v1/orders`, paired there with `orders:write` so nothing regresses.
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: [
    'billing:write',
    'customers:read',
    'customers:write',
    'customers:admin',
    'commerce:write',
    'vehicles:write',
    'sales:write',
    'compatibility:write',
    'integrations:write',
    'payments:write',
    'inventory:read',
    'inventory:write',
    'quotes:read',
    'quotes:write',
    'quotes:admin',
    'orders:write',
    'orders:admin',
    'suppliers:write',
    'pim:write',
    'notifications:read',
    'shipping:write',
    'shipping:read',
    'billing:admin',
    'orders:create',
  ],
  /**
   * `customer` is a macro identity role issued by autoboost-backend-auth.
   * The checkout write permission is safe only because Polar checkout routes
   * scope each order to the authenticated customer before creating or reading
   * a checkout. Other customer reads are ungated and ownership-scoped, while
   * operational writes remain staff-only.
   */
  customer: [
    'orders:create', // F1/F6 — POST /v1/orders ONLY. NOT orders:write (5 unscoped mutations, Defect A).
    'shipping:read', // F9 — quote + track. NOT shipping:write (buys/voids real Skydropx labels).
    'payments:write', // Customer-owned Polar checkout only; service enforces order ownership.
  ],
  /**
   * `sales_rep` opens the doors; it does not decide what is behind them.
   *
   * Scoping to the rep's own portfolio already happens further in, from
   * `user.salesRepId` — see `customer-visibility.ts` and `quote-visibility.ts`,
   * which never consult a role code for that. So these four strings are only
   * the route gates on `customer.controller.ts` and `quote.controller.ts`; a
   * rep still sees exactly the customers and quotes it owns.
   *
   * Deliberately WITHOUT `customers:admin` and `quotes:admin`: both are the
   * signals those visibility modules read to bypass ownership scoping
   * entirely, which is the one thing a rep must never do.
   */
  sales_rep: ['customers:read', 'customers:write', 'quotes:read', 'quotes:write'],
};

/** Expands a caller's macro roles into their full granted-permission set. */
export function expand(roles: string[]): Set<string> {
  const granted = new Set<string>(roles);
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      granted.add(permission);
    }
  }
  return granted;
}
