import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { expand } from '../../../../shared/auth/role-permissions';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { QuoteService } from '../../application/services/quote.service';
import { QuoteQueryDto } from './dto/quote.dto';
import { QuoteController } from './quote.controller';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE_ID = '33333333-3333-4333-8333-333333333333';

/** A storefront customer carries the macro identity role issued by auth. */
const customer: AuthenticatedUser = { id: CUSTOMER_ID, roles: ['customer'] };
const rep: AuthenticatedUser = { id: 'rep-user', roles: ['quotes:read'] };

type Handler = (...args: any[]) => unknown;

const handlerOf = (name: string): Handler =>
  (QuoteController.prototype as unknown as Record<string, Handler>)[name];

/** `Reflect.getMetadata` is typed `any`; narrow it once, here. */
function metadataOf<T>(key: string, name: string): T | undefined {
  return Reflect.getMetadata(key, handlerOf(name)) as T | undefined;
}

function contextFor(name: string, user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => handlerOf(name),
    getClass: () => QuoteController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Method names in definition order, filtered to those carrying a route. */
const routeMethods = (): string[] =>
  Object.getOwnPropertyNames(QuoteController.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      metadataOf<string>(PATH_METADATA, name) !== undefined,
  );

const getRoutePaths = (): string[] =>
  routeMethods()
    .filter(
      (name) => metadataOf<number>(METHOD_METADATA, name) === RequestMethod.GET,
    )
    .map((name) => metadataOf<string>(PATH_METADATA, name) ?? '');

describe('QuoteController — customer access', () => {
  const guard = new RolesGuard(new Reflector());

  describe('why the dedicated routes exist', () => {
    it('the customer macro role does not grant quotes:read', () => {
      // The whole reason `me` routes exist. Widening this instead would also
      // open the unfiltered staff route below, so it must stay false.
      expect(expand(['customer']).has('quotes:read')).toBe(false);
    });

    it('rejects a customer on the staff list route', () => {
      expect(() => guard.canActivate(contextFor('list', customer))).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a customer on the staff detail route', () => {
      expect(() => guard.canActivate(contextFor('findById', customer))).toThrow(
        ForbiddenException,
      );
    });

    it('still admits a staff reader on the staff routes', () => {
      expect(guard.canActivate(contextFor('list', rep))).toBe(true);
      expect(guard.canActivate(contextFor('findById', rep))).toBe(true);
    });
  });

  describe('routing', () => {
    it('admits a customer on both me routes', () => {
      expect(guard.canActivate(contextFor('listMine', customer))).toBe(true);
      expect(guard.canActivate(contextFor('findMineById', customer))).toBe(
        true,
      );
    });

    it('declares the me routes before the bare :id route', () => {
      // Nest matches in declaration order: `:id` first would swallow
      // `/v1/quotes/me` and call findById('me').
      const paths = getRoutePaths();
      expect(paths).toContain('me');
      expect(paths).toContain('me/:id');
      expect(paths.indexOf('me')).toBeLessThan(paths.indexOf(':id'));
      expect(paths.indexOf('me/:id')).toBeLessThan(paths.indexOf(':id'));
    });
  });

  describe('delegation', () => {
    // Held as standalone mocks rather than read back off the service object:
    // `expect(svc.list)` passes an unbound method reference around, which is
    // exactly what @typescript-eslint/unbound-method exists to catch.
    const list = jest.fn();
    const findById = jest.fn();
    const controller = new QuoteController({
      list,
      findById,
    } as unknown as QuoteService);

    beforeEach(() => {
      list.mockReset();
      findById.mockReset();
    });

    it('passes the caller straight through to list', async () => {
      const query = { page: 1, limit: 20 } as QuoteQueryDto;
      await controller.listMine(customer, query);
      // Ownership scoping is the service's job (buildWhere), not the route's.
      expect(list).toHaveBeenCalledWith(customer, query);
    });

    it('passes the caller straight through to findById', async () => {
      await controller.findMineById(QUOTE_ID, customer);
      expect(findById).toHaveBeenCalledWith(QUOTE_ID, customer);
    });
  });
});
