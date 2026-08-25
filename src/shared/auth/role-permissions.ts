/**
 * Explicit, auditable macro-role -> `module:action` permission expansion
 * (D1). `RolesGuard` consults this map before checking `@Roles(...)`, so a
 * new grant must be added here in writing — never inferred from a role name
 * such as `roles.includes('admin')`.
 *
 * `admin` is 22 strings: the 20 distinct `@Roles(...)` strings already used
 * across controllers, plus `quotes:admin` (D4 — already checked directly via
 * `user.roles.includes('quotes:admin')` in `quote-visibility.ts` /
 * `quote.service.ts`, but never gated by an `@Roles(...)` decorator, so it
 * is not among those 20) and `orders:admin` (D7). Both `:admin` additions
 * are visibility-only signals, never used as an `@Roles` route gate.
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
  ],
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
