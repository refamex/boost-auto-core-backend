import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryRepository,
} from '../ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';
import {
  InsufficientStockError,
  InventoryNotFoundError,
} from '../../domain/errors';
import { ReserveStockUseCase } from './reserve-stock.use-case';
import { ReleaseStockUseCase } from './release-stock.use-case';
import { AdjustStockUseCase } from './adjust-stock.use-case';

const makeAggregate = (stock = 10, reserved = 0) =>
  Inventory.fromSnapshot({
    id: 42,
    productSku: 'SKU-A',
    providerSku: 'PRV-A',
    providerBranchId: 1,
    stock,
    reservedStock: reserved,
  });

const buildMockRepo = (
  initialStock: number,
  initialReserved: number,
): InventoryRepository => {
  let aggregate = makeAggregate(initialStock, initialReserved);
  return {
    list: jest.fn(),
    findById: jest.fn(),
    findBySkuAndBranch: jest.fn(),
    create: jest.fn(),
    summaryBySku: jest.fn(),
    findExistingProductSkus: jest.fn(),
    bulkUpsertStock: jest.fn(),
    zeroOutMissing: jest.fn(),
    mutate: jest.fn(async (id: number, fn) => {
      if (id !== 42) throw new InventoryNotFoundError(id);
      const result = fn(aggregate);
      // persist by rebuilding from snapshot (mimic repo behavior)
      aggregate = Inventory.fromSnapshot(aggregate.toSnapshot());
      return { inventory: aggregate, result };
    }),
  };
};

describe('Inventory use cases', () => {
  describe('ReserveStockUseCase', () => {
    it('reserves through the aggregate', async () => {
      const repo = buildMockRepo(10, 0);
      const moduleRef = await Test.createTestingModule({
        providers: [
          ReserveStockUseCase,
          { provide: INVENTORY_REPOSITORY, useValue: repo },
        ],
      }).compile();

      const uc = moduleRef.get(ReserveStockUseCase);
      const result = await uc.execute(42, 3);
      expect(result.reservedStock).toBe(3);
      expect(result.available).toBe(7);
    });

    it('propagates InsufficientStockError', async () => {
      const repo = buildMockRepo(10, 8);
      const moduleRef = await Test.createTestingModule({
        providers: [
          ReserveStockUseCase,
          { provide: INVENTORY_REPOSITORY, useValue: repo },
        ],
      }).compile();

      const uc = moduleRef.get(ReserveStockUseCase);
      await expect(uc.execute(42, 5)).rejects.toThrow(InsufficientStockError);
    });

    it('propagates InventoryNotFoundError', async () => {
      const repo = buildMockRepo(10, 0);
      const moduleRef = await Test.createTestingModule({
        providers: [
          ReserveStockUseCase,
          { provide: INVENTORY_REPOSITORY, useValue: repo },
        ],
      }).compile();

      const uc = moduleRef.get(ReserveStockUseCase);
      await expect(uc.execute(999, 1)).rejects.toThrow(InventoryNotFoundError);
    });
  });

  describe('ReleaseStockUseCase', () => {
    it('releases reserved', async () => {
      const repo = buildMockRepo(10, 5);
      const moduleRef = await Test.createTestingModule({
        providers: [
          ReleaseStockUseCase,
          { provide: INVENTORY_REPOSITORY, useValue: repo },
        ],
      }).compile();

      const uc = moduleRef.get(ReleaseStockUseCase);
      const result = await uc.execute(42, 3);
      expect(result.reservedStock).toBe(2);
    });
  });

  describe('AdjustStockUseCase', () => {
    it('applies delta and logs reason', async () => {
      const repo = buildMockRepo(10, 0);
      const moduleRef = await Test.createTestingModule({
        providers: [
          AdjustStockUseCase,
          { provide: INVENTORY_REPOSITORY, useValue: repo },
        ],
      }).compile();

      const uc = moduleRef.get(AdjustStockUseCase);
      const result = await uc.execute(42, -3, 'merma', 'user-1');
      expect(result.stock).toBe(7);
    });
  });
});
