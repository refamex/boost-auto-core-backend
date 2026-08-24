import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../domain/entities/order.entity';
import { CreateOrderDto } from '../../infrastructure/http/dto/order.dto';
import { OrderService } from './order.service';

const ORDER_ID = 'order-1';

const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };
const staff: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };

function makeOrder(over: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: ORDER_ID,
    orderNumber: 'ORD-1',
    customerId: 'customer-1',
    status: 'draft',
    items: [],
    ...over,
  } as OrderEntity;
}

function makeCreateDto(over: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return {
    customerId: 'customer-1',
    items: [{ productId: 1, qty: 1, unitPrice: 100 }],
    ...over,
  };
}

describe('OrderService', () => {
  const orderRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    merge: jest.fn((existing: object, dto: object) => ({
      ...existing,
      ...dto,
    })),
  };
  const paymentRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const productRepo = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 1, sku: 'SKU-1', name: 'Widget' }]),
  };
  // `create`/`createInternal` run inside `this.dataSource.transaction`,
  // which hands the callback a `tx` exposing `getRepository` — same shape
  // `quote.service.spec.ts` uses for its own transactional save.
  const orderTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) =>
      Promise.resolve({ id: ORDER_ID, ...(x as object) }),
    ),
    findOne: jest.fn(),
  };
  const itemTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const txRepos = {
    getRepository: jest.fn((entity: unknown) =>
      entity === OrderEntity ? orderTxRepo : itemTxRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(txRepos)),
  };
  const reserveStock = { execute: jest.fn() };
  // Was `{}` before. `reserveForOrder` only reaches the stock use case after
  // resolving each item through this port, so leaving it unimplemented made
  // the confirmed-status branch unobservable from a test.
  const inventoryRepo = { findBySkuAndBranch: jest.fn() };
  const events = { emit: jest.fn() };

  let service: OrderService;

  // `persist` re-fetches the row after saving and reserves stock only when
  // that readback says `confirmed`. Pointing `findOne` at a hardcoded status
  // decouples the readback from what was actually written, which makes any
  // assertion about the reservation branch pass regardless of the persisted
  // status. This mirrors the readback to the last saved payload instead.
  function readBackPersistedOrder(): void {
    orderTxRepo.findOne.mockImplementation(() => {
      const saved = orderTxRepo.save.mock.calls.at(-1)?.[0] as
        | Partial<OrderEntity>
        | undefined;
      return Promise.resolve(
        makeOrder({
          status: saved?.status ?? 'draft',
          // Both required for `reserveForOrder` to get as far as the stock
          // use case; without them it returns early and a confirmed order
          // would look identical to a draft one.
          providerBranchId: 7,
          items: [{ skuSnapshot: 'SKU-1', qty: 1 }],
        } as Partial<OrderEntity>),
      );
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    productRepo.find.mockResolvedValue([{ id: 1, sku: 'SKU-1', name: 'Widget' }]);
    inventoryRepo.findBySkuAndBranch.mockResolvedValue({ id: 10 });
    orderTxRepo.findOne.mockResolvedValue(makeOrder());
    service = new OrderService(
      orderRepo as never,
      {} as never,
      paymentRepo as never,
      productRepo as never,
      dataSource as never,
      reserveStock as never,
      {} as never,
      inventoryRepo as never,
      events as never,
    );
  });

  describe('list', () => {
    it('short-circuits to an empty page without querying when the requested customerId is not the caller own', async () => {
      const result = await service.list(customer, {
        customerId: 'someone-else',
      });
      expect(result).toEqual([]);
      expect(orderRepo.find).not.toHaveBeenCalled();
    });

    it('queries scoped by the shared ownership predicate otherwise', async () => {
      orderRepo.find.mockResolvedValue([makeOrder()]);
      await service.list(customer, {});
      expect(orderRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
    });
  });

  describe('findById', () => {
    it('returns 404, never a forbidden error, when ownership excludes the row', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(ORDER_ID, customer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies the same predicate list uses', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder());
      await service.findById(ORDER_ID, customer);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: ORDER_ID },
        }),
      );
    });
  });

  describe('create', () => {
    it('binds a customer caller to their own id and forces draft, ignoring dto.status, and never reserves stock (F8)', async () => {
      readBackPersistedOrder();

      await service.create(makeCreateDto({ status: 'confirmed' }), customer);

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'customer-1', status: 'draft' }),
      );
      expect(reserveStock.execute).not.toHaveBeenCalled();
    });

    it('rejects a customer supplying a mismatching customerId with 403, and writes no row (F10)', async () => {
      await expect(
        service.create(makeCreateDto({ customerId: 'someone-else' }), customer),
      ).rejects.toThrow(ForbiddenException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('throws 403 when called with no actor at all', async () => {
      await expect(
        service.create(makeCreateDto(), undefined as unknown as AuthenticatedUser),
      ).rejects.toThrow(ForbiddenException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('lets staff keep explicit control of customerId and status, unchanged', async () => {
      readBackPersistedOrder();

      await service.create(makeCreateDto({ customerId: 'someone-else' }), staff);

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'someone-else', status: 'draft' }),
      );
    });

    // The staff case above passes a DTO with no status, so `draft` is what
    // `bindCreate` defaults to anyway — it cannot tell whether `persist`
    // actually threads the bound status through. This one can: it is the
    // only test where the expected status differs from the default.
    it('carries a staff-supplied non-default status through to the persisted row and into the reservation branch', async () => {
      readBackPersistedOrder();

      await service.create(
        makeCreateDto({ customerId: 'someone-else', status: 'confirmed' }),
        staff,
      );

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'someone-else',
          status: 'confirmed',
        }),
      );
      expect(reserveStock.execute).toHaveBeenCalled();
    });
  });

  describe('createInternal', () => {
    it('applies no ownership binding and defaults no contact email (Defect B)', async () => {
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await service.createInternal(makeCreateDto({ customerId: 'quote-customer' }));

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'quote-customer',
          shipToEmail: undefined,
        }),
      );
    });
  });

  // Trap verification (task 6.3): each of the five internal write callers
  // must still resolve the order through the unscoped `loadForWrite` path —
  // a plain `findOne({ where: { id } })`, not `loadVisible`'s ownership filter.
  describe('internal write callers still resolve unscoped', () => {
    beforeEach(() => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ providerBranchId: 1 }));
    });

    it('update', async () => {
      await service.update(ORDER_ID, { status: 'draft' });
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('confirm', async () => {
      await service.confirm(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('prepare', async () => {
      orderRepo.findOne.mockResolvedValue(
        makeOrder({ status: 'confirmed', providerBranchId: 1 }),
      );
      await service.prepare(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('cancel', async () => {
      await service.cancel(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('addPayment', async () => {
      await service.addPayment(ORDER_ID, { amount: 100, status: 'pending' });
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });
  });
});
