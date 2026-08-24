import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderService } from './order.service';

const ORDER_ID = 'order-1';

const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };

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
  const events = { emit: jest.fn() };

  let service: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderService(
      orderRepo as never,
      {} as never,
      paymentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
