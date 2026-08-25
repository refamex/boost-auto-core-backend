import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './jwt-payload.interface';
import { RolesGuard } from './roles.guard';

const makeReflector = (required: string[] | undefined): Reflector =>
  ({ getAllAndOverride: () => required }) as unknown as Reflector;

const makeCtx = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const admin: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };
const rep: AuthenticatedUser = { id: 'rep-user', roles: ['customers:write'] };

describe('RolesGuard — role expansion, then `some` (D1, D4/D7)', () => {
  it('grants a caller who holds the single required permission directly', () => {
    const guard = new RolesGuard(makeReflector(['customers:write']));

    expect(guard.canActivate(makeCtx(rep))).toBe(true);
  });

  it('admin expands to a single granular permission it does not hold literally', () => {
    const guard = new RolesGuard(makeReflector(['pim:write']));

    expect(guard.canActivate(makeCtx(admin))).toBe(true);
  });

  it.each(['customers:admin', 'quotes:admin', 'orders:admin'])(
    'admin expands to the %s tier',
    (permission) => {
      const guard = new RolesGuard(makeReflector([permission]));

      expect(guard.canActivate(makeCtx(admin))).toBe(true);
    },
  );

  it('denies a caller lacking admin and the exact required permission (403)', () => {
    const guard = new RolesGuard(makeReflector(['pim:write']));

    expect(() => guard.canActivate(makeCtx(rep))).toThrow(ForbiddenException);
  });

  it('does NOT grant via a blanket admin bypass — an unmapped permission is still denied', () => {
    const guard = new RolesGuard(makeReflector(['nonexistent:permission']));

    expect(() => guard.canActivate(makeCtx(admin))).toThrow(ForbiddenException);
  });

  it('allows unrestricted routes through unchanged (no @Roles decorator)', () => {
    const guard = new RolesGuard(makeReflector(undefined));

    expect(guard.canActivate(makeCtx(rep))).toBe(true);
  });
});
