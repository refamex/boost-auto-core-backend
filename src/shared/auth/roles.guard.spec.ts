import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrderController } from '../../modules/orders/infrastructure/http/order.controller';
import { ShippingController } from '../../modules/shipping/infrastructure/http/shipping.controller';
import { AuthenticatedUser } from './jwt-payload.interface';
import { ROLE_PERMISSIONS, expand } from './role-permissions';
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

describe('role-permissions map — customer row and admin growth (F6, F11)', () => {
  it('customer expands to exactly orders:create and shipping:read', () => {
    expect(ROLE_PERMISSIONS.customer).toEqual([
      'orders:create',
      'shipping:read',
    ]);
  });

  it('admin is 24 strings, including billing:admin and orders:create', () => {
    expect(ROLE_PERMISSIONS.admin).toHaveLength(24);
    expect(ROLE_PERMISSIONS.admin).toEqual(
      expect.arrayContaining(['billing:admin', 'orders:create']),
    );
  });

  it('customer is NOT granted orders:write, shipping:write, billing:write, or billing:admin', () => {
    const granted = expand(['customer']);
    expect(granted.has('orders:write')).toBe(false);
    expect(granted.has('shipping:write')).toBe(false);
    expect(granted.has('billing:write')).toBe(false);
    expect(granted.has('billing:admin')).toBe(false);
  });
});

describe('OrderController route gates — Defect A regression (F11)', () => {
  const realReflector = new Reflector();
  const customerActor: AuthenticatedUser = {
    id: 'cust-1',
    roles: ['customer'],
  };

  const ctxForController = (
    method: (...args: never[]) => unknown,
    user: AuthenticatedUser,
  ): ExecutionContext =>
    ({
      getHandler: () => method,
      getClass: () => OrderController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  // These pull the actual controller method references so the test breaks
  // if a future edit changes the real `@Roles(...)` metadata — never called
  // with a `this` context, only handed to `Reflect.getMetadata` via
  // `ctx.getHandler()`, exactly like NestJS's real `RolesGuard` does.
  /* eslint-disable @typescript-eslint/unbound-method */
  it('POST /v1/orders is reachable by a customer-role token', () => {
    const guard = new RolesGuard(realReflector);

    expect(
      guard.canActivate(
        ctxForController(OrderController.prototype.create, customerActor),
      ),
    ).toBe(true);
  });

  it.each([
    ['update', OrderController.prototype.update],
    ['confirm', OrderController.prototype.confirm],
    ['prepare', OrderController.prototype.prepare],
    ['cancel', OrderController.prototype.cancel],
    ['addPayment', OrderController.prototype.addPayment],
  ] as const)(
    '%s stays closed to a customer-role token (orders:write only) — no widening beyond create',
    (_name, method) => {
      const guard = new RolesGuard(realReflector);

      expect(() =>
        guard.canActivate(ctxForController(method, customerActor)),
      ).toThrow(ForbiddenException);
    },
  );
});

describe('ShippingController route gates — F9', () => {
  const realReflector = new Reflector();
  // `customer` expands to exactly `orders:create` and `shipping:read`.
  const customerActor: AuthenticatedUser = {
    id: 'cust-1',
    roles: ['customer'],
  };

  const ctxForController = (
    method: (...args: never[]) => unknown,
    user: AuthenticatedUser,
  ): ExecutionContext =>
    ({
      getHandler: () => method,
      getClass: () => ShippingController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  /* eslint-disable @typescript-eslint/unbound-method */
  it('quoting an order is reachable with shipping:read alone', () => {
    const guard = new RolesGuard(realReflector);
    expect(
      guard.canActivate(
        ctxForController(ShippingController.prototype.quote, customerActor),
      ),
    ).toBe(true);
  });

  it('reading the shipment for an order is reachable with shipping:read', () => {
    const guard = new RolesGuard(realReflector);
    expect(
      guard.canActivate(
        ctxForController(ShippingController.prototype.byOrder, customerActor),
      ),
    ).toBe(true);
  });

  it('reading tracking is reachable with shipping:read', () => {
    const guard = new RolesGuard(realReflector);
    expect(
      guard.canActivate(
        ctxForController(ShippingController.prototype.tracking, customerActor),
      ),
    ).toBe(true);
  });

  // Both buy or void a real Skydropx label and cost real money, so widening
  // the quote gate must not drag them along.
  it('creating a shipment still rejects a shipping:read-only caller', () => {
    const guard = new RolesGuard(realReflector);
    expect(() =>
      guard.canActivate(
        ctxForController(
          ShippingController.prototype.createShipment,
          customerActor,
        ),
      ),
    ).toThrow();
  });

  it('cancelling a shipment still rejects a shipping:read-only caller', () => {
    const guard = new RolesGuard(realReflector);
    expect(() =>
      guard.canActivate(
        ctxForController(ShippingController.prototype.cancel, customerActor),
      ),
    ).toThrow();
  });
  /* eslint-enable @typescript-eslint/unbound-method */
});
